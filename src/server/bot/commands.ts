import { Client } from 'tmi.js';
import { getDb } from '../db/index';
import { startVote, castVote, getActiveVote, endVote } from './voting';
import { StreamState, Issue } from '../../shared/types';
import { changeScene, getScenes } from '../obs/index';
import { broadcast } from '../websocket/index';
import { resolveOEmbed } from '../api/song-requests';
import { parseSongUrl } from '../song-url';
import { standingsText } from '../leaderboards';
import { sayInParts } from './chat-message';
import { builtinKeyOf, triggerOf, canonicalTrigger } from './command-names';
import { commandEnabled } from '../features';
import { answerChatMessage } from './chat-answers';
import { builtinCooldownSeconds, INFO_BUILTINS, passCooldown } from './cooldown';
import { botHelix, shoutoutText } from './shoutout';
import { adjustReply } from '../points/chat';
import { parseRedeem, redeem } from '../points/redeem';

/** Built-ins that answer through answerChatMessage, which applies the info cooldown itself. */
const ANSWERED_IN_CHAT_ANSWERS: ReadonlySet<string> = new Set(['commands', 'uptime', 'privacy', 'points', 'rewards_list']);

/** Broadcaster and mods — the people allowed to steer the stream from chat. */
function isPrivileged(tags: { mod?: boolean; badges?: { broadcaster?: string } | null }): boolean {
  return !!tags.mod || tags.badges?.broadcaster === '1';
}

export function registerCommands(client: Client) {
  client.on('message', async (channel, tags, message, self) => {
    if (self) return;
    if (!message.startsWith('!')) return;

    // Every reply goes out through the splitter, so none can exceed Twitch's limit.
    const say = (text: string) => void sayInParts(client, channel, text);

    const input = canonicalTrigger(triggerOf(message));
    const command = builtinKeyOf(input);
    // A built-in of a feature that is off ("Was dein Stream kann") is not there for the chat.
    if (command !== null && !commandEnabled(command)) return;

    // The built-ins that only tell something share one cooldown. The ones that
    // answer in chat-answers.ts are gated there — checked here as well, the
    // second check saw the first one's cooldown and `!datenschutz` never
    // answered a viewer (found 2026-10-08).
    if (command !== null && INFO_BUILTINS.has(command) && !ANSWERED_IN_CHAT_ANSWERS.has(command)
      && !passCooldown(`builtin:${command}`, builtinCooldownSeconds(), isPrivileged(tags), { viewer: tags.username })) return;

    switch (command) {
      case 'shoutout': {
        if (!isPrivileged(tags)) break;
        const name = message.trim().split(/\s+/)[1] ?? '';
        say(await shoutoutText(name, botHelix() ?? (async () => null)));
        break;
      }

      case 'challenge': {
        const state = getDb().prepare('SELECT * FROM stream_state WHERE id = 1').get() as StreamState;
        if (!state.challenge_title) {
          say('Keine Challenge aktiv.');
        } else {
          const statusEmoji = state.challenge_status === 'in_progress' ? '🔴' : state.challenge_status === 'done' ? '🟢' : state.challenge_status === 'failed' ? '❌' : '⏸️';
          say(`${statusEmoji} Challenge: ${state.challenge_title} [${state.challenge_status}]`);
        }
        break;
      }

      case 'issues': {
        const bugs = getDb().prepare('SELECT * FROM issues WHERE status = ? ORDER BY created_at DESC LIMIT 5').all('open') as Issue[];
        if (bugs.length === 0) {
          say('Keine offenen Issues! 🎉');
        } else {
          const list = bugs.map((b, i) => `${i + 1}. ${b.title}`).join(' | ');
          say(`⚠️ Offene Issues (${bugs.length}): ${list}`);
        }
        break;
      }

      case 'song': {
        const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get('current_song') as { value: string } | undefined;
        if (row?.value) {
          try {
            const d = JSON.parse(row.value) as { title: string; artist?: string };
            say(`🎵 ${d.artist ? d.artist + ' — ' : ''}${d.title}`);
          } catch {
            say(`🎵 ${row.value}`);
          }
        } else {
          say('🎵 Kein Song aktiv.');
        }
        break;
      }

      case 'hype': {
        broadcast('compile-pray', { user: tags['display-name'] || tags.username || 'Chat' });
        say('🙌 HYPE MOMENT!');
        break;
      }

      case 'design': {
        // Starting, ending or reading out a vote is the streamer's and the mods' call.
        if (!isPrivileged(tags)) break;
        const args = message.trim().split(/\s+/).slice(1);
        const subCommand = args[0]?.toLowerCase();

        if (subCommand === 'start') {
          const duration = parseInt(args[1], 10) || 60;
          const options = args.slice(2);
          if (options.length < 2) {
            say('❌ Mindestens 2 Optionen: !design start 60 option1 option2 ...');
            break;
          }
          const success = startVote('🗳️ Abstimmung', options, duration);
          if (success) {
            say(`🎨 ABSTIMMUNG! Schreibt !vote <option> — Optionen: ${options.join(', ')} — ${duration}s Zeit!`);
          } else {
            say('❌ Es läuft bereits eine Abstimmung!');
          }
        } else if (subCommand === 'end') {
          const result = endVote();
          if (result) {
            const sorted = Object.entries(result.counts).sort((a, b) => b[1] - a[1]);
            const resultText = sorted.map(([opt, count]) => `${opt}: ${count}`).join(' | ');
            say(`🎨 ERGEBNIS: ${resultText} — Gewinner: ${result.winner} 🏆`);
          } else {
            say('❌ Keine aktive Abstimmung.');
          }
        } else if (subCommand === 'status') {
          const vote = getActiveVote();
          if (vote) {
            const countsText = vote.options.map((o) => `${o}: ${vote.counts[o] || 0}`).join(' | ');
            say(`🎨 Abstimmung: ${countsText} — noch ${vote.remaining}s`);
          } else {
            say('❌ Keine aktive Abstimmung.');
          }
        } else {
          say('🎨 Befehle: !design start <sekunden> <opt1> <opt2> ... | !design end | !design status');
        }
        break;
      }

      case 'todo': {
        const activeItem = getDb().prepare('SELECT * FROM project_items WHERE status = ?').get('in_progress') as { id: number; title: string } | undefined;
        if (!activeItem) {
          say('📋 Kein aktives Feature.');
          break;
        }
        const todos = getDb().prepare('SELECT * FROM todos WHERE parent_id = ? AND done = 0 ORDER BY sort_order ASC').all(activeItem.id) as Array<{ title: string }>;
        if (todos.length === 0) {
          say(`📋 ${activeItem.title} — Alle Aufgaben erledigt! 🎉`);
        } else {
          const list = todos.map((td, i) => `${i + 1}. ${td.title}`).join(' | ');
          say(`📋 ${activeItem.title}: ${list}`);
        }
        break;
      }

      case 'progress': {
        const state = getDb().prepare('SELECT project_name FROM stream_state WHERE id = 1').get() as { project_name: string | null };
        const items = getDb().prepare('SELECT * FROM project_items').all() as Array<{ status: string }>;
        const done = items.filter((i) => i.status === 'done').length;
        const total = items.length;
        const name = state?.project_name || 'Kein Projekt';
        say(`📊 ${name} — ${done}/${total} Features fertig`);
        break;
      }

      case 'scene': {
        if (!isPrivileged(tags)) {
          say('❌ Nur Mods und Broadcaster können Szenen wechseln!');
          break;
        }

        const sceneName = message.trim().split(/\s+/).slice(1).join(' ');
        if (!sceneName) {
          const scenes = await getScenes();
          if (scenes.length > 0) {
            say(`🎬 Verfügbare Szenen: ${scenes.join(', ')}`);
          } else {
            say('❌ OBS nicht verbunden oder keine Szenen gefunden.');
          }
          break;
        }

        const result = await changeScene(sceneName);
        if (result.success) {
          say(`🎬 Scene gewechselt zu: ${sceneName}`);
        } else {
          say(`❌ Scene-Wechsel fehlgeschlagen: ${result.error || 'Unbekannter Fehler'}`);
        }
        break;
      }

      case 'vote': {
        const option = message.trim().split(/\s+/).slice(1).join(' ');
        const username = tags['display-name'] || tags.username || 'anon';
        if (!option) {
          say('❌ Schreib !vote <option>');
          break;
        }
        const success = castVote(username, option);
        if (!success) {
          const vote = getActiveVote();
          if (!vote) {
            say('❌ Keine aktive Abstimmung.');
          } else {
            say(`❌ Ungültige Option. Wähle: ${vote.options.join(', ')}`);
          }
        }
        break;
      }

      case 'sr': {
        const word = message.trim().split(/\s+/)[1];
        const username = tags['display-name'] || tags.username || 'anon';
        if (!word) {
          say('❌ Benutzung: !sr <YouTube oder Spotify URL>');
          break;
        }
        // One link to one track, rebuilt from its id — never the viewer's raw text.
        const link = parseSongUrl(word);
        if (!link) {
          say('❌ Nur Links zu YouTube-Videos oder Spotify-Titeln.');
          break;
        }
        const url = link.url;
        // One request every 20 seconds per viewer: each costs a call to YouTube or Spotify.
        if (!passCooldown(`sr:${tags.username ?? username}`, 20, isPrivileged(tags), { viewer: tags.username })) break;
        try {
          const db = getDb();
          const maxRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('sr_max_per_user') as { value: string } | undefined;
          const max = parseInt(maxRow?.value || '2', 10);
          const count = db.prepare("SELECT COUNT(*) as c FROM song_requests WHERE requested_by = ? AND status = 'pending'").get(username) as { c: number };
          if (count.c >= max) {
            say(`❌ Du hast bereits ${max} Songs in der Queue, @${username}.`);
            break;
          }
          const meta = await resolveOEmbed(url);
          if (!meta) {
            say('❌ Konnte den Song nicht laden.');
            break;
          }
          db.prepare('INSERT INTO song_requests (url, title, artist, source, requested_by) VALUES (?, ?, ?, ?, ?)').run(url, meta.title, meta.artist, meta.source, username);
          const pos = db.prepare("SELECT COUNT(*) as c FROM song_requests WHERE status = 'pending'").get() as { c: number };
          broadcast('sr-update', {});
          say(`🎵 "${meta.title}" von @${username} zur Queue hinzugefügt (Position ${pos.c})`);
        } catch (err) {
          console.error('[SR] Error:', err);
          say('❌ Konnte den Song nicht laden.');
        }
        break;
      }

      case 'queue': {
        const db = getDb();
        const pending = db.prepare("SELECT title, requested_by FROM song_requests WHERE status = 'pending' ORDER BY created_at ASC LIMIT 3").all() as Array<{ title: string; requested_by: string }>;
        if (pending.length === 0) {
          say('🎵 Die Queue ist leer. Requeste mit !sr <URL>');
        } else {
          const list = pending.map((s, i) => `${i + 1}. "${s.title}" (@${s.requested_by})`).join(' | ');
          say(`🎵 Queue: ${list}`);
        }
        break;
      }

      case 'rewardstats': {
        const args = message.trim().split(' ').slice(1);
        // Only a login is looked up and echoed — never arbitrary text from the message.
        const asked = args[0]?.replace(/^@/, '') ?? '';
        const target = /^[a-z0-9_]{1,25}$/i.test(asked) ? asked : (tags.username || 'Unknown');
        say(standingsText(target));
        break;
      }

      // `!punkte geben|nehmen @name n` for mods; everything else is `!punkte [Name]` below.
      case 'points': {
        const adjusted = isPrivileged(tags) ? adjustReply(message) : null;
        if (adjusted !== null) { say(adjusted); break; }
        const answer = await answerChatMessage(message, isPrivileged(tags), tags.username);
        for (const reply of answer.replies ?? []) say(reply);
        break;
      }

      case 'redeem': {
        if (!tags.username) break;
        const { name, input } = parseRedeem(message.trim().replace(/^\S+\s*/, ''));
        if (!name) { say(`@${tags['display-name'] ?? tags.username} !einlösen <Name> — !belohnungen zeigt, was es gibt.`); break; }
        const result = await redeem(tags.username, tags['display-name'] ?? tags.username, name, input);
        say(result.message);
        break;
      }

      // `!befehle`, `!uptime`, Text Commands and Lookup Commands: the same path the app's "try it" box takes.
      case 'commands':
      default: {
        const answer = await answerChatMessage(message, isPrivileged(tags), tags.username);
        for (const reply of answer.replies ?? []) say(reply);
        break;
      }
    }
  });
}

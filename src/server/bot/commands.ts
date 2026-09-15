import { Client } from 'tmi.js';
import { getDb } from '../db/index';
import { startVote, castVote, getActiveVote, endVote } from './voting';
import { StreamState, Issue } from '../../shared/types';
import { changeScene, getScenes } from '../obs/index';
import { broadcast } from '../websocket/index';
import { resolveOEmbed, detectSource } from '../api/song-requests';
import { getActiveCharacter } from '../api/characters';
import { sayInParts } from './chat-message';
import { getCommandNames, triggerOf } from './command-names';
import { answerChatMessage } from './text-commands';

const startTime = Date.now();

function matchCommand(input: string, cmds: Record<string, string>): string | null {
  for (const [key, name] of Object.entries(cmds)) {
    if (input === name) return key;
  }
  return null;
}

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

    const input = triggerOf(message);
    const cmds = getCommandNames();
    const command = matchCommand(input, cmds);

    switch (command) {
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

      case 'uptime': {
        const uptime = Math.floor((Date.now() - startTime) / 1000 / 60);
        say(`⏱️ Stream läuft seit ${uptime} Minuten`);
        break;
      }

      case 'design': {
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

      case 'character': {
        const active = getActiveCharacter();
        if (!active) {
          say('👥 Gerade wird an keiner Figur gearbeitet.');
          break;
        }
        const role = active.role ? ` (${active.role})` : '';
        const summary = active.summary ? ` — ${active.summary}` : '';
        say(`👥 ${active.name}${role}${summary}`);
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
        const url = message.trim().split(/\s+/)[1];
        const username = tags['display-name'] || tags.username || 'anon';
        if (!url) {
          say('❌ Benutzung: !sr <YouTube oder Spotify URL>');
          break;
        }
        const source = detectSource(url);
        if (!source) {
          say('❌ Nur YouTube- und Spotify-Links erlaubt.');
          break;
        }
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
        const target = args[0] || tags['display-name'] || tags.username || 'Unknown';

        const byType = getDb().prepare(
          'SELECT reward_type, count FROM reward_stats WHERE user_name = ? ORDER BY count DESC'
        ).all(target.toLowerCase()) as Array<{ reward_type: string; count: number }>;

        if (byType.length === 0) {
          say(`@${target} hat noch keine Rewards eingelöst.`);
          break;
        }

        const total = byType.reduce((sum, r) => sum + r.count, 0);
        const breakdown = byType.map(r => `${r.reward_type}: ${r.count}`).join(', ');
        say(`@${target} — ${total} Rewards gesamt (${breakdown})`);
        break;
      }

      // `!befehle` and every Text Command: the same path the app's "try it" box takes.
      case 'commands':
      default: {
        const answer = answerChatMessage(message, isPrivileged(tags));
        for (const reply of answer.replies ?? []) say(reply);
        break;
      }
    }
  });
}

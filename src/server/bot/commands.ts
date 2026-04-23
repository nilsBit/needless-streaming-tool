import { Client } from 'tmi.js';
import { getDb } from '../db/index';
import { startVote, castVote, getActiveVote, endVote } from './voting';
import { StreamState, Issue } from '../../shared/types';
import { changeScene, getScenes } from '../obs/index';
import { broadcast } from '../websocket/index';
import { resolveOEmbed, detectSource } from '../api/song-requests';

const startTime = Date.now();

// Default command names — can be overridden via settings
const DEFAULT_COMMANDS: Record<string, string> = {
  challenge: '!challenge',
  issues: '!issues',
  song: '!song',
  hype: '!hype',
  uptime: '!uptime',
  design: '!design',
  todo: '!todo',
  progress: '!progress',
  scene: '!scene',
  vote: '!vote',
  sr: '!sr',
  queue: '!queue',
  rewardstats: '!stats',
};

function getCommandNames(): Record<string, string> {
  try {
    const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get('custom_commands') as { value: string } | undefined;
    if (row?.value) {
      const custom = JSON.parse(row.value) as Record<string, string>;
      return { ...DEFAULT_COMMANDS, ...custom };
    }
  } catch {}
  return { ...DEFAULT_COMMANDS };
}

function matchCommand(input: string, cmds: Record<string, string>): string | null {
  for (const [key, name] of Object.entries(cmds)) {
    if (input === name) return key;
  }
  return null;
}

export function registerCommands(client: Client) {
  client.on('message', async (channel, tags, message, self) => {
    if (self) return;
    if (!message.startsWith('!')) return;

    const input = message.trim().toLowerCase().split(' ')[0];
    const cmds = getCommandNames();
    const command = matchCommand(input, cmds);

    switch (command) {
      case 'challenge': {
        const state = getDb().prepare('SELECT * FROM stream_state WHERE id = 1').get() as StreamState;
        if (!state.challenge_title) {
          client.say(channel, 'Keine Challenge aktiv.');
        } else {
          const statusEmoji = state.challenge_status === 'in_progress' ? '🔴' : state.challenge_status === 'done' ? '🟢' : state.challenge_status === 'failed' ? '❌' : '⏸️';
          client.say(channel, `${statusEmoji} Challenge: ${state.challenge_title} [${state.challenge_status}]`);
        }
        break;
      }

      case 'issues': {
        const bugs = getDb().prepare('SELECT * FROM issues WHERE status = ? ORDER BY created_at DESC LIMIT 5').all('open') as Issue[];
        if (bugs.length === 0) {
          client.say(channel, 'Keine offenen Issues! 🎉');
        } else {
          const list = bugs.map((b, i) => `${i + 1}. ${b.title}`).join(' | ');
          client.say(channel, `⚠️ Offene Issues (${bugs.length}): ${list}`);
        }
        break;
      }

      case 'song': {
        const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get('current_song') as { value: string } | undefined;
        if (row?.value) {
          try {
            const d = JSON.parse(row.value) as { title: string; artist?: string };
            client.say(channel, `🎵 ${d.artist ? d.artist + ' — ' : ''}${d.title}`);
          } catch {
            client.say(channel, `🎵 ${row.value}`);
          }
        } else {
          client.say(channel, '🎵 Kein Song aktiv.');
        }
        break;
      }

      case 'hype': {
        broadcast('compile-pray', { user: tags['display-name'] || tags.username || 'Chat' });
        client.say(channel, '🙌 HYPE MOMENT!');
        break;
      }

      case 'uptime': {
        const uptime = Math.floor((Date.now() - startTime) / 1000 / 60);
        client.say(channel, `⏱️ Stream läuft seit ${uptime} Minuten`);
        break;
      }

      case 'design': {
        const args = message.trim().split(/\s+/).slice(1);
        const subCommand = args[0]?.toLowerCase();

        if (subCommand === 'start') {
          const duration = parseInt(args[1], 10) || 60;
          const options = args.slice(2);
          if (options.length < 2) {
            client.say(channel, '❌ Mindestens 2 Optionen: !design start 60 option1 option2 ...');
            break;
          }
          const success = startVote('🎨 Chat Design', options, duration);
          if (success) {
            client.say(channel, `🎨 ABSTIMMUNG! Schreibt !vote <option> — Optionen: ${options.join(', ')} — ${duration}s Zeit!`);
          } else {
            client.say(channel, '❌ Es läuft bereits eine Abstimmung!');
          }
        } else if (subCommand === 'end') {
          const result = endVote();
          if (result) {
            const sorted = Object.entries(result.counts).sort((a, b) => b[1] - a[1]);
            const resultText = sorted.map(([opt, count]) => `${opt}: ${count}`).join(' | ');
            client.say(channel, `🎨 ERGEBNIS: ${resultText} — Gewinner: ${result.winner} 🏆`);
          } else {
            client.say(channel, '❌ Keine aktive Abstimmung.');
          }
        } else if (subCommand === 'status') {
          const vote = getActiveVote();
          if (vote) {
            const countsText = vote.options.map((o) => `${o}: ${vote.counts[o] || 0}`).join(' | ');
            client.say(channel, `🎨 Abstimmung: ${countsText} — noch ${vote.remaining}s`);
          } else {
            client.say(channel, '❌ Keine aktive Abstimmung.');
          }
        } else {
          client.say(channel, '🎨 Befehle: !design start <sekunden> <opt1> <opt2> ... | !design end | !design status');
        }
        break;
      }

      case 'todo': {
        const activeItem = getDb().prepare('SELECT * FROM project_items WHERE status = ?').get('in_progress') as { id: number; title: string } | undefined;
        if (!activeItem) {
          client.say(channel, '📋 Kein aktives Feature.');
          break;
        }
        const todos = getDb().prepare('SELECT * FROM todos WHERE parent_id = ? AND done = 0 ORDER BY sort_order ASC').all(activeItem.id) as Array<{ title: string }>;
        if (todos.length === 0) {
          client.say(channel, `📋 ${activeItem.title} — Alle Aufgaben erledigt! 🎉`);
        } else {
          const list = todos.map((td, i) => `${i + 1}. ${td.title}`).join(' | ');
          client.say(channel, `📋 ${activeItem.title}: ${list}`);
        }
        break;
      }

      case 'progress': {
        const state = getDb().prepare('SELECT project_name FROM stream_state WHERE id = 1').get() as { project_name: string | null };
        const items = getDb().prepare('SELECT * FROM project_items').all() as Array<{ status: string }>;
        const done = items.filter((i) => i.status === 'done').length;
        const total = items.length;
        const name = state?.project_name || 'Kein Projekt';
        client.say(channel, `📊 ${name} — ${done}/${total} Features fertig`);
        break;
      }

      case 'scene': {
        const isMod = tags.mod || tags.badges?.broadcaster === '1';
        if (!isMod) {
          client.say(channel, '❌ Nur Mods und Broadcaster können Szenen wechseln!');
          break;
        }

        const sceneName = message.trim().split(/\s+/).slice(1).join(' ');
        if (!sceneName) {
          const scenes = await getScenes();
          if (scenes.length > 0) {
            client.say(channel, `🎬 Verfügbare Szenen: ${scenes.join(', ')}`);
          } else {
            client.say(channel, '❌ OBS nicht verbunden oder keine Szenen gefunden.');
          }
          break;
        }

        const result = await changeScene(sceneName);
        if (result.success) {
          client.say(channel, `🎬 Scene gewechselt zu: ${sceneName}`);
        } else {
          client.say(channel, `❌ Scene-Wechsel fehlgeschlagen: ${result.error || 'Unbekannter Fehler'}`);
        }
        break;
      }

      case 'vote': {
        const option = message.trim().split(/\s+/).slice(1).join(' ');
        const username = tags['display-name'] || tags.username || 'anon';
        if (!option) {
          client.say(channel, '❌ Schreib !vote <option>');
          break;
        }
        const success = castVote(username, option);
        if (!success) {
          const vote = getActiveVote();
          if (!vote) {
            client.say(channel, '❌ Keine aktive Abstimmung.');
          } else {
            client.say(channel, `❌ Ungültige Option. Wähle: ${vote.options.join(', ')}`);
          }
        }
        break;
      }

      case 'sr': {
        const url = message.trim().split(/\s+/)[1];
        const username = tags['display-name'] || tags.username || 'anon';
        if (!url) {
          client.say(channel, '❌ Benutzung: !sr <YouTube oder Spotify URL>');
          break;
        }
        const source = detectSource(url);
        if (!source) {
          client.say(channel, '❌ Nur YouTube- und Spotify-Links erlaubt.');
          break;
        }
        try {
          const db = getDb();
          const maxRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('sr_max_per_user') as { value: string } | undefined;
          const max = parseInt(maxRow?.value || '2', 10);
          const count = db.prepare("SELECT COUNT(*) as c FROM song_requests WHERE requested_by = ? AND status = 'pending'").get(username) as { c: number };
          if (count.c >= max) {
            client.say(channel, `❌ Du hast bereits ${max} Songs in der Queue, @${username}.`);
            break;
          }
          const meta = await resolveOEmbed(url);
          if (!meta) {
            client.say(channel, '❌ Konnte den Song nicht laden.');
            break;
          }
          db.prepare('INSERT INTO song_requests (url, title, artist, source, requested_by) VALUES (?, ?, ?, ?, ?)').run(url, meta.title, meta.artist, meta.source, username);
          const pos = db.prepare("SELECT COUNT(*) as c FROM song_requests WHERE status = 'pending'").get() as { c: number };
          broadcast('sr-update', {});
          client.say(channel, `🎵 "${meta.title}" von @${username} zur Queue hinzugefügt (Position ${pos.c})`);
        } catch (err) {
          console.error('[SR] Error:', err);
          client.say(channel, '❌ Konnte den Song nicht laden.');
        }
        break;
      }

      case 'queue': {
        const db = getDb();
        const pending = db.prepare("SELECT title, requested_by FROM song_requests WHERE status = 'pending' ORDER BY created_at ASC LIMIT 3").all() as Array<{ title: string; requested_by: string }>;
        if (pending.length === 0) {
          client.say(channel, '🎵 Die Queue ist leer. Requeste mit !sr <URL>');
        } else {
          const list = pending.map((s, i) => `${i + 1}. "${s.title}" (@${s.requested_by})`).join(' | ');
          client.say(channel, `🎵 Queue: ${list}`);
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
          client.say(channel, `@${target} hat noch keine Rewards eingelöst.`);
          break;
        }

        const total = byType.reduce((sum, r) => sum + r.count, 0);
        const breakdown = byType.map(r => `${r.reward_type}: ${r.count}`).join(', ');
        client.say(channel, `@${target} — ${total} Rewards gesamt (${breakdown})`);
        break;
      }
    }
  });
}

import { Client } from 'tmi.js';
import { getDb } from '../db/index';
import { startVote, castVote, getActiveVote, endVote } from './voting';
import { StreamState, Bug, Todo } from '../../shared/types';
import { changeScene, getScenes } from '../obs/index';

const startTime = Date.now();

export function registerCommands(client: Client) {
  client.on('message', async (channel, tags, message, self) => {
    if (self) return;
    if (!message.startsWith('!')) return;

    const command = message.trim().toLowerCase().split(' ')[0];

    switch (command) {
      case '!experiment': {
        const state = getDb().prepare('SELECT * FROM stream_state WHERE id = 1').get() as StreamState;
        if (!state.experiment_title) {
          client.say(channel, 'Kein Experiment aktiv.');
        } else {
          const statusEmoji = state.experiment_status === 'in_progress' ? '🔴' : state.experiment_status === 'done' ? '🟢' : state.experiment_status === 'failed' ? '❌' : '⏸️';
          client.say(channel, `${statusEmoji} Experiment: ${state.experiment_title} [${state.experiment_status}]`);
        }
        break;
      }

      case '!bugs': {
        const bugs = getDb().prepare('SELECT * FROM bugs WHERE status = ? ORDER BY created_at DESC LIMIT 5').all('open') as Bug[];
        if (bugs.length === 0) {
          client.say(channel, 'Keine offenen Bugs! 🎉');
        } else {
          const list = bugs.map((b, i) => `${i + 1}. ${b.title}`).join(' | ');
          client.say(channel, `🐛 Offene Bugs (${bugs.length}): ${list}`);
        }
        break;
      }

      case '!song': {
        client.say(channel, '🎵 Song Requests kommen bald!');
        break;
      }

      case '!uptime': {
        const uptime = Math.floor((Date.now() - startTime) / 1000 / 60);
        client.say(channel, `⏱️ Stream läuft seit ${uptime} Minuten`);
        break;
      }

      case '!design': {
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

      case '!todo': {
        const todos = getDb().prepare('SELECT * FROM todos WHERE done = 0').all() as Todo[];
        if (todos.length === 0) {
          client.say(channel, '📋 Keine Todos!');
        } else {
          const list = todos.map((t, i) => `${i + 1}. ${t.title}`).join(' | ');
          client.say(channel, `📋 Todos: ${list}`);
        }
        break;
      }

      case '!progress': {
        const state = getDb().prepare('SELECT project_name FROM stream_state WHERE id = 1').get() as { project_name: string | null };
        const items = getDb().prepare('SELECT * FROM project_items').all() as Array<{ status: string }>;
        const done = items.filter((i) => i.status === 'done').length;
        const total = items.length;
        const name = state?.project_name || 'Kein Projekt';
        client.say(channel, `📊 ${name} — ${done}/${total} Features fertig`);
        break;
      }

      case '!scene': {
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

      case '!vote': {
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
    }
  });
}

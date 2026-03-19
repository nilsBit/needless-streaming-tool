import { Client } from 'tmi.js';
import { getDb } from '../db/index';

interface StreamState {
  experiment_title: string | null;
  experiment_status: string;
  timer_seconds: number;
  timer_running: number;
  is_live: number;
}

interface Bug {
  id: number;
  title: string;
  status: string;
}

interface Raid {
  streamer_name: string;
  enemy_tier: string;
  enemy_name: string | null;
  status: string;
}

const startTime = Date.now();

export function registerCommands(client: Client) {
  client.on('message', (channel, tags, message, self) => {
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

      case '!raid-stats': {
        const raids = getDb().prepare('SELECT * FROM raids WHERE status = ? ORDER BY created_at DESC LIMIT 5').all('pending') as Raid[];
        if (raids.length === 0) {
          client.say(channel, 'Keine Raids in der Queue!');
        } else {
          const list = raids.map((r) => `${r.streamer_name} (${r.enemy_tier})`).join(' | ');
          client.say(channel, `⚔️ Raid-Boss Queue (${raids.length}): ${list}`);
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
    }
  });
}

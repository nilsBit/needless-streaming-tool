import { Client } from 'tmi.js';
import { getDb } from '../db/index';
import { broadcast } from '../websocket/index';
import { calculateTier } from '../../shared/types';

export function registerEvents(client: Client) {
  // Raid incoming
  client.on('raided', (channel, username, viewers) => {
    const viewerCount = parseInt(String(viewers), 10) || 0;
    const enemy_tier = calculateTier(viewerCount);

    const result = getDb().prepare(
      'INSERT INTO raids (streamer_name, viewer_count, enemy_tier) VALUES (?, ?, ?)'
    ).run(username, viewerCount, enemy_tier);

    const raid = getDb().prepare('SELECT * FROM raids WHERE id = ?').get(result.lastInsertRowid);

    broadcast('raid-incoming', raid);

    const tierEmoji = enemy_tier === 'boss' ? '👑' : enemy_tier === 'mini-boss' ? '💀' : enemy_tier === 'elite' ? '⚔️' : '🗡️';
    client.say(channel, `${tierEmoji} RAID von ${username} mit ${viewerCount} Viewern! Neuer ${enemy_tier}-Enemy wird gebaut!`);

    console.log(`[Bot] Raid: ${username} (${viewerCount} viewers, ${enemy_tier})`);
  });

  // Channel point redemptions are handled by EventSub (eventsub.ts)
  // No chat-based reward handler needed
}

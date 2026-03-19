import { Client } from 'tmi.js';
import { getDb } from '../db/index';
import { broadcast } from '../websocket/index';

function calculateTier(viewerCount: number): string {
  if (viewerCount >= 100) return 'boss';
  if (viewerCount >= 50) return 'mini-boss';
  if (viewerCount >= 10) return 'elite';
  return 'mob';
}

export function registerEvents(client: Client) {
  // Raid incoming
  client.on('raided', (channel, username, viewers) => {
    const viewerCount = parseInt(String(viewers), 10) || 0;
    const enemy_tier = calculateTier(viewerCount);

    const result = getDb().prepare(
      'INSERT INTO raids (streamer_name, viewer_count, enemy_tier) VALUES (?, ?, ?)'
    ).run(username, viewerCount, enemy_tier);

    const raid = getDb().prepare('SELECT * FROM raids WHERE id = ?').get(result.lastInsertRowid);

    // Notify overlays
    broadcast('raid-incoming', raid);

    // Chat message
    const tierEmoji = enemy_tier === 'boss' ? '👑' : enemy_tier === 'mini-boss' ? '💀' : enemy_tier === 'elite' ? '⚔️' : '🗡️';
    client.say(channel, `${tierEmoji} RAID von ${username} mit ${viewerCount} Viewern! Neuer ${enemy_tier}-Enemy wird gebaut!`);

    console.log(`[Bot] Raid: ${username} (${viewerCount} viewers, ${enemy_tier})`);
  });

  // Channel point redemptions (via chat — full API needs EventSub)
  client.on('message', (channel, tags, message) => {
    if (tags['custom-reward-id']) {
      const rewardId = tags['custom-reward-id'];
      const userName = tags['display-name'] || tags.username || 'Unknown';

      const result = getDb().prepare(
        'INSERT INTO rewards (user_name, reward_type, data) VALUES (?, ?, ?)'
      ).run(userName, rewardId, JSON.stringify({ message, reward_id: rewardId }));

      const reward = getDb().prepare('SELECT * FROM rewards WHERE id = ?').get(result.lastInsertRowid);
      broadcast('reward-redeemed', reward);

      console.log(`[Bot] Reward: ${userName} redeemed ${rewardId}`);
    }
  });
}

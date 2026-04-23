import WebSocket from 'ws';
import { getDb } from '../db/index';
import { broadcast } from '../websocket/index';
import { getBotConfig } from './config';
import { triggerRoulette } from '../api/actions';
import { changeScene, findSceneForReward } from '../obs/index';

let ws: WebSocket | null = null;
let sessionId: string | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

const EVENTSUB_WS_URL = 'wss://eventsub.wss.twitch.tv/ws';

async function getTwitchUserId(token: string, clientId: string): Promise<string | null> {
  try {
    const res = await fetch('https://api.twitch.tv/helix/users', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Client-Id': clientId,
      },
    });
    const data = await res.json();
    return data.data?.[0]?.id || null;
  } catch {
    return null;
  }
}

function getClientId(): string | null {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get('twitch_client_id') as { value: string } | undefined;
  return row?.value || null;
}

async function subscribeToRedemptions(token: string, clientId: string, userId: string) {
  if (!sessionId) return;

  try {
    const res = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Client-Id': clientId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'channel.channel_points_custom_reward_redemption.add',
        version: '1',
        condition: { broadcaster_user_id: userId },
        transport: { method: 'websocket', session_id: sessionId },
      }),
    });

    const data = await res.json();
    if (res.ok) {
      console.log('[EventSub] Subscribed to channel point redemptions');
    } else {
      console.error('[EventSub] Subscribe failed:', data);
    }
  } catch (err) {
    console.error('[EventSub] Subscribe error:', err);
  }
}

async function handleRedemption(event: Record<string, unknown>) {
  const userName = (event.user_name as string) || 'Unknown';
  const rewardTitle = (event.reward as Record<string, unknown>)?.title as string || 'Unknown';
  const rewardId = (event.reward as Record<string, unknown>)?.id as string || '';
  const userInput = (event.user_input as string) || '';

  console.log(`[EventSub] Redemption: ${userName} redeemed "${rewardTitle}"`);

  // Map reward title to our reward types
  let rewardType = rewardId;
  const titleLower = rewardTitle.toLowerCase();
  if (titleLower.includes('roulette')) rewardType = 'roulette';
  else if (titleLower.includes('feature')) rewardType = 'feature_request';
  else if (titleLower.includes('musik') || titleLower.includes('song')) rewardType = 'change_music';
  else if (titleLower.includes('scene') || titleLower.includes('szene')) rewardType = 'scene_change';

  const result = getDb().prepare(
    'INSERT INTO rewards (user_name, reward_type, data) VALUES (?, ?, ?)'
  ).run(userName, rewardType, JSON.stringify({ reward_title: rewardTitle, reward_id: rewardId, user_input: userInput }));

  const reward = getDb().prepare('SELECT * FROM rewards WHERE id = ?').get(result.lastInsertRowid);
  broadcast('reward-redeemed', reward);

  // Track all-time stats (normalize username to lowercase for consistent grouping)
  const normalizedName = userName.toLowerCase();
  getDb().prepare(
    'INSERT INTO reward_log (user_name, reward_type, reward_title, user_input) VALUES (?, ?, ?, ?)'
  ).run(normalizedName, rewardType, rewardTitle, userInput);

  getDb().prepare(`
    INSERT INTO reward_stats (user_name, reward_type, count, last_redeemed_at)
    VALUES (?, ?, 1, CURRENT_TIMESTAMP)
    ON CONFLICT(user_name, reward_type)
    DO UPDATE SET count = count + 1, last_redeemed_at = CURRENT_TIMESTAMP
  `).run(normalizedName, rewardType);

  // Auto-trigger roulette when someone redeems roulette
  if (rewardType === 'roulette') {
    triggerRoulette();
  }

  // Scene change: check mappings first (fixed reward → scene), then fallback to user input
  const mappedScene = findSceneForReward(rewardTitle);
  if (mappedScene) {
    const sceneResult = await changeScene(mappedScene);
    if (sceneResult.success) {
      console.log(`[EventSub] Scene changed to "${mappedScene}" via mapping by ${userName}`);
    } else {
      console.log(`[EventSub] Mapped scene change failed for "${mappedScene}": ${sceneResult.error}`);
    }
  } else if (rewardType === 'scene_change' && userInput) {
    const sceneResult = await changeScene(userInput.trim());
    if (sceneResult.success) {
      console.log(`[EventSub] Scene changed to "${userInput}" by ${userName}`);
    } else {
      console.log(`[EventSub] Scene change failed for "${userInput}": ${sceneResult.error}`);
    }
  }
}

export async function connectEventSub(): Promise<boolean> {
  const config = getBotConfig();
  const clientId = getClientId();
  if (!config || !clientId) {
    console.log('[EventSub] No config — skipping');
    return false;
  }

  const token = config.oauth_token.replace('oauth:', '');

  const userId = await getTwitchUserId(token, clientId);
  if (!userId) {
    console.error('[EventSub] Could not get user ID');
    return false;
  }

  return new Promise((resolve) => {
    ws = new WebSocket(EVENTSUB_WS_URL);

    ws.on('open', () => {
      console.log('[EventSub] WebSocket connected');
    });

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        const type = msg.metadata?.message_type;

        if (type === 'session_welcome') {
          sessionId = msg.payload?.session?.id;
          console.log(`[EventSub] Session: ${sessionId}`);
          await subscribeToRedemptions(token, clientId, userId);
          resolve(true);
        }

        if (type === 'notification') {
          const subType = msg.metadata?.subscription_type;
          if (subType === 'channel.channel_points_custom_reward_redemption.add') {
            handleRedemption(msg.payload?.event);
          }
        }

        if (type === 'session_keepalive') {
          // Twitch keepalive — no action needed
        }

        if (type === 'session_reconnect') {
          const reconnectUrl = msg.payload?.session?.reconnect_url;
          console.log('[EventSub] Reconnecting...');
          disconnectEventSub();
          if (reconnectUrl) {
            ws = new WebSocket(reconnectUrl);
          }
        }
      } catch (err) {
        console.error('[EventSub] Parse error:', err);
      }
    });

    ws.on('close', () => {
      console.log('[EventSub] Disconnected');
      sessionId = null;
      // Auto-reconnect after 5s
      reconnectTimeout = setTimeout(() => connectEventSub(), 5000);
    });

    ws.on('error', (err) => {
      console.error('[EventSub] Error:', err.message);
      resolve(false);
    });
  });
}

export function disconnectEventSub() {
  if (reconnectTimeout) clearTimeout(reconnectTimeout);
  if (ws) {
    ws.close();
    ws = null;
  }
  sessionId = null;
}

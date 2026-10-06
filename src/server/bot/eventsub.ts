import WebSocket from 'ws';
import { getDb } from '../db/index';
import { broadcast } from '../websocket/index';
import { getBotConfig } from './config';
import { triggerRoulette } from '../api/actions';
import { changeScene, sceneMappingForRedemption, getCurrentScene } from '../obs/index';
import { checkAndBroadcast } from '../reward-leaderboard';
import { getClientId } from '../twitch-config';
import { sendAlert } from './alerts';

let ws: WebSocket | null = null;
let sessionId: string | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let sceneRevertTimer: ReturnType<typeof setTimeout> | null = null;

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

/**
 * Subscribes to one event type. A follow needs `moderator:read:followers`,
 * which older tokens don't carry — then Twitch answers 401/403 and the log
 * says what to do instead of failing silently.
 */
async function subscribe(token: string, clientId: string, type: string, version: string, condition: Record<string, string>, label: string) {
  if (!sessionId) return;

  try {
    const res = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Client-Id': clientId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type, version, condition, transport: { method: 'websocket', session_id: sessionId } }),
    });

    const data = await res.json();
    if (res.ok) {
      console.log(`[EventSub] Subscribed to ${label}`);
    } else if (res.status === 401 || res.status === 403) {
      console.error(`[EventSub] ${label}: Twitch refused the subscription (${res.status}). Das Token kennt das nötige Recht nicht — in den Settings einmal neu mit Twitch verbinden.`);
    } else {
      console.error(`[EventSub] ${label} failed:`, data);
    }
  } catch (err) {
    console.error(`[EventSub] ${label} error:`, err);
  }
}

async function subscribeToEvents(token: string, clientId: string, userId: string) {
  await subscribe(token, clientId, 'channel.channel_points_custom_reward_redemption.add', '1', { broadcaster_user_id: userId }, 'channel point redemptions');
  // A follow is only visible to a moderator of the channel — the broadcaster
  // is one of their own channel.
  await subscribe(token, clientId, 'channel.follow', '2', { broadcaster_user_id: userId, moderator_user_id: userId }, 'follows');
}

async function handleRedemption(event: Record<string, unknown>) {
  const userName = (event.user_name as string) || 'Unknown';
  const rewardTitle = (event.reward as Record<string, unknown>)?.title as string || 'Unknown';
  const rewardId = (event.reward as Record<string, unknown>)?.id as string || '';
  const userInput = (event.user_input as string) || '';

  console.log(`[EventSub] Redemption: ${userName} redeemed "${rewardTitle}"`);

  // Map reward title to our reward types
  let rewardType = rewardTitle;
  const titleLower = rewardTitle.toLowerCase();
  if (titleLower.includes('roulette')) rewardType = 'roulette';
  else if (titleLower.includes('feature')) rewardType = 'feature_request';
  else if (titleLower.includes('musik') || titleLower.includes('song')) rewardType = 'change_music';
  else if (titleLower.includes('scene') || titleLower.includes('szene')) rewardType = 'scene_change';

  const result = getDb().prepare(
    'INSERT INTO rewards (user_name, reward_type, data) VALUES (?, ?, ?)'
  // The row is for alerts and the statistics count; what the viewer typed is used right here and not kept.
  ).run(userName, rewardType, JSON.stringify({ reward_title: rewardTitle, reward_id: rewardId }));

  const reward = getDb().prepare('SELECT * FROM rewards WHERE id = ?').get(result.lastInsertRowid);
  broadcast('reward-redeemed', reward);

  // Only the count per viewer and reward is kept — no log of who typed what
  // when (the streamer decided against a history, 2026-10-06).
  const normalizedName = userName.toLowerCase();
  getDb().prepare(`
    INSERT INTO reward_stats (user_name, reward_type, count, last_redeemed_at)
    VALUES (?, ?, 1, CURRENT_TIMESTAMP)
    ON CONFLICT(user_name, reward_type)
    DO UPDATE SET count = count + 1, last_redeemed_at = CURRENT_TIMESTAMP
  `).run(normalizedName, rewardType);

  // Update leaderboard tracking
  checkAndBroadcast('all');
  checkAndBroadcast(rewardType);

  // Auto-trigger roulette when someone redeems roulette
  if (rewardType === 'roulette') {
    triggerRoulette();
  }

  // Scene change: a mapped reward, or a "Szene" reward naming one of the
  // mapped scenes. Never an arbitrary scene by name — the viewer must not be
  // able to put a desktop scene on stream (security review 2026-10-06, H5).
  const mapping = sceneMappingForRedemption(rewardTitle, rewardType, userInput);
  if (mapping) {
    // Capture current scene before switching so we can revert to it
    const previousScene = await getCurrentScene();
    const sceneResult = await changeScene(mapping.scene_name);
    if (sceneResult.success) {
      console.log(`[EventSub] Scene changed to "${mapping.scene_name}" via mapping by ${userName}`);
      // Auto-revert after duration: use per-mapping revert_scene, fallback to previous scene
      if (mapping.duration_seconds && mapping.duration_seconds > 0) {
        const revertTo = mapping.revert_scene || previousScene;
        if (revertTo) {
          if (sceneRevertTimer) clearTimeout(sceneRevertTimer);
          sceneRevertTimer = setTimeout(async () => {
            sceneRevertTimer = null;
            const revertResult = await changeScene(revertTo);
            if (revertResult.success) {
              console.log(`[EventSub] Reverted to "${revertTo}" after ${mapping.duration_seconds}s`);
            }
          }, mapping.duration_seconds * 1000);
        }
      }
    } else {
      console.log(`[EventSub] Mapped scene change failed for "${mapping.scene_name}": ${sceneResult.error}`);
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
          await subscribeToEvents(token, clientId, userId);
          resolve(true);
        }

        if (type === 'notification') {
          const subType = msg.metadata?.subscription_type;
          if (subType === 'channel.channel_points_custom_reward_redemption.add') {
            handleRedemption(msg.payload?.event);
          }
          if (subType === 'channel.follow') {
            const event = msg.payload?.event;
            sendAlert('follow', { user: event?.user_name ?? event?.user_login });
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

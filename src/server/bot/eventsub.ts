import WebSocket from 'ws';
import { getDb } from '../db/index';
import { broadcast } from '../websocket/index';
import { getBotConfig } from './config';
import { triggerRoulette } from '../api/actions';
import { sceneMappingForRedemption } from '../obs/index';
import { actionFromTitle, rewardTypeOf, runAction, switchMappedScene } from '../reward-actions';
import { actionForReward, cancelRedemption } from '../channel-rewards';
import { countRedemption } from '../leaderboards';
import { getClientId } from '../twitch-config';
import { sendAlert } from './alerts';
import { onFollow, setLive } from '../points/earn';

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
  // Own points are earned only live. No scope needed for these two.
  await subscribe(token, clientId, 'stream.online', '1', { broadcaster_user_id: userId }, 'stream online');
  await subscribe(token, clientId, 'stream.offline', '1', { broadcaster_user_id: userId }, 'stream offline');
}

export async function handleRedemption(event: Record<string, unknown>) {
  const userName = (event.user_name as string) || 'Unknown';
  // Twitch sends the login in lower case and the name as typed; counts go by login.
  const login = (event.user_login as string) || userName;
  const rewardTitle = (event.reward as Record<string, unknown>)?.title as string || 'Unknown';
  const rewardId = (event.reward as Record<string, unknown>)?.id as string || '';
  const userInput = (event.user_input as string) || '';

  console.log(`[EventSub] Redemption: ${userName} redeemed "${rewardTitle}"`);

  // A reward with a Bestenliste counts there, by its id; the rest is told
  // apart by title and does what it does (wheel, music, scene, suggestion).
  const point = countRedemption(rewardId, login, userName);
  // A reward made in the app carries its action by id (#24); no name convention.
  const bound = actionForReward(rewardId);
  let rewardType = point ? point.leaderboard.key : bound ? rewardTypeOf(bound.action) : rewardTitle;
  if (!point && !bound) {
    const byName = actionFromTitle(rewardTitle);
    if (byName) rewardType = rewardTypeOf(byName);
  }

  const result = getDb().prepare(
    'INSERT INTO rewards (user_name, reward_type, data) VALUES (?, ?, ?)'
  // The row is for alerts and the statistics count; what the viewer typed is used right here and not kept.
  ).run(userName, rewardType, JSON.stringify({ reward_title: rewardTitle, reward_id: rewardId, leaderboard: point?.leaderboard.key ?? null }));

  const reward = getDb().prepare('SELECT * FROM rewards WHERE id = ?').get(result.lastInsertRowid);
  broadcast('reward-redeemed', reward);

  // No chat line for a point: the overlays and the alert board show it, !stats
  // tells the standing on request (Nils, 06.10.: "jedesmal diese Notiz macht keinen Sinn").
  if (point) console.log(`[EventSub] ${userName}: ${point.leaderboard.title} Nr. ${point.count}, Platz ${point.rank}`);

  if (bound) {
    const done = await runAction(bound.action, { sceneName: bound.scene_name });
    if (!done.ok) {
      // Like own points: an action that did not happen gives the points back.
      const refunded = await cancelRedemption(rewardId, String(event.id ?? ''));
      console.log(`[EventSub] "${rewardTitle}" did not run (${done.reason})${refunded ? ' — points given back' : ''}`);
    }
    return;
  }

  // Auto-trigger roulette when someone redeems roulette
  if (rewardType === 'roulette') {
    triggerRoulette();
  }

  // Scene change: a mapped reward, or a "Szene" reward naming one of the
  // mapped scenes. Never an arbitrary scene by name — the viewer must not be
  // able to put a desktop scene on stream (security review 2026-10-06, H5).
  const mapping = sceneMappingForRedemption(rewardTitle, rewardType, userInput);
  if (mapping) {
    // The switch and the way back are shared with the Punkte-Belohnungen (reward-actions.ts).
    const sceneResult = await switchMappedScene(mapping);
    if (sceneResult.ok) console.log(`[EventSub] Scene changed to "${mapping.scene_name}" via mapping by ${userName}`);
    else console.log(`[EventSub] Mapped scene change failed for "${mapping.scene_name}": ${sceneResult.reason}`);
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
            if (event?.user_login) onFollow(event.user_login, event.user_name);
          }
          if (subType === 'stream.online') setLive(true, msg.payload?.event?.started_at);
          if (subType === 'stream.offline') setLive(false);
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

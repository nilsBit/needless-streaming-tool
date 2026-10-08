import { getDb } from './db/index';
import { helixRequest, type HelixReply } from './twitch-helix';
import { actionFromTitle, isActionKey, sceneOfReward, type ActionKey } from './reward-actions';

/**
 * Twitch channel-point rewards, made and edited from the app (#24). Twitch
 * lets a client edit or delete only rewards it created itself; the ones from
 * the Creator Dashboard are listed read-only ("in Twitch angelegt") and keep
 * working by their name in eventsub.ts. A reward made here carries an action
 * from reward-actions.ts, bound by its id in `twitch_reward_actions`.
 */

export interface ChannelReward {
  id: string;
  title: string;
  cost: number;
  prompt: string;
  input_required: boolean;
  enabled: boolean;
  /** Made by this app, so it may be edited and deleted here. */
  manageable: boolean;
  action: ActionKey | null;
  scene_name: string | null;
  scene_seconds: number | null;
  /** A dashboard reward: what its title makes it do, or null for an alert only. */
  by_name: ActionKey | null;
}

/** Why a call did not work, with the status the route answers. */
export interface RewardError { status: number; error: string }

const TITLE_MAX = 45;
const PROMPT_MAX = 200;
const COST_MAX = 1_000_000_000;

/** What a failed Helix call means for the streamer. */
function failure(reply: HelixReply | null): RewardError {
  if (!reply) return { status: 503, error: 'Twitch ist nicht verbunden.' };
  if (reply.status === 401) return { status: 401, error: 'Dem Twitch-Login fehlt das Recht, Belohnungen zu verwalten – einmal neu mit Twitch verbinden.' };
  if (reply.status === 403) return { status: 403, error: 'Diese Belohnung ist in Twitch angelegt – ändern und löschen geht nur dort. Kanalpunkte gibt es erst mit Affiliate oder Partner.' };
  if (reply.status === 404) return { status: 404, error: 'Diese Belohnung gibt es in Twitch nicht.' };
  return { status: reply.status >= 500 ? 502 : 400, error: reply.body?.message ? `Twitch sagt: ${reply.body.message}` : `Twitch hat abgelehnt (${reply.status}).` };
}

async function broadcasterId(): Promise<string | RewardError> {
  const reply = await helixRequest('GET', 'users');
  const id = reply?.status === 200 ? reply.body?.data?.[0]?.id : undefined;
  return typeof id === 'string' && id ? id : failure(reply);
}

interface Bound { action: ActionKey; scene_name: string | null; scene_seconds: number | null }

function boundAction(id: string): Bound | null {
  const row = getDb().prepare('SELECT action, scene_name, scene_seconds FROM twitch_reward_actions WHERE reward_id = ?').get(id) as { action: string; scene_name: string | null; scene_seconds: number | null } | undefined;
  return row && isActionKey(row.action) ? { action: row.action, scene_name: row.scene_name, scene_seconds: row.scene_seconds } : null;
}

/** The action a redemption of this reward runs — looked up by id, before any name convention. */
export function actionForReward(id: string): Bound | null {
  return id ? boundAction(id) : null;
}

function fromHelix(r: Record<string, unknown>, manageable: boolean): ChannelReward {
  const id = String(r.id);
  const bound = manageable ? boundAction(id) : null;
  return {
    id,
    title: String(r.title ?? ''),
    cost: Number(r.cost ?? 0),
    prompt: String(r.prompt ?? ''),
    input_required: !!r.is_user_input_required,
    enabled: r.is_enabled !== false,
    manageable,
    action: bound?.action ?? null,
    scene_name: bound?.scene_name ?? null,
    scene_seconds: bound?.scene_seconds ?? null,
    by_name: manageable ? null : actionFromTitle(String(r.title ?? '')),
  };
}

/**
 * Gives a viewer the channel points back for a redemption whose action did not
 * happen — Twitch allows it for rewards this app made. True when Twitch took it.
 */
export async function cancelRedemption(rewardId: string, redemptionId: string): Promise<boolean> {
  if (!rewardId || !redemptionId) return false;
  const me = await broadcasterId();
  if (typeof me !== 'string') return false;
  const reply = await helixRequest('PATCH', `channel_points/custom_rewards/redemptions?broadcaster_id=${encodeURIComponent(me)}&reward_id=${encodeURIComponent(rewardId)}&id=${encodeURIComponent(redemptionId)}`, { status: 'CANCELED' });
  return reply?.status === 200;
}

export async function listChannelRewards(): Promise<ChannelReward[] | RewardError> {
  const me = await broadcasterId();
  if (typeof me !== 'string') return me;
  const all = await helixRequest('GET', `channel_points/custom_rewards?broadcaster_id=${encodeURIComponent(me)}`);
  if (all?.status !== 200) return failure(all);
  const mine = await helixRequest('GET', `channel_points/custom_rewards?broadcaster_id=${encodeURIComponent(me)}&only_manageable_rewards=true`);
  const manageable = new Set(mine?.status === 200 ? (mine.body?.data ?? []).map((r) => String(r.id)) : []);
  return (all.body?.data ?? []).map((r) => fromHelix(r, manageable.has(String(r.id))));
}

interface Draft {
  title?: string; cost?: number; prompt?: string; input_required?: boolean; enabled?: boolean;
  action?: ActionKey; scene_name?: string | null; scene_seconds?: number | null;
}

/** Checks what the app sends; `creating` makes title, cost and action required. */
function validate(input: unknown, creating: boolean): Draft | RewardError {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { status: 400, error: 'reward must be an object' };
  const b = input as Record<string, unknown>;
  const d: Draft = {};
  if ('title' in b || creating) {
    if (typeof b.title !== 'string' || !b.title.trim() || b.title.trim().length > TITLE_MAX) return { status: 400, error: `title must be 1 to ${TITLE_MAX} characters` };
    d.title = b.title.trim();
  }
  if ('cost' in b || creating) {
    if (!Number.isInteger(b.cost) || (b.cost as number) < 1 || (b.cost as number) > COST_MAX) return { status: 400, error: 'cost must be a whole number of at least 1' };
    d.cost = b.cost as number;
  }
  if ('prompt' in b) {
    if (typeof b.prompt !== 'string' || b.prompt.length > PROMPT_MAX) return { status: 400, error: `prompt is at most ${PROMPT_MAX} characters` };
    d.prompt = b.prompt.trim();
  }
  for (const key of ['input_required', 'enabled'] as const) {
    if (!(key in b)) continue;
    if (typeof b[key] !== 'boolean') return { status: 400, error: `${key} must be true or false` };
    d[key] = b[key] as boolean;
  }
  if ('action' in b || creating) {
    if (!isActionKey(b.action)) return { status: 400, error: 'unknown action' };
    d.action = b.action;
    const scene = sceneOfReward(d.action, b.scene_name, b.scene_seconds);
    if ('error' in scene) return { status: 400, error: scene.error };
    d.scene_name = scene.scene_name;
    d.scene_seconds = scene.scene_seconds;
  }
  return d;
}

const toHelix = (d: Draft) => ({
  ...(d.title !== undefined ? { title: d.title } : {}),
  ...(d.cost !== undefined ? { cost: d.cost } : {}),
  ...(d.prompt !== undefined ? { prompt: d.prompt } : {}),
  ...(d.input_required !== undefined ? { is_user_input_required: d.input_required } : {}),
  ...(d.enabled !== undefined ? { is_enabled: d.enabled } : {}),
});

function bind(id: string, d: Draft): void {
  if (!d.action) return;
  getDb().prepare('INSERT OR REPLACE INTO twitch_reward_actions (reward_id, action, scene_name, scene_seconds) VALUES (?, ?, ?, ?)').run(id, d.action, d.scene_name ?? null, d.scene_seconds ?? null);
}

export async function createChannelReward(input: unknown): Promise<ChannelReward | RewardError> {
  const d = validate(input, true);
  if ('error' in d) return d;
  const me = await broadcasterId();
  if (typeof me !== 'string') return me;
  const reply = await helixRequest('POST', `channel_points/custom_rewards?broadcaster_id=${encodeURIComponent(me)}`, toHelix(d));
  const made = reply?.status === 200 ? reply.body?.data?.[0] : undefined;
  if (!made) return failure(reply);
  bind(String(made.id), d);
  return fromHelix(made, true);
}

export async function updateChannelReward(id: string, input: unknown): Promise<ChannelReward | RewardError> {
  const d = validate(input, false);
  if ('error' in d) return d;
  const me = await broadcasterId();
  if (typeof me !== 'string') return me;
  const fields = toHelix(d);
  if (Object.keys(fields).length === 0) {
    // Only the action changes: nothing to send, but it must be one of ours.
    const mine = await helixRequest('GET', `channel_points/custom_rewards?broadcaster_id=${encodeURIComponent(me)}&id=${encodeURIComponent(id)}&only_manageable_rewards=true`);
    const found = mine?.status === 200 ? mine.body?.data?.[0] : undefined;
    if (!found) return failure(mine && mine.status === 200 ? { status: 403, body: null } : mine);
    bind(id, d);
    return fromHelix(found, true);
  }
  // Twitch answers 403 for a reward made in the dashboard.
  const reply = await helixRequest('PATCH', `channel_points/custom_rewards?broadcaster_id=${encodeURIComponent(me)}&id=${encodeURIComponent(id)}`, fields);
  const changed = reply?.status === 200 ? reply.body?.data?.[0] : undefined;
  if (!changed) return failure(reply);
  bind(id, d);
  return fromHelix(changed, true);
}

export async function deleteChannelReward(id: string): Promise<true | RewardError> {
  const me = await broadcasterId();
  if (typeof me !== 'string') return me;
  const reply = await helixRequest('DELETE', `channel_points/custom_rewards?broadcaster_id=${encodeURIComponent(me)}&id=${encodeURIComponent(id)}`);
  if (reply?.status !== 204 && reply?.status !== 200) return failure(reply);
  getDb().prepare('DELETE FROM twitch_reward_actions WHERE reward_id = ?').run(id);
  return true;
}

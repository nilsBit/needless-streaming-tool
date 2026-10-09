import { getDb } from '../db/index';
import { markQuestFlag } from '../quests/flags';
import { getBotConfig } from '../bot/config';
import { broadcast } from '../websocket/index';
import { featureOn } from '../features';
import { rewardTypeOf, runAction } from '../reward-actions';
import { noteReward } from '../stream-report/log';
import { getPointsConfig } from './config';
import { refundPoints, spendPoints, standing, type Standing } from './ledger';
import { findPointReward, listPointRewards, type PointReward } from './rewards';

/**
 * Buying a Punkte-Belohnung — `!einlösen <Name> [Text]` in chat, and "Für
 * jemanden einlösen" in the app (decided 08.10.: one function, so the rules
 * are tested at the HTTP seam). Nothing is taken unless everything holds; an
 * action that does not happen gives the points back.
 *
 * Like a Twitch redemption, it leaves a row in the queue and an alert; what
 * the viewer typed goes into the alert only and is not kept.
 */

export type RedeemRefusal = 'feature_off' | 'unknown' | 'off' | 'input' | 'cooldown' | 'balance' | 'action';

export type RedeemResult =
  | { ok: true; reward: PointReward; standing: Standing; message: string }
  | { ok: false; code: RedeemRefusal; message: string };

const INPUT_MAX = 200;
const lastRedeemed = new Map<string, number>();

/** For tests: start without any running cooldown. */
export function clearRedeemCooldowns(): void {
  lastRedeemed.clear();
}

/**
 * Splits what follows `!einlösen` into the reward's name and the text. A name
 * may have spaces ("Szene Wald"), so the longest name the text starts with
 * wins; without a match the first word is the name.
 */
export function parseRedeem(text: string): { name: string; input: string } {
  const typed = text.trim();
  const lower = typed.toLowerCase();
  const names = listPointRewards().map((r) => r.name).sort((a, b) => b.length - a.length);
  const hit = names.find((n) => lower === n.toLowerCase() || lower.startsWith(`${n.toLowerCase()} `));
  if (hit) return { name: typed.slice(0, hit.length), input: typed.slice(hit.length).trim() };
  const [first = '', ...rest] = typed.split(/\s+/);
  return { name: first, input: rest.join(' ') };
}

export async function redeem(name: string, displayName: string, rewardName: string, input = '', now: number = Date.now()): Promise<RedeemResult> {
  const login = name.trim().replace(/^@/, '').toLowerCase();
  const who = displayName || login;
  const { currency } = getPointsConfig();
  const refuse = (code: RedeemRefusal, message: string): RedeemResult => ({ ok: false, code, message: `@${who} ${message}` });

  if (!featureOn('punkte')) return refuse('feature_off', 'Eigene Punkte sind auf diesem Kanal aus.');
  const reward = findPointReward(rewardName);
  // What the viewer typed is never said back — the bot must not become anyone's mouthpiece.
  if (!reward) return refuse('unknown', 'Diese Belohnung gibt es nicht. !belohnungen zeigt, was es gibt.');
  if (!reward.enabled) return refuse('off', `„${reward.name}“ ist gerade ausgeschaltet.`);
  const text = input.trim().slice(0, INPUT_MAX);
  if (reward.needs_input && !text) return refuse('input', `„${reward.name}“ braucht einen Text: !einlösen ${reward.name} <Text>`);

  const key = `${reward.id}:${login}`;
  const last = lastRedeemed.get(key);
  if (reward.cooldown_seconds > 0 && last !== undefined && now - last < reward.cooldown_seconds * 1000) {
    const wait = Math.ceil((reward.cooldown_seconds * 1000 - (now - last)) / 1000);
    return refuse('cooldown', `„${reward.name}“ geht für dich wieder in ${wait} s.`);
  }

  if (!spendPoints(login, reward.cost)) {
    const have = standing(login)?.balance ?? 0;
    return refuse('balance', `„${reward.name}“ kostet ${reward.cost} ${currency}, du hast ${have}.`);
  }
  // Held before the action runs, so a second message right behind cannot pay twice.
  lastRedeemed.set(key, now);

  const done = await runAction(reward.action, { sceneName: reward.scene_name, sceneSeconds: reward.scene_seconds });
  if (!done.ok) {
    refundPoints(login, reward.cost);
    if (last === undefined) lastRedeemed.delete(key); else lastRedeemed.set(key, last);
    return refuse('action', `„${reward.name}“ hat nicht geklappt (${done.reason}). Deine ${currency} sind zurück.`);
  }

  const stored = { reward_title: reward.name, source: 'points', currency, cost: reward.cost };
  const id = getDb().prepare('INSERT INTO rewards (user_name, reward_type, data) VALUES (?, ?, ?)')
    .run(who, rewardTypeOf(reward.action), JSON.stringify(stored)).lastInsertRowid;
  const row = getDb().prepare('SELECT * FROM rewards WHERE id = ?').get(id) as Record<string, unknown>;
  broadcast('reward-redeemed', { ...row, data: JSON.stringify({ ...stored, message: text || undefined }) });
  noteReward(reward.name, login);

  const after = standing(login)!;
  // The streamer trying their own reward is a quest of its own.
  if (login === getBotConfig()?.channel?.toLowerCase()) markQuestFlag('pointTry');
  return { ok: true, reward, standing: after, message: `@${who} löst „${reward.name}“ ein (−${reward.cost} ${currency}, noch ${after.balance}).` };
}

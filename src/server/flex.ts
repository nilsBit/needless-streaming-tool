import { getDb } from './db/index';
import { broadcast } from './websocket/index';
import { checkAndBroadcast } from './reward-leaderboard';

/**
 * The Bestenliste counts flexes, nothing else. A viewer redeems the "Flex"
 * reward in Twitch (any reward whose name contains the keyword), which
 * unlocks one flex; `!flex` in chat spends it, counts it and announces it.
 * Every other reward still does what it does (wheel, music, scene,
 * suggestion) but never counts here. (Nils, 2026-10-06.)
 */
export const FLEX_TYPE = 'flex';
const KEYWORD_KEY = 'flex_reward';
const DEFAULT_KEYWORD = 'Flex';

export function flexRewardKeyword(): string {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(KEYWORD_KEY) as { value: string } | undefined;
  return row?.value?.trim() || DEFAULT_KEYWORD;
}

export function saveFlexRewardKeyword(value: unknown): { reward: string } | { error: string } {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 45) return { error: 'reward must be 1 to 45 characters of the reward name' };
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(KEYWORD_KEY, value.trim());
  return { reward: value.trim() };
}

/** A redemption of a reward whose name carries the keyword, case-insensitively. */
export function isFlexReward(rewardTitle: string): boolean {
  return rewardTitle.toLowerCase().includes(flexRewardKeyword().toLowerCase());
}

export function flexCredits(login: string): number {
  const row = getDb().prepare('SELECT credits FROM flex_credits WHERE user_name = ?').get(login.toLowerCase()) as { credits: number } | undefined;
  return row?.credits ?? 0;
}

/** One more flex unlocked for the viewer; returns what they have open now. */
export function grantFlexCredit(login: string): number {
  const name = login.toLowerCase();
  getDb().prepare(`
    INSERT INTO flex_credits (user_name, credits, updated_at) VALUES (?, 1, CURRENT_TIMESTAMP)
    ON CONFLICT(user_name) DO UPDATE SET credits = credits + 1, updated_at = CURRENT_TIMESTAMP
  `).run(name);
  const credits = flexCredits(name);
  broadcast('flex-credit', { user: name, credits });
  return credits;
}

export interface FlexStanding { count: number; rank: number | null; credits: number }

export function flexStanding(login: string): FlexStanding {
  const name = login.toLowerCase();
  const db = getDb();
  const row = db.prepare('SELECT count FROM reward_stats WHERE user_name = ? AND reward_type = ?').get(name, FLEX_TYPE) as { count: number } | undefined;
  const count = row?.count ?? 0;
  const rank = count > 0
    ? (db.prepare('SELECT COUNT(*) + 1 AS rank FROM reward_stats WHERE reward_type = ? AND count > ?').get(FLEX_TYPE, count) as { rank: number }).rank
    : null;
  return { count, rank, credits: flexCredits(name) };
}

/** `!flex`: spends one unlocked flex and counts it — or tells what stands in the way. */
export function useFlex(login: string, shownName: string = login): FlexStanding & { counted: boolean } {
  const name = login.toLowerCase();
  const db = getDb();
  const counted = db.transaction((): boolean => {
    const spent = db.prepare('UPDATE flex_credits SET credits = credits - 1, updated_at = CURRENT_TIMESTAMP WHERE user_name = ? AND credits > 0').run(name).changes;
    if (!spent) return false;
    db.prepare(`
      INSERT INTO reward_stats (user_name, reward_type, count, last_redeemed_at)
      VALUES (?, ?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(user_name, reward_type) DO UPDATE SET count = count + 1, last_redeemed_at = CURRENT_TIMESTAMP
    `).run(name, FLEX_TYPE);
    return true;
  })();
  const standing = flexStanding(name);
  if (counted) {
    checkAndBroadcast('all');
    checkAndBroadcast(FLEX_TYPE);
    broadcast('flex', { user: shownName, login: name, count: standing.count, rank: standing.rank });
  }
  return { ...standing, counted };
}

export interface FlexRow { user_name: string; reward_type: string; count: number; last_redeemed_at: string; credits: number }

/** Everyone with flexes or open credits, for the ranking in the app. */
export function flexBoard(): FlexRow[] {
  return getDb().prepare(`
    SELECT s.user_name, s.reward_type, s.count, s.last_redeemed_at, COALESCE(c.credits, 0) AS credits
    FROM reward_stats s LEFT JOIN flex_credits c ON c.user_name = s.user_name
    WHERE s.reward_type = ?
    UNION ALL
    SELECT c.user_name, ? AS reward_type, 0 AS count, c.updated_at AS last_redeemed_at, c.credits
    FROM flex_credits c
    WHERE c.credits > 0 AND NOT EXISTS (SELECT 1 FROM reward_stats s WHERE s.user_name = c.user_name AND s.reward_type = ?)
    ORDER BY count DESC, user_name ASC
  `).all(FLEX_TYPE, FLEX_TYPE, FLEX_TYPE) as FlexRow[];
}

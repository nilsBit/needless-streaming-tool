import { getDb } from './db/index';
import { broadcast } from './websocket/index';
import { checkAndBroadcast } from './reward-leaderboard';
import type { Helix } from './bot/shoutout';
import { listCustomRewards } from './bot/twitch-rewards';

/**
 * The Bestenliste counts flexes, nothing else. A viewer redeems the chosen
 * "Flex" reward in Twitch, which unlocks one flex; `!flex` in chat spends it,
 * counts it and announces it. Every other reward still does what it does
 * (wheel, music, scene, suggestion) but never counts here. (Nils, 2026-10-06.)
 *
 * Which reward that is, the streamer picks in the app from the channel's
 * rewards; the tool keeps its Twitch id. Renaming the reward in Twitch
 * changes nothing, deleting it leaves nothing chosen until they pick again.
 */
export const FLEX_TYPE = 'flex';
const ID_KEY = 'flex_reward_id';
const TITLE_KEY = 'flex_reward_title';
/** The word in a reward's name that chose the flex reward before ids did. */
const KEYWORD_KEY = 'flex_reward';
const DEFAULT_KEYWORD = 'Flex';

export interface FlexReward { id: string; title: string }

function setting(key: string): string | undefined {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value;
}

function storeReward(reward: FlexReward | null) {
  const db = getDb();
  db.transaction(() => {
    const put = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    // An empty id records that nothing is chosen — as opposed to never decided.
    put.run(ID_KEY, reward?.id ?? '');
    put.run(TITLE_KEY, reward?.title ?? '');
  })();
}

/** The reward that unlocks a flex, or null while none is chosen. */
export function flexReward(): FlexReward | null {
  const id = setting(ID_KEY);
  if (!id) return null;
  return { id, title: setting(TITLE_KEY) || DEFAULT_KEYWORD };
}

export function saveFlexReward(value: unknown): { reward: FlexReward } | { error: string } {
  const { id, title } = (value ?? {}) as { id?: unknown; title?: unknown };
  if (typeof id !== 'string' || !id.trim() || id.trim().length > 100) return { error: 'id must be the Twitch id of the reward' };
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 45) return { error: 'title must be 1 to 45 characters of the reward name' };
  const reward = { id: id.trim(), title: title.trim() };
  storeReward(reward);
  return { reward };
}

/** A redemption of the chosen reward, told apart by its id. */
export function isFlexReward(rewardId: string): boolean {
  const chosen = flexReward();
  return chosen !== null && rewardId === chosen.id;
}

/**
 * Until 2026-10-06 the flex reward was any reward whose name carried a word
 * (`flex_reward`, default "Flex"). On the first connection after the update
 * the one reward in Twitch that carries the word is adopted; with none or
 * several, the choice stays open for the streamer. Decided once — unless
 * Twitch couldn't be asked, then the next connection tries again.
 */
export async function adoptFlexReward(helix: Helix): Promise<void> {
  if (setting(ID_KEY) !== undefined) return;
  const rewards = await listCustomRewards(helix);
  if (!rewards) return;
  const word = (setting(KEYWORD_KEY)?.trim() || DEFAULT_KEYWORD).toLowerCase();
  const matches = rewards.filter((r) => r.title.toLowerCase().includes(word));
  const adopted = matches.length === 1 ? matches[0] : null;
  const db = getDb();
  db.transaction(() => {
    storeReward(adopted);
    db.prepare('DELETE FROM settings WHERE key = ?').run(KEYWORD_KEY);
  })();
  console.log(adopted
    ? `[Flex] Reward "${adopted.title}" adopted from the old keyword "${word}"`
    : `[Flex] ${matches.length ? 'Several rewards carry' : 'No reward carries'} "${word}" — choose one in the app`);
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

import { getDb } from './db/index';
import { broadcast } from './websocket/index';
import { checkAndBroadcast } from './reward-leaderboard';

/**
 * A Bestenliste hangs on one Twitch channel-point reward and ranks who
 * redeemed it most (2026-10-06). The streamer names it; the key is derived
 * from the title once and never changes, so overlay addresses (`?type=key`)
 * and the counts in `reward_stats` (whose `reward_type` is the key) survive
 * a rename. The reward is kept by its Twitch id — renaming it in Twitch
 * changes nothing, a deleted one shows up as such in the app.
 */

export interface Leaderboard { key: string; title: string; reward_id: string; reward_title: string; viewers: number }
export interface LeaderboardRow { user_name: string; count: number; last_redeemed_at: string }
interface Reward { id: string; title: string }

const UMLAUTS: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };

/** `Angeben für Könner!` → `angeben-fuer-koenner`; nothing usable → `liste`. */
export function keyFromTitle(title: string): string {
  const key = title
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => UMLAUTS[c])
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return key || 'liste';
}

const SELECT = `
  SELECT l.key, l.title, l.reward_id, l.reward_title,
         (SELECT COUNT(*) FROM reward_stats s WHERE s.reward_type = l.key) AS viewers
  FROM leaderboards l`;

export function listLeaderboards(): Leaderboard[] {
  return getDb().prepare(`${SELECT} ORDER BY l.rowid`).all() as Leaderboard[];
}

export function getLeaderboard(key: string): Leaderboard | null {
  return (getDb().prepare(`${SELECT} WHERE l.key = ?`).get(key) as Leaderboard | undefined) ?? null;
}

export function leaderboardForReward(rewardId: string): Leaderboard | null {
  return (getDb().prepare(`${SELECT} WHERE l.reward_id = ?`).get(rewardId) as Leaderboard | undefined) ?? null;
}

function cleanTitle(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const title = value.trim();
  return title && title.length <= 45 ? title : null;
}

function cleanReward(value: unknown): Reward | null {
  const { id, title } = (value ?? {}) as { id?: unknown; title?: unknown };
  if (typeof id !== 'string' || !id.trim() || id.trim().length > 100) return null;
  const cleaned = cleanTitle(title);
  return cleaned ? { id: id.trim(), title: cleaned } : null;
}

export function createLeaderboard(input: unknown): { leaderboard: Leaderboard } | { error: string } {
  const { title: rawTitle, reward: rawReward } = (input ?? {}) as { title?: unknown; reward?: unknown };
  const title = cleanTitle(rawTitle);
  if (!title) return { error: 'title must be 1 to 45 characters' };
  const reward = cleanReward(rawReward);
  if (!reward) return { error: 'reward must carry the Twitch id and the name of the reward' };
  const key = keyFromTitle(title);
  // The lists of own points carry these keys (reward-leaderboard.ts).
  if (key === 'beitrag' || key === 'beitrag-stream') return { error: `this name is taken by the own points (${key})` };
  if (getLeaderboard(key)) return { error: `a list with this name exists already (${key})` };
  if (leaderboardForReward(reward.id)) return { error: 'this reward has a list already' };
  getDb().prepare('INSERT INTO leaderboards (key, title, reward_id, reward_title) VALUES (?, ?, ?, ?)').run(key, title, reward.id, reward.title);
  return { leaderboard: getLeaderboard(key)! };
}

/** Rename, or choose another reward; null when there is no such list. */
export function updateLeaderboard(key: string, input: unknown): { leaderboard: Leaderboard } | { error: string } | null {
  const current = getLeaderboard(key);
  if (!current) return null;
  const { title: rawTitle, reward: rawReward } = (input ?? {}) as { title?: unknown; reward?: unknown };
  const db = getDb();
  if (rawTitle !== undefined) {
    const title = cleanTitle(rawTitle);
    if (!title) return { error: 'title must be 1 to 45 characters' };
    db.prepare('UPDATE leaderboards SET title = ? WHERE key = ?').run(title, key);
  }
  if (rawReward !== undefined) {
    const reward = cleanReward(rawReward);
    if (!reward) return { error: 'reward must carry the Twitch id and the name of the reward' };
    const taken = leaderboardForReward(reward.id);
    if (taken && taken.key !== key) return { error: 'this reward has a list already' };
    db.prepare('UPDATE leaderboards SET reward_id = ?, reward_title = ? WHERE key = ?').run(reward.id, reward.title, key);
  }
  return { leaderboard: getLeaderboard(key)! };
}

/** The list and every count under it; null when there is no such list. */
export function deleteLeaderboard(key: string): { removed: number } | null {
  if (!getLeaderboard(key)) return null;
  const db = getDb();
  const removed = db.transaction((): number => {
    const n = db.prepare('DELETE FROM reward_stats WHERE reward_type = ?').run(key).changes;
    db.prepare('DELETE FROM leaderboards WHERE key = ?').run(key);
    return n;
  })();
  checkAndBroadcast(key);
  return { removed };
}

/** Everyone counted in the list, most first — the order the overlay shows. */
export function leaderboardBoard(key: string): LeaderboardRow[] | null {
  if (!getLeaderboard(key)) return null;
  return getDb().prepare(
    'SELECT user_name, count, last_redeemed_at FROM reward_stats WHERE reward_type = ? ORDER BY count DESC, user_name ASC'
  ).all(key) as LeaderboardRow[];
}

export interface LeaderboardPoint { leaderboard: Leaderboard; count: number; rank: number }

export function standing(key: string, login: string): { count: number; rank: number | null } {
  const name = login.toLowerCase();
  const db = getDb();
  const row = db.prepare('SELECT count FROM reward_stats WHERE user_name = ? AND reward_type = ?').get(name, key) as { count: number } | undefined;
  const count = row?.count ?? 0;
  const rank = count > 0
    ? (db.prepare('SELECT COUNT(*) + 1 AS rank FROM reward_stats WHERE reward_type = ? AND count > ?').get(key, count) as { rank: number }).rank
    : null;
  return { count, rank };
}

/**
 * A redemption of a list's reward: one point for the viewer, the Top 3 of
 * that list checked (the overlays follow), the point announced on the
 * WebSocket (alert board, app). Null when no list has this reward.
 */
export function countRedemption(rewardId: string, login: string, shownName: string = login): LeaderboardPoint | null {
  const leaderboard = leaderboardForReward(rewardId);
  if (!leaderboard) return null;
  const name = login.toLowerCase();
  getDb().prepare(`
    INSERT INTO reward_stats (user_name, reward_type, count, last_redeemed_at)
    VALUES (?, ?, 1, CURRENT_TIMESTAMP)
    ON CONFLICT(user_name, reward_type) DO UPDATE SET count = count + 1, last_redeemed_at = CURRENT_TIMESTAMP
  `).run(name, leaderboard.key);
  const { count, rank } = standing(leaderboard.key, name);
  checkAndBroadcast(leaderboard.key);
  broadcast('leaderboard-point', { key: leaderboard.key, title: leaderboard.title, user: shownName, login: name, count, rank });
  return { leaderboard, count, rank: rank ?? 1 };
}

/** `!stats [Name]`: the viewer's count and place in every list they are in, in list order. */
export function standingsText(login: string): string {
  const parts = listLeaderboards()
    .map((l) => ({ l, s: standing(l.key, login) }))
    .filter(({ s }) => s.count > 0)
    .map(({ l, s }) => `${l.title} ${s.count} (Platz ${s.rank})`);
  return parts.length ? `@${login}: ${parts.join(', ')}.` : `@${login} hat noch nichts eingelöst.`;
}

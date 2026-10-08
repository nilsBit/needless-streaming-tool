import { getDb } from '../db/index';

/**
 * The account of the tool's own points: one row per viewer, totals only.
 * **Beitrag** (`total`) is everything ever earned and is never lowered by
 * spending; **Guthaben** (`balance`) is what can be spent; `stream_total` is
 * the Beitrag of the current stream. No connections here — earn.ts decides
 * who earns what and when.
 */

export interface ViewerPoints {
  user_name: string;
  display_name: string;
  balance: number;
  total: number;
  stream_total: number;
  last_earned_at: string;
}

export interface Standing extends ViewerPoints {
  /** Place by Beitrag, 1 is the top. */
  rank: number;
}

const login = (name: string) => name.trim().replace(/^@/, '').toLowerCase();

/** Adds earned points to Guthaben, Beitrag and the Beitrag of this stream. */
export function addPoints(name: string, displayName: string, amount: number): void {
  if (!Number.isInteger(amount) || amount <= 0) return;
  getDb().prepare(`
    INSERT INTO viewer_points (user_name, display_name, balance, total, stream_total, last_earned_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_name) DO UPDATE SET
      display_name = excluded.display_name,
      balance = balance + excluded.balance,
      total = total + excluded.total,
      stream_total = stream_total + excluded.stream_total,
      last_earned_at = CURRENT_TIMESTAMP
  `).run(login(name), displayName.trim() || login(name), amount, amount, amount);
}

/**
 * A mod gives (positive) or takes (negative). Giving counts like earning;
 * taking is a correction and lowers Guthaben and Beitrag, never below zero.
 * Answers the new standing, or null when there is nobody to take from.
 */
export function adjustPoints(name: string, amount: number, displayName?: string): Standing | null {
  const user = login(name);
  if (amount > 0) {
    addPoints(user, displayName ?? user, amount);
  } else if (amount < 0) {
    const changed = getDb().prepare(`
      UPDATE viewer_points SET
        balance = MAX(0, balance + ?),
        total = MAX(0, total + ?),
        stream_total = MAX(0, stream_total + ?)
      WHERE user_name = ?
    `).run(amount, amount, amount, user).changes;
    if (!changed) return null;
  }
  return standing(user);
}

/** Takes from the Guthaben only — spending. False when there is not enough. */
export function spendPoints(name: string, amount: number): boolean {
  return getDb().prepare('UPDATE viewer_points SET balance = balance - ? WHERE user_name = ? AND balance >= ?')
    .run(amount, login(name), amount).changes > 0;
}

/** Gives spent points back, when the action they paid for did not happen. */
export function refundPoints(name: string, amount: number): void {
  getDb().prepare('UPDATE viewer_points SET balance = balance + ? WHERE user_name = ?').run(amount, login(name));
}

export function standing(name: string): Standing | null {
  const row = getDb().prepare('SELECT * FROM viewer_points WHERE user_name = ?').get(login(name)) as ViewerPoints | undefined;
  if (!row) return null;
  const ahead = getDb().prepare('SELECT COUNT(*) AS n FROM viewer_points WHERE total > ?').get(row.total) as { n: number };
  return { ...row, rank: ahead.n + 1 };
}

/** The top by Beitrag — of all time, or of this stream. Nobody with nothing. */
export function topByContribution(limit: number, scope: 'all' | 'stream' = 'all'): ViewerPoints[] {
  const column = scope === 'stream' ? 'stream_total' : 'total';
  return getDb().prepare(`SELECT * FROM viewer_points WHERE ${column} > 0 ORDER BY ${column} DESC, display_name ASC LIMIT ?`)
    .all(Math.max(1, Math.floor(limit))) as ViewerPoints[];
}

/** Everyone, ranked by Beitrag; `q` narrows by name. For the app. */
export function listViewers(q = '', limit = 200): Standing[] {
  const search = `%${q.trim().toLowerCase().replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const rows = getDb().prepare(`
    SELECT v.*, (SELECT COUNT(*) FROM viewer_points o WHERE o.total > v.total) + 1 AS rank
    FROM viewer_points v
    WHERE v.user_name LIKE ? ESCAPE '\\' OR LOWER(v.display_name) LIKE ? ESCAPE '\\'
    ORDER BY v.total DESC, v.display_name ASC
    LIMIT ?
  `).all(search, search, Math.max(1, Math.floor(limit))) as Standing[];
  return rows;
}

/** A new stream began: everyone's Beitrag of this stream starts at zero. */
export function resetStreamContribution(): void {
  getDb().prepare('UPDATE viewer_points SET stream_total = 0 WHERE stream_total <> 0').run();
}

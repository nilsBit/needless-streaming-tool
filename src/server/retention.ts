import { getDb } from './db/index';

/**
 * What the app keeps about viewers, and for how long. Twitch logins are
 * personal data: finished song requests go after 90 days; a viewer who has
 * not redeemed anything for a year leaves the leaderboard counts; a viewer
 * can be forgotten on request, with everything stored under their name.
 * There is no log of redemptions — only the counts. privacy-text.ts tells
 * viewers exactly this.
 */
export const RETENTION_DAYS = 90;
export const LEADERBOARD_INACTIVE_DAYS = 365;

export interface PruneResult { songRequests: number; leaderboard: number }

export function pruneViewerData(days: number = RETENTION_DAYS, inactiveDays: number = LEADERBOARD_INACTIVE_DAYS): PruneResult {
  const db = getDb();
  const cutoff = `-${Math.max(1, Math.floor(days))} days`;
  const inactive = `-${Math.max(1, Math.floor(inactiveDays))} days`;
  const songRequests = db.prepare("DELETE FROM song_requests WHERE status IN ('done', 'skipped') AND created_at < datetime('now', ?)").run(cutoff).changes;
  const leaderboard = db.prepare("DELETE FROM reward_stats WHERE last_redeemed_at < datetime('now', ?)").run(inactive).changes;
  if (songRequests || leaderboard) {
    console.log(`[Retention] Pruned ${songRequests} finished song requests older than ${days} days and ${leaderboard} leaderboard entries idle for ${inactiveDays} days`);
  }
  return { songRequests, leaderboard };
}

export function forgetViewer(name: string): { rewardStats: number; rewards: number; songRequests: number } {
  const login = name.trim().toLowerCase();
  const db = getDb();
  return {
    rewardStats: db.prepare('DELETE FROM reward_stats WHERE user_name = ?').run(login).changes,
    rewards: db.prepare('DELETE FROM rewards WHERE LOWER(user_name) = ?').run(login).changes,
    songRequests: db.prepare('DELETE FROM song_requests WHERE LOWER(requested_by) = ?').run(login).changes,
  };
}

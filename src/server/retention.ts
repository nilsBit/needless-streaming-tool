import { getDb } from './db/index';

/**
 * What the app keeps about viewers, and for how long. Twitch logins are
 * personal data: the redemption log and finished song requests go after 90
 * days; a viewer can be forgotten on request, with everything stored under
 * their name. Counts and the leaderboard stay until the streamer removes
 * them — they are the stream's own record.
 */
export const RETENTION_DAYS = 90;

export function pruneViewerData(days: number = RETENTION_DAYS): { rewardLog: number; songRequests: number } {
  const db = getDb();
  const cutoff = `-${Math.max(1, Math.floor(days))} days`;
  const rewardLog = db.prepare("DELETE FROM reward_log WHERE created_at < datetime('now', ?)").run(cutoff).changes;
  const songRequests = db.prepare("DELETE FROM song_requests WHERE status IN ('done', 'skipped') AND created_at < datetime('now', ?)").run(cutoff).changes;
  if (rewardLog || songRequests) console.log(`[Retention] Pruned ${rewardLog} redemption log rows and ${songRequests} finished song requests older than ${days} days`);
  return { rewardLog, songRequests };
}

export function forgetViewer(name: string): { rewardStats: number; rewardLog: number; rewards: number; songRequests: number } {
  const login = name.trim().toLowerCase();
  const db = getDb();
  return {
    rewardStats: db.prepare('DELETE FROM reward_stats WHERE user_name = ?').run(login).changes,
    rewardLog: db.prepare('DELETE FROM reward_log WHERE LOWER(user_name) = ?').run(login).changes,
    rewards: db.prepare('DELETE FROM rewards WHERE LOWER(user_name) = ?').run(login).changes,
    songRequests: db.prepare('DELETE FROM song_requests WHERE LOWER(requested_by) = ?').run(login).changes,
  };
}

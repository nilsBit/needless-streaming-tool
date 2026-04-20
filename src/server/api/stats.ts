import { Router } from 'express';
import { getDb } from '../db/index';
import type { Stats } from '../../shared/types';

const router = Router();

function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// Count per day over the last 14 days, oldest first.
// Pass the expression that evaluates to a 'YYYY-MM-DD' string for each row
// (e.g. "strftime('%Y-%m-%d', created_at)" or "session_date").
function trendCounts(table: string, dayExpr: string): number[] {
  const db = getDb();
  const since = daysAgoStr(13); // inclusive — today + 13 prior = 14
  const rows = db.prepare(
    `SELECT ${dayExpr} AS day, COUNT(*) AS n
       FROM ${table}
       WHERE ${dayExpr} >= ?
       GROUP BY day`
  ).all(since) as Array<{ day: string; n: number }>;

  const byDay = new Map(rows.map(r => [r.day, r.n]));
  const out: number[] = [];
  for (let i = 13; i >= 0; i--) {
    out.push(byDay.get(daysAgoStr(i)) ?? 0);
  }
  return out;
}

router.get('/', (_req, res) => {
  const db = getDb();
  const today = daysAgoStr(0);
  const yesterday = daysAgoStr(1);
  const sevenDaysAgo = daysAgoStr(6); // inclusive window of 7 days

  // Single query for counts + deltas where possible.
  const row = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM clips WHERE session_date = ?)                                     AS today_clips,
      (SELECT COUNT(*) FROM clips WHERE session_date = ?)                                     AS yday_clips,

      (SELECT COUNT(*) FROM todos WHERE done = 1 AND DATE(created_at) = ?)                    AS today_todos_done,
      (SELECT COUNT(*) FROM todos WHERE done = 1 AND DATE(created_at) >= ?
                                                   AND DATE(created_at) <= ?)                 AS week_todos_done,

      (SELECT COUNT(*) FROM issues WHERE DATE(created_at) = ?)                                AS today_issues,
      (SELECT COUNT(*) FROM issues WHERE DATE(created_at) = ?)                                AS yday_issues,

      (SELECT COUNT(*) FROM milestones WHERE DATE(completed_at) = ?)                          AS today_milestones,
      (SELECT COUNT(*) FROM milestones WHERE DATE(completed_at) = ?)                          AS yday_milestones,

      (SELECT COUNT(*) FROM todos WHERE done = 1)                                             AS prog_todos_done,
      (SELECT COUNT(*) FROM todos)                                                            AS prog_todos_total,
      (SELECT COUNT(*) FROM milestones WHERE status = 'completed')                            AS prog_ms_done,
      (SELECT COUNT(*) FROM milestones)                                                       AS prog_ms_total,
      (SELECT COUNT(*) FROM issues WHERE status = 'open')                                     AS prog_issues_open,
      (SELECT COUNT(*) FROM issues)                                                           AS prog_issues_total,

      (SELECT COUNT(*) FROM clips)                                                            AS total_clips,
      (SELECT COUNT(*) FROM raids)                                                            AS total_raids,
      (SELECT COUNT(*) FROM rewards)                                                          AS total_rewards,
      (SELECT COUNT(DISTINCT session_date) FROM clips WHERE session_date >= ?)                AS active_days_30d
  `).get(
    today, yesterday,
    today, sevenDaysAgo, today,
    today, yesterday,
    today, yesterday,
    daysAgoStr(29)
  ) as Record<string, number>;

  // 7-day avg for todos (done-per-day, averaged over last 7 days including today)
  const weekTodosAvg = row.week_todos_done / 7;

  // Active trend: for each of last 14 days, 1 if ANY clip.session_date = day, else 0.
  // Compute via a DISTINCT session_date lookup.
  const activeDays = db.prepare(
    `SELECT DISTINCT session_date AS day FROM clips WHERE session_date >= ?`
  ).all(daysAgoStr(13)) as Array<{ day: string }>;
  const activeSet = new Set(activeDays.map(r => r.day));
  const activeTrend: number[] = [];
  for (let i = 13; i >= 0; i--) {
    activeTrend.push(activeSet.has(daysAgoStr(i)) ? 1 : 0);
  }

  const payload: Stats = {
    today: {
      clips: row.today_clips,
      delta_clips: row.today_clips - row.yday_clips,
      todos_done: row.today_todos_done,
      delta_todos: Math.round((row.today_todos_done - weekTodosAvg) * 10) / 10,
      new_issues: row.today_issues,
      delta_issues: row.today_issues - row.yday_issues,
      milestones: row.today_milestones,
      delta_milestones: row.today_milestones - row.yday_milestones,
    },
    progress: {
      todos:      { done: row.prog_todos_done, total: row.prog_todos_total },
      milestones: { completed: row.prog_ms_done, total: row.prog_ms_total },
      issues:     { open: row.prog_issues_open, total: row.prog_issues_total },
    },
    totals: {
      clips: row.total_clips,
      raids: row.total_raids,
      rewards: row.total_rewards,
      active_days_30d: row.active_days_30d,
    },
    trends: {
      clips:   trendCounts('clips',   'session_date'),
      raids:   trendCounts('raids',   "strftime('%Y-%m-%d', created_at)"),
      rewards: trendCounts('rewards', "strftime('%Y-%m-%d', created_at)"),
      active:  activeTrend,
    },
  };

  res.json(payload);
});

export default router;

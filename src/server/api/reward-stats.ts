import { Router } from 'express';
import { getDb } from '../db/index';
import { checkAndBroadcast } from '../reward-leaderboard';

const router = Router();

// Distinct reward types (for filter dropdowns)
router.get('/types', (_req, res) => {
  const rows = getDb().prepare('SELECT DISTINCT reward_type FROM reward_stats ORDER BY reward_type').all() as Array<{ reward_type: string }>;
  res.json(rows.map(r => r.reward_type));
});

// Paginated detail log (MUST be before /:username to avoid route collision)
router.get('/log', (req, res) => {
  const { user, type, offset, limit } = req.query;
  const maxLimit = Math.min(Number(limit) || 50, 200);
  const skip = Number(offset) || 0;

  let query = 'SELECT * FROM reward_log';
  let countQuery = 'SELECT COUNT(*) as total FROM reward_log';
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (user) { conditions.push('user_name = ?'); values.push(user); }
  if (type) { conditions.push('reward_type = ?'); values.push(type); }

  if (conditions.length > 0) {
    const where = ' WHERE ' + conditions.join(' AND ');
    query += where;
    countQuery += where;
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';

  const total = (getDb().prepare(countQuery).get(...values) as { total: number }).total;
  const items = getDb().prepare(query).all(...values, maxLimit, skip);
  res.json({ items, total });
});

// Leaderboard — aggregated stats
router.get('/', (req, res) => {
  const { type, sort, limit } = req.query;
  const maxLimit = Math.min(Number(limit) || 50, 200);
  const orderBy = sort === 'last_redeemed_at' ? 'last_redeemed_at DESC' : 'count DESC';

  if (type) {
    const rows = getDb().prepare(
      `SELECT user_name, reward_type, count, last_redeemed_at
       FROM reward_stats WHERE reward_type = ?
       ORDER BY ${orderBy} LIMIT ?`
    ).all(type, maxLimit);
    res.json(rows);
  } else {
    const rows = getDb().prepare(
      `SELECT user_name, SUM(count) as count, MAX(last_redeemed_at) as last_redeemed_at
       FROM reward_stats GROUP BY user_name
       ORDER BY ${orderBy} LIMIT ?`
    ).all(maxLimit);
    res.json(rows);
  }
});

// Manually add or update reward stats
router.post('/', (req, res) => {
  const { user_name, reward_type, count } = req.body;
  if (!user_name || !reward_type || count == null) {
    res.status(400).json({ error: 'user_name, reward_type, and count are required' });
    return;
  }
  const normalizedName = String(user_name).trim().toLowerCase().slice(0, 100);
  const normalizedType = String(reward_type).trim().slice(0, 100);
  const numCount = Math.max(0, Math.floor(Number(count)));
  if (!normalizedName || !normalizedType || !Number.isFinite(numCount)) {
    res.status(400).json({ error: 'Invalid input values' });
    return;
  }
  const db = getDb();
  db.prepare(`
    INSERT INTO reward_stats (user_name, reward_type, count, last_redeemed_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_name, reward_type)
    DO UPDATE SET count = ?, last_redeemed_at = CURRENT_TIMESTAMP
  `).run(normalizedName, normalizedType, numCount, numCount);

  checkAndBroadcast('all');
  checkAndBroadcast(normalizedType);
  res.json({ ok: true });
});

// Delete a reward stat entry
router.delete('/:username/:type', (req, res) => {
  const { username, type } = req.params;
  getDb().prepare('DELETE FROM reward_stats WHERE user_name = ? AND reward_type = ?').run(username, type);
  checkAndBroadcast('all');
  checkAndBroadcast(type);
  res.json({ ok: true });
});

// Stats for a specific user
router.get('/:username', (req, res) => {
  const { username } = req.params;
  const byType = getDb().prepare(
    'SELECT reward_type, count, last_redeemed_at FROM reward_stats WHERE user_name = ? ORDER BY count DESC'
  ).all(username) as Array<{ reward_type: string; count: number; last_redeemed_at: string }>;

  const total = byType.reduce((sum, r) => sum + r.count, 0);
  res.json({ user_name: username, total, by_type: byType });
});

export default router;

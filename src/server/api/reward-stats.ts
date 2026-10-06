import { Router } from 'express';
import { forgetViewer } from '../retention';
import { flexBoard, flexRewardKeyword, grantFlexCredit, saveFlexRewardKeyword } from '../flex';
import { getDb } from '../db/index';
import { checkAndBroadcast } from '../reward-leaderboard';

const router = Router();

// Distinct reward types (for filter dropdowns)
router.get('/types', (_req, res) => {
  const rows = getDb().prepare('SELECT DISTINCT reward_type FROM reward_stats ORDER BY reward_type').all() as Array<{ reward_type: string }>;
  res.json(rows.map(r => r.reward_type));
});

// The Bestenliste: everyone with flexes or open credits, most flexes first.
router.get('/breakdown', (_req, res) => {
  res.json(flexBoard());
});

// Which reward in Twitch unlocks a flex — any reward whose name contains this.
router.get('/flex-settings', (_req, res) => {
  res.json({ reward: flexRewardKeyword() });
});

router.post('/flex-settings', (req, res) => {
  const result = saveFlexRewardKeyword((req.body as { reward?: unknown } | undefined)?.reward);
  if ('error' in result) { res.status(400).json(result); return; }
  res.json(result);
});

// A flex unlocked by hand — for a redemption the tool missed, or as a gift.
router.post('/flex/credit', (req, res) => {
  const { user_name } = (req.body ?? {}) as { user_name?: unknown };
  if (typeof user_name !== 'string' || !/^[a-z0-9_]{1,25}$/i.test(user_name.trim())) {
    res.status(400).json({ error: 'user_name must be a Twitch login' });
    return;
  }
  res.json({ ok: true, credits: grantFlexCredit(user_name.trim()) });
});

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

// Forget a viewer: every row stored under the login — counts, log, raw redemptions, song requests.
router.post('/forget', (req, res) => {
  const { user_name } = (req.body ?? {}) as { user_name?: unknown };
  if (typeof user_name !== 'string' || !/^[a-z0-9_]{1,25}$/i.test(user_name.trim())) {
    res.status(400).json({ error: 'user_name must be a Twitch login' });
    return;
  }
  const removed = forgetViewer(user_name);
  checkAndBroadcast('all');
  res.json({ ok: true, removed });
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

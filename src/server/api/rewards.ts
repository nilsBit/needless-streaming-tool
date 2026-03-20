import { Router } from 'express';
import { getDb } from '../db/index';
import { broadcast } from '../websocket/index';
import { VALID_REWARD_STATUS } from '../../shared/types';
import { validateEnum, requireRow } from './validate';

const router = Router();

router.get('/', (req, res) => {
  const { status, reward_type } = req.query;
  let query = 'SELECT * FROM rewards';
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (status) { conditions.push('status = ?'); values.push(status); }
  if (reward_type) { conditions.push('reward_type = ?'); values.push(reward_type); }

  if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
  query += ' ORDER BY created_at DESC';

  const rewards = getDb().prepare(query).all(...values);
  res.json(rewards);
});

router.post('/', (req, res) => {
  const { user_name, reward_type, data } = req.body;
  if (!user_name || !reward_type) {
    res.status(400).json({ error: 'user_name and reward_type required' });
    return;
  }

  const result = getDb().prepare(
    'INSERT INTO rewards (user_name, reward_type, data) VALUES (?, ?, ?)'
  ).run(user_name, reward_type, data ? JSON.stringify(data) : null);

  const reward = getDb().prepare('SELECT * FROM rewards WHERE id = ?').get(result.lastInsertRowid);
  broadcast('reward-redeemed', reward);
  res.status(201).json(reward);
});

router.patch('/:id', (req, res) => {
  const { status } = req.body;
  if (!status) { res.status(400).json({ error: 'status required' }); return; }
  if (!validateEnum(status, VALID_REWARD_STATUS, 'status', res)) return;

  const existing = getDb().prepare('SELECT * FROM rewards WHERE id = ?').get(req.params.id);
  if (!requireRow(existing, res)) return;

  getDb().prepare('UPDATE rewards SET status = ? WHERE id = ?').run(status, req.params.id);
  const reward = getDb().prepare('SELECT * FROM rewards WHERE id = ?').get(req.params.id);

  broadcast('reward-updated', reward);
  res.json(reward);
});

router.delete('/clear-done', (_req, res) => {
  getDb().prepare("DELETE FROM rewards WHERE status = 'done'").run();
  broadcast('reward-updated', null);
  res.json({ ok: true });
});

export default router;

import { Router } from 'express';
import { getDb } from '../db/index';
import { broadcast } from '../websocket/index';

const router = Router();

function calculateTier(viewerCount: number): string {
  if (viewerCount >= 100) return 'boss';
  if (viewerCount >= 50) return 'mini-boss';
  if (viewerCount >= 10) return 'elite';
  return 'mob';
}

router.get('/', (_req, res) => {
  const raids = getDb().prepare('SELECT * FROM raids ORDER BY created_at DESC').all();
  res.json(raids);
});

router.post('/', (req, res) => {
  const { streamer_name, viewer_count } = req.body;
  if (!streamer_name || viewer_count === undefined) {
    res.status(400).json({ error: 'streamer_name and viewer_count required' });
    return;
  }

  const enemy_tier = calculateTier(viewer_count);
  const result = getDb().prepare(
    'INSERT INTO raids (streamer_name, viewer_count, enemy_tier) VALUES (?, ?, ?)'
  ).run(streamer_name, viewer_count, enemy_tier);

  const raid = getDb().prepare('SELECT * FROM raids WHERE id = ?').get(result.lastInsertRowid);
  broadcast('raid-incoming', raid);
  res.status(201).json(raid);
});

router.patch('/:id', (req, res) => {
  const { enemy_name, status } = req.body;
  const db = getDb();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (enemy_name !== undefined) { fields.push('enemy_name = ?'); values.push(enemy_name); }
  if (status !== undefined) { fields.push('status = ?'); values.push(status); }

  if (fields.length === 0) { res.status(400).json({ error: 'No fields to update' }); return; }

  values.push(req.params.id);
  db.prepare(`UPDATE raids SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  const raid = db.prepare('SELECT * FROM raids WHERE id = ?').get(req.params.id);

  broadcast('raid-updated', raid);
  res.json(raid);
});

export default router;

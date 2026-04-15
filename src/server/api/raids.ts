import { Router } from 'express';
import { getDb } from '../db/index';
import { broadcast } from '../websocket/index';
import { requireRow } from './validate';

const router = Router();

router.get('/', (_req, res) => {
  const raids = getDb().prepare('SELECT * FROM raids ORDER BY created_at DESC').all();
  res.json(raids);
});

router.post('/', (req, res) => {
  const { streamer_name, viewer_count } = req.body;
  if (!streamer_name) { res.status(400).json({ error: 'streamer_name required' }); return; }
  if (viewer_count === undefined) { res.status(400).json({ error: 'viewer_count required' }); return; }

  const result = getDb().prepare('INSERT INTO raids (streamer_name, viewer_count, enemy_tier, enemy_name) VALUES (?, ?, ?, ?)').run(streamer_name, viewer_count, 'unknown', null);
  const raid = getDb().prepare('SELECT * FROM raids WHERE id = ?').get(result.lastInsertRowid);

  broadcast('raid-created', raid);
  res.status(201).json(raid);
});

router.delete('/:id', (req, res) => {
  const existing = getDb().prepare('SELECT * FROM raids WHERE id = ?').get(req.params.id);
  if (!requireRow(existing, res)) return;

  getDb().prepare('DELETE FROM raids WHERE id = ?').run(req.params.id);
  broadcast('raid-deleted', { id: Number(req.params.id) });
  res.status(204).send();
});

export default router;

import { Router } from 'express';
import { getDb } from '../db/index';
import { broadcast } from '../websocket/index';

const router = Router();

router.get('/', (_req, res) => {
  const designs = getDb().prepare('SELECT * FROM designs ORDER BY created_at DESC').all();
  res.json(designs);
});

router.post('/', (req, res) => {
  const { title, type } = req.body;
  if (!title || !type) { res.status(400).json({ error: 'title and type required' }); return; }

  const result = getDb().prepare('INSERT INTO designs (title, type) VALUES (?, ?)').run(title, type);
  const design = getDb().prepare('SELECT * FROM designs WHERE id = ?').get(result.lastInsertRowid);

  broadcast('design-created', design);
  res.status(201).json(design);
});

router.patch('/:id', (req, res) => {
  const { title, type, poll_data, status } = req.body;
  const db = getDb();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (title !== undefined) { fields.push('title = ?'); values.push(title); }
  if (type !== undefined) { fields.push('type = ?'); values.push(type); }
  if (poll_data !== undefined) { fields.push('poll_data = ?'); values.push(JSON.stringify(poll_data)); }
  if (status !== undefined) { fields.push('status = ?'); values.push(status); }

  if (fields.length === 0) { res.status(400).json({ error: 'No fields to update' }); return; }

  values.push(req.params.id);
  db.prepare(`UPDATE designs SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  const design = db.prepare('SELECT * FROM designs WHERE id = ?').get(req.params.id);

  broadcast('design-updated', design);
  res.json(design);
});

export default router;

import { Router } from 'express';
import { getDb } from '../db/index';
import { broadcast } from '../websocket/index';

const router = Router();

router.get('/', (req, res) => {
  const { session_date, tag } = req.query;
  let query = 'SELECT * FROM clips';
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (session_date) { conditions.push('session_date = ?'); values.push(session_date); }
  if (tag) { conditions.push('tag = ?'); values.push(tag); }

  if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
  query += ' ORDER BY created_at DESC';

  const clips = getDb().prepare(query).all(...values);
  res.json(clips);
});

router.post('/', (req, res) => {
  const { tag, note } = req.body;
  if (!tag) { res.status(400).json({ error: 'tag required' }); return; }

  const sessionDate = new Date().toISOString().split('T')[0];
  const result = getDb().prepare(
    'INSERT INTO clips (tag, note, session_date) VALUES (?, ?, ?)'
  ).run(tag, note || null, sessionDate);

  const clip = getDb().prepare('SELECT * FROM clips WHERE id = ?').get(result.lastInsertRowid);
  broadcast('clip-created', clip);
  res.status(201).json(clip);
});

router.patch('/:id', (req, res) => {
  const { tag, note } = req.body;
  const db = getDb();

  const existing = db.prepare('SELECT * FROM clips WHERE id = ?').get(req.params.id);
  if (!existing) { res.status(404).json({ error: 'Clip not found' }); return; }

  const fields: string[] = [];
  const values: unknown[] = [];

  if (tag !== undefined) { fields.push('tag = ?'); values.push(tag); }
  if (note !== undefined) { fields.push('note = ?'); values.push(note); }

  if (fields.length === 0) { res.status(400).json({ error: 'No fields to update' }); return; }

  values.push(req.params.id);
  db.prepare(`UPDATE clips SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  const clip = db.prepare('SELECT * FROM clips WHERE id = ?').get(req.params.id);

  broadcast('clip-updated', clip);
  res.json(clip);
});

router.delete('/:id', (req, res) => {
  getDb().prepare('DELETE FROM clips WHERE id = ?').run(req.params.id);
  broadcast('clip-deleted', { id: Number(req.params.id) });
  res.status(204).send();
});

export default router;

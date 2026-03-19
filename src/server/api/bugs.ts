import { Router } from 'express';
import { getDb } from '../db/index';
import { broadcast } from '../websocket/index';
import { VALID_BUG_STATUS } from '../../shared/types';
import { validateEnum, requireRow } from './validate';

const router = Router();

router.get('/', (_req, res) => {
  const bugs = getDb().prepare('SELECT * FROM bugs ORDER BY created_at DESC').all();
  res.json(bugs);
});

router.post('/', (req, res) => {
  const { title, description } = req.body;
  if (!title) { res.status(400).json({ error: 'title required' }); return; }

  const result = getDb().prepare('INSERT INTO bugs (title, description) VALUES (?, ?)').run(title, description || null);
  const bug = getDb().prepare('SELECT * FROM bugs WHERE id = ?').get(result.lastInsertRowid);

  broadcast('bug-created', bug);
  res.status(201).json(bug);
});

router.patch('/:id', (req, res) => {
  const { title, description, status } = req.body;
  const db = getDb();

  if (!validateEnum(status, VALID_BUG_STATUS, 'status', res)) return;

  const existing = db.prepare('SELECT * FROM bugs WHERE id = ?').get(req.params.id);
  if (!requireRow(existing, res)) return;

  const fields: string[] = [];
  const values: unknown[] = [];

  if (title !== undefined) { fields.push('title = ?'); values.push(title); }
  if (description !== undefined) { fields.push('description = ?'); values.push(description); }
  if (status !== undefined) { fields.push('status = ?'); values.push(status); }

  if (fields.length === 0) { res.status(400).json({ error: 'No fields to update' }); return; }

  values.push(req.params.id);
  db.prepare(`UPDATE bugs SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  const bug = db.prepare('SELECT * FROM bugs WHERE id = ?').get(req.params.id);

  broadcast('bug-updated', bug);
  res.json(bug);
});

router.delete('/:id', (req, res) => {
  const existing = getDb().prepare('SELECT * FROM bugs WHERE id = ?').get(req.params.id);
  if (!requireRow(existing, res)) return;

  getDb().prepare('DELETE FROM bugs WHERE id = ?').run(req.params.id);
  broadcast('bug-deleted', { id: Number(req.params.id) });
  res.status(204).send();
});

export default router;

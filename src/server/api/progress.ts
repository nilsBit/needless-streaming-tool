import { Router } from 'express';
import { getDb } from '../db/index';
import { broadcast } from '../websocket/index';
import { VALID_PROJECT_ITEM_STATUS } from '../../shared/types';
import { validateEnum } from './validate';

const router = Router();

// GET project + all items
router.get('/', (_req, res) => {
  const state = getDb().prepare('SELECT project_name FROM stream_state WHERE id = 1').get() as { project_name: string | null };
  const items = getDb().prepare('SELECT * FROM project_items ORDER BY sort_order ASC, created_at ASC').all();
  res.json({ project_name: state?.project_name || null, items });
});

// PATCH project name
router.patch('/project', (req, res) => {
  const { project_name } = req.body;
  if (project_name === undefined) { res.status(400).json({ error: 'project_name required' }); return; }
  getDb().prepare('UPDATE stream_state SET project_name = ? WHERE id = 1').run(project_name);
  const state = getDb().prepare('SELECT project_name FROM stream_state WHERE id = 1').get();
  broadcast('progress-update', state);
  res.json(state);
});

// POST new item
router.post('/items', (req, res) => {
  const { title } = req.body;
  if (!title) { res.status(400).json({ error: 'title required' }); return; }

  const maxOrder = getDb().prepare('SELECT MAX(sort_order) as max FROM project_items').get() as { max: number | null };
  const sortOrder = (maxOrder?.max ?? -1) + 1;

  const result = getDb().prepare('INSERT INTO project_items (title, sort_order) VALUES (?, ?)').run(title, sortOrder);
  const item = getDb().prepare('SELECT * FROM project_items WHERE id = ?').get(result.lastInsertRowid);
  broadcast('progress-update', { action: 'item-created', item });
  res.status(201).json(item);
});

// PATCH item (status, title, sort_order)
router.patch('/items/:id', (req, res) => {
  const { title, status, sort_order } = req.body;
  const db = getDb();

  if (status !== undefined && !validateEnum(status, VALID_PROJECT_ITEM_STATUS, 'status', res)) return;

  const existing = db.prepare('SELECT * FROM project_items WHERE id = ?').get(req.params.id);
  if (!existing) { res.status(404).json({ error: 'Item not found' }); return; }

  const fields: string[] = [];
  const values: unknown[] = [];

  if (title !== undefined) { fields.push('title = ?'); values.push(title); }
  if (status !== undefined) { fields.push('status = ?'); values.push(status); }
  if (sort_order !== undefined) { fields.push('sort_order = ?'); values.push(sort_order); }

  if (fields.length === 0) { res.status(400).json({ error: 'No fields to update' }); return; }

  values.push(req.params.id);
  db.prepare(`UPDATE project_items SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  const item = db.prepare('SELECT * FROM project_items WHERE id = ?').get(req.params.id);

  broadcast('progress-update', { action: 'item-updated', item });
  res.json(item);
});

// DELETE item
router.delete('/items/:id', (req, res) => {
  getDb().prepare('DELETE FROM project_items WHERE id = ?').run(req.params.id);
  broadcast('progress-update', { action: 'item-deleted', id: Number(req.params.id) });
  res.status(204).send();
});

export default router;

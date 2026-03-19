import { Router } from 'express';
import { getDb } from '../db/index';
import { broadcast } from '../websocket/index';
import { requireRow } from './validate';

const router = Router();

router.get('/', (_req, res) => {
  const todos = getDb().prepare('SELECT * FROM todos ORDER BY done ASC, sort_order ASC, created_at DESC').all();
  res.json(todos);
});

router.post('/', (req, res) => {
  const { title } = req.body;
  if (!title) { res.status(400).json({ error: 'title required' }); return; }

  const maxOrder = getDb().prepare('SELECT MAX(sort_order) as max FROM todos').get() as { max: number | null };
  const sortOrder = (maxOrder?.max || 0) + 1;

  const result = getDb().prepare('INSERT INTO todos (title, sort_order) VALUES (?, ?)').run(title, sortOrder);
  const todo = getDb().prepare('SELECT * FROM todos WHERE id = ?').get(result.lastInsertRowid);

  broadcast('todo-updated', { action: 'created' });
  res.status(201).json(todo);
});

router.patch('/:id', (req, res) => {
  const { title, done } = req.body;
  const db = getDb();

  const existing = db.prepare('SELECT * FROM todos WHERE id = ?').get(req.params.id);
  if (!requireRow(existing, res)) return;

  const fields: string[] = [];
  const values: unknown[] = [];

  if (title !== undefined) { fields.push('title = ?'); values.push(title); }
  if (done !== undefined) { fields.push('done = ?'); values.push(done ? 1 : 0); }

  if (fields.length === 0) { res.status(400).json({ error: 'No fields to update' }); return; }

  values.push(req.params.id);
  db.prepare(`UPDATE todos SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  const todo = db.prepare('SELECT * FROM todos WHERE id = ?').get(req.params.id);

  broadcast('todo-updated', { action: 'updated' });
  res.json(todo);
});

router.delete('/:id', (req, res) => {
  const existing = getDb().prepare('SELECT * FROM todos WHERE id = ?').get(req.params.id);
  if (!requireRow(existing, res)) return;

  getDb().prepare('DELETE FROM todos WHERE id = ?').run(req.params.id);
  broadcast('todo-updated', { action: 'deleted' });
  res.status(204).send();
});

export default router;

import { Router } from 'express';
import { getDb } from '../db/index';
import { broadcast } from '../websocket/index';
import { VALID_ISSUE_STATUS } from '../../shared/types';
import { validateEnum, requireRow } from './validate';

const router = Router();

router.get('/', (_req, res) => {
  const issues = getDb().prepare('SELECT * FROM issues ORDER BY created_at DESC').all();
  res.json(issues);
});

router.post('/', (req, res) => {
  const { title, description } = req.body;
  if (!title) { res.status(400).json({ error: 'title required' }); return; }

  const result = getDb().prepare('INSERT INTO issues (title, description) VALUES (?, ?)').run(title, description || null);
  const issue = getDb().prepare('SELECT * FROM issues WHERE id = ?').get(result.lastInsertRowid);

  broadcast('issue-created', issue);
  res.status(201).json(issue);
});

router.patch('/:id', (req, res) => {
  const { title, description, status } = req.body;
  const db = getDb();

  if (!validateEnum(status, VALID_ISSUE_STATUS, 'status', res)) return;

  const existing = db.prepare('SELECT * FROM issues WHERE id = ?').get(req.params.id);
  if (!requireRow(existing, res)) return;

  const fields: string[] = [];
  const values: unknown[] = [];

  if (title !== undefined) { fields.push('title = ?'); values.push(title); }
  if (description !== undefined) { fields.push('description = ?'); values.push(description); }
  if (status !== undefined) { fields.push('status = ?'); values.push(status); }

  if (fields.length === 0) { res.status(400).json({ error: 'No fields to update' }); return; }

  values.push(req.params.id);
  db.prepare(`UPDATE issues SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  const issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(req.params.id);

  broadcast('issue-updated', issue);
  res.json(issue);
});

router.delete('/:id', (req, res) => {
  const existing = getDb().prepare('SELECT * FROM issues WHERE id = ?').get(req.params.id);
  if (!requireRow(existing, res)) return;

  getDb().prepare('DELETE FROM issues WHERE id = ?').run(req.params.id);
  broadcast('issue-deleted', { id: Number(req.params.id) });
  res.status(204).send();
});

export default router;

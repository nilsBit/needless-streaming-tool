import { Router } from 'express';
import { getDb } from '../db/index';
import { broadcast } from '../websocket/index';
import { VALID_MILESTONE_LEVEL } from '../../shared/types';
import { validateEnum } from './validate';
import { sayInChat } from '../bot/index';

const router = Router();

router.get('/', (_req, res) => {
  const milestones = getDb().prepare('SELECT * FROM milestones ORDER BY created_at DESC').all();
  res.json(milestones);
});

router.post('/', (req, res) => {
  const { title, level } = req.body;
  if (!title?.trim()) { res.status(400).json({ error: 'title required' }); return; }
  if (!level) { res.status(400).json({ error: 'level required' }); return; }
  if (!validateEnum(level, VALID_MILESTONE_LEVEL, 'level', res)) return;

  const result = getDb().prepare(
    'INSERT INTO milestones (title, level) VALUES (?, ?)'
  ).run(title.trim(), level);

  const milestone = getDb().prepare('SELECT * FROM milestones WHERE id = ?').get(result.lastInsertRowid);

  broadcast('milestone-created', milestone);
  res.status(201).json(milestone);
});

router.patch('/:id', (req, res) => {
  const milestone = getDb().prepare('SELECT * FROM milestones WHERE id = ?').get(req.params.id) as any;
  if (!milestone) { res.status(404).json({ error: 'not found' }); return; }

  if (req.body.status === 'completed' && milestone.status !== 'completed') {
    getDb().prepare(
      'UPDATE milestones SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run('completed', req.params.id);

    const updated = getDb().prepare('SELECT * FROM milestones WHERE id = ?').get(req.params.id);

    // Trigger achievement overlay
    broadcast('milestone-trigger', updated);

    // Announce in chat for major/epic
    if (milestone.level === 'major' || milestone.level === 'epic') {
      const emoji = milestone.level === 'epic' ? '🏆🎉' : '🎉';
      sayInChat(`${emoji} MILESTONE: ${milestone.title}`);
    }

    broadcast('milestone-updated', updated);
    res.json(updated);
    return;
  }

  // Allow editing title/level on pending milestones
  const { title, level } = req.body;
  const updates: string[] = [];
  const values: any[] = [];

  if (title?.trim()) { updates.push('title = ?'); values.push(title.trim()); }
  if (level && VALID_MILESTONE_LEVEL.includes(level)) { updates.push('level = ?'); values.push(level); }

  if (updates.length > 0) {
    values.push(req.params.id);
    getDb().prepare(`UPDATE milestones SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  const updated = getDb().prepare('SELECT * FROM milestones WHERE id = ?').get(req.params.id);
  broadcast('milestone-updated', updated);
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  getDb().prepare('DELETE FROM milestones WHERE id = ?').run(req.params.id);
  broadcast('milestone-deleted', { id: Number(req.params.id) });
  res.status(204).send();
});

export default router;

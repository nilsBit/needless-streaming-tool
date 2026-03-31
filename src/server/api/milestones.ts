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
  const { level, message } = req.body;
  if (!level) { res.status(400).json({ error: 'level required' }); return; }
  if (!validateEnum(level, VALID_MILESTONE_LEVEL, 'level', res)) return;

  const result = getDb().prepare(
    'INSERT INTO milestones (level, message) VALUES (?, ?)'
  ).run(level, message || null);

  const milestone = getDb().prepare('SELECT * FROM milestones WHERE id = ?').get(result.lastInsertRowid);

  broadcast('milestone-trigger', milestone);

  if (level === 'major' || level === 'epic') {
    const emoji = level === 'epic' ? '🏆🎉' : '🎉';
    const text = message ? `${emoji} MILESTONE: ${message}` : `${emoji} MILESTONE erreicht!`;
    sayInChat(text);
  }

  res.status(201).json(milestone);
});

router.delete('/:id', (req, res) => {
  getDb().prepare('DELETE FROM milestones WHERE id = ?').run(req.params.id);
  broadcast('milestone-deleted', { id: Number(req.params.id) });
  res.status(204).send();
});

export default router;

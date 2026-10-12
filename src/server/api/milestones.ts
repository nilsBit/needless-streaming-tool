import { Router } from 'express';
import { getDb } from '../db/index';
import { broadcast } from '../websocket/index';
import { VALID_MILESTONE_LEVEL } from '../../shared/types';
import { validateEnum } from './validate';
import { sayInChat } from '../bot/index';

const router = Router();

router.get('/', (_req, res) => {
  const milestones = getDb().prepare(`
    SELECT m.*,
      COUNT(t.id) AS linkedTodoCount,
      COALESCE(SUM(CASE WHEN t.done = 1 THEN 1 ELSE 0 END), 0) AS linkedTodoDone
    FROM milestones m
    LEFT JOIN todos t ON t.milestone_id = m.id
    GROUP BY m.id
    ORDER BY m.created_at DESC
  `).all();
  res.json(milestones);
});

router.post('/', (req, res) => {
  const { title, level, project_id } = req.body;
  if (!title?.trim()) { res.status(400).json({ error: 'title required' }); return; }
  if (!level) { res.status(400).json({ error: 'level required' }); return; }
  if (!validateEnum(level, VALID_MILESTONE_LEVEL, 'level', res)) return;

  const result = getDb().prepare(
    'INSERT INTO milestones (title, level, project_id) VALUES (?, ?, ?)'
  ).run(title.trim(), level, project_id ?? null);

  const milestone = getDb().prepare('SELECT * FROM milestones WHERE id = ?').get(result.lastInsertRowid);

  broadcast('milestone-created', milestone);
  res.status(201).json(milestone);
});

/** Ticks a milestone off: the overlay celebrates it, the chat hears of the big ones. */
function complete(milestone: { id: number; title: string; level: string }): unknown {
  getDb().prepare(
    'UPDATE milestones SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).run('completed', milestone.id);

  const updated = getDb().prepare('SELECT * FROM milestones WHERE id = ?').get(milestone.id);

  // Trigger achievement overlay
  broadcast('milestone-trigger', updated);

  // Announce in chat for major/epic
  if (milestone.level === 'major' || milestone.level === 'epic') {
    const emoji = milestone.level === 'epic' ? '🏆🎉' : '🎉';
    sayInChat(`${emoji} MILESTONE: ${milestone.title}`);
  }

  broadcast('milestone-updated', updated);
  return updated;
}

// The three hotkeys (and Stream Deck keys) celebrate at their level: the
// oldest open milestone of that level is ticked off; without one the overlay
// celebrates anyway and nothing is stored. They used to create a milestone
// without a title and got 400 (12.10.).
router.post('/celebrate', (req, res) => {
  const { level } = req.body ?? {};
  if (!level) { res.status(400).json({ error: 'level required' }); return; }
  if (!validateEnum(level, VALID_MILESTONE_LEVEL, 'level', res)) return;
  const open = getDb().prepare(
    "SELECT * FROM milestones WHERE level = ? AND status != 'completed' ORDER BY created_at, id LIMIT 1"
  ).get(level) as { id: number; title: string; level: string } | undefined;
  if (open) { res.json({ milestone: complete(open) }); return; }
  broadcast('milestone-trigger', { level, title: 'Meilenstein!' });
  res.json({ milestone: null });
});

router.patch('/:id', (req, res) => {
  const milestone = getDb().prepare('SELECT * FROM milestones WHERE id = ?').get(req.params.id) as any;
  if (!milestone) { res.status(404).json({ error: 'not found' }); return; }

  if (req.body.status === 'completed' && milestone.status !== 'completed') {
    res.json(complete(milestone));
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

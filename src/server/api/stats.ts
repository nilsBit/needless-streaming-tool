import { Router } from 'express';
import { getDb } from '../db/index';

const router = Router();

router.get('/', (_req, res) => {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);

  const stats = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM clips) AS total_clips,
      (SELECT COUNT(*) FROM clips WHERE session_date = ?) AS today_clips,
      (SELECT COUNT(*) FROM bugs) AS total_bugs,
      (SELECT COUNT(*) FROM bugs WHERE status = 'open') AS open_bugs,
      (SELECT COUNT(*) FROM todos) AS total_todos,
      (SELECT COUNT(*) FROM todos WHERE done = 1) AS done_todos,
      (SELECT COUNT(*) FROM milestones) AS total_milestones,
      (SELECT COUNT(*) FROM milestones WHERE status = 'completed') AS completed_milestones,
      (SELECT COUNT(*) FROM raids) AS total_raids,
      (SELECT COUNT(*) FROM rewards) AS total_rewards
  `).get(today);

  res.json(stats);
});

export default router;

import { Router } from 'express';
import { getDb } from '../db/index';

const router = Router();

router.get('/', (_req, res) => {
  const db = getDb();

  const today = new Date().toISOString().slice(0, 10);

  const total_clips = (db.prepare('SELECT COUNT(*) AS c FROM clips').get() as { c: number }).c;
  const today_clips = (db.prepare('SELECT COUNT(*) AS c FROM clips WHERE session_date = ?').get(today) as { c: number }).c;
  const total_bugs = (db.prepare('SELECT COUNT(*) AS c FROM bugs').get() as { c: number }).c;
  const open_bugs = (db.prepare("SELECT COUNT(*) AS c FROM bugs WHERE status = 'open'").get() as { c: number }).c;
  const total_todos = (db.prepare('SELECT COUNT(*) AS c FROM todos').get() as { c: number }).c;
  const done_todos = (db.prepare('SELECT COUNT(*) AS c FROM todos WHERE done = 1').get() as { c: number }).c;
  const total_milestones = (db.prepare('SELECT COUNT(*) AS c FROM milestones').get() as { c: number }).c;
  const completed_milestones = (db.prepare("SELECT COUNT(*) AS c FROM milestones WHERE status = 'completed'").get() as { c: number }).c;
  const total_raids = (db.prepare('SELECT COUNT(*) AS c FROM raids').get() as { c: number }).c;
  const total_rewards = (db.prepare('SELECT COUNT(*) AS c FROM rewards').get() as { c: number }).c;

  res.json({
    total_clips,
    today_clips,
    total_bugs,
    open_bugs,
    total_todos,
    done_todos,
    total_milestones,
    completed_milestones,
    total_raids,
    total_rewards,
  });
});

export default router;

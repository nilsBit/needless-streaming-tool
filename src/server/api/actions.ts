import { Router } from 'express';
import { getDb } from '../db/index';
import { broadcast } from '../websocket/index';

const router = Router();

// POST compile & pray
router.post('/compile-pray', (_req, res) => {
  broadcast('compile-pray', { timestamp: new Date().toISOString() });
  res.json({ triggered: true });
});

// POST bug roulette spin
router.post('/roulette', (_req, res) => {
  const bugs = getDb().prepare('SELECT * FROM bugs WHERE status = ?').all('open') as Array<{ id: number; title: string }>;

  if (bugs.length === 0) {
    res.status(400).json({ error: 'No open bugs' });
    return;
  }

  const winner = bugs[Math.floor(Math.random() * bugs.length)];

  broadcast('roulette-spin', { bugs, winner_id: winner.id });
  broadcast('roulette-result', { title: winner.title, id: winner.id });

  res.json({ winner, bugs_count: bugs.length });
});

export default router;

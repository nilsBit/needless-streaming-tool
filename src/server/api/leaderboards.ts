import { Router } from 'express';
import { createLeaderboard, deleteLeaderboard, leaderboardBoard, listLeaderboards, updateLeaderboard } from '../leaderboards';

const router = Router();

router.get('/', (_req, res) => {
  res.json(listLeaderboards());
});

router.post('/', (req, res) => {
  const result = createLeaderboard(req.body);
  if ('error' in result) { res.status(400).json(result); return; }
  res.status(201).json(result);
});

router.patch('/:key', (req, res) => {
  const result = updateLeaderboard(req.params.key, req.body);
  if (result === null) { res.status(404).json({ error: 'no such list' }); return; }
  if ('error' in result) { res.status(400).json(result); return; }
  res.json(result);
});

router.delete('/:key', (req, res) => {
  const result = deleteLeaderboard(req.params.key);
  if (result === null) { res.status(404).json({ error: 'no such list' }); return; }
  res.json({ ok: true, ...result });
});

router.get('/:key/board', (req, res) => {
  const rows = leaderboardBoard(req.params.key);
  if (rows === null) { res.status(404).json({ error: 'no such list' }); return; }
  res.json(rows);
});

export default router;

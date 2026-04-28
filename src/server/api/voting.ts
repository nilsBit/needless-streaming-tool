import { Router } from 'express';
import { startVote, endVote, cancelVote, getActiveVote } from '../bot/voting';

const router = Router();

// GET active vote
router.get('/', (_req, res) => {
  const vote = getActiveVote();
  res.json(vote || { active: false });
});

// POST start vote
router.post('/start', (req, res) => {
  const { title, options, duration, designId } = req.body;
  if (!options || options.length < 2) {
    res.status(400).json({ error: 'At least 2 options required' });
    return;
  }
  const success = startVote(title || '🗳️ Abstimmung', options, duration || 60, designId || null);
  if (!success) {
    res.status(409).json({ error: 'A vote is already active' });
    return;
  }
  res.json({ started: true });
});

// POST end vote (get result)
router.post('/end', (_req, res) => {
  const result = endVote();
  if (!result) {
    res.status(404).json({ error: 'No active vote' });
    return;
  }
  res.json(result);
});

// POST cancel vote
router.post('/cancel', (_req, res) => {
  cancelVote();
  res.json({ cancelled: true });
});

export default router;

import { Router } from 'express';
import { getPointsConfig, savePointsConfig } from '../points/config';
import { adjustPoints, listViewers } from '../points/ledger';

const router = Router();

const LOGIN_PATTERN = /^[a-z0-9_]{1,25}$/;
const ADJUST_MAX = 1_000_000;

router.get('/config', (_req, res) => {
  res.json(getPointsConfig());
});

router.put('/config', (req, res) => {
  const result = savePointsConfig(req.body);
  if ('error' in result) { res.status(400).json(result); return; }
  res.json(result.config);
});

router.get('/viewers', (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 50) : '';
  res.json(listViewers(q));
});

/** A mod gives (positive amount) or takes (negative). Taking never goes below zero. */
router.post('/viewers/:login/adjust', (req, res) => {
  const login = req.params.login.toLowerCase();
  if (!LOGIN_PATTERN.test(login)) { res.status(400).json({ error: 'not a Twitch login' }); return; }
  const amount = (req.body as { amount?: unknown })?.amount;
  if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount as number) > ADJUST_MAX) {
    res.status(400).json({ error: `amount must be a whole number other than 0, at most ${ADJUST_MAX}` });
    return;
  }
  const result = adjustPoints(login, amount as number);
  if (!result) { res.status(404).json({ error: 'this viewer has no points' }); return; }
  res.json(result);
});

export default router;

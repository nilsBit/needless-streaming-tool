import { Router } from 'express';
import { getPointsConfig, savePointsConfig } from '../points/config';
import { adjustPoints, listViewers } from '../points/ledger';
import { createPointReward, deletePointReward, listPointRewards, updatePointReward } from '../points/rewards';
import { redeem, type RedeemRefusal } from '../points/redeem';
import { isLive, pointBoardsChanged } from '../points/earn';
import { getBotConfig } from '../bot/config';

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

/** For the steps on the Punkte page: whether points flow right now, and who the channel is (to test with). */
router.get('/status', (_req, res) => {
  res.json({ live: isLive(), channel: getBotConfig()?.channel?.toLowerCase() ?? null });
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
  pointBoardsChanged();
  res.json(result);
});

/** "Für jemanden einlösen" — the same function as `!einlösen`, so the app does what chat does. */
const REFUSAL_STATUS: Record<RedeemRefusal, number> = {
  feature_off: 409, unknown: 404, off: 409, input: 400, cooldown: 429, balance: 409, action: 502,
};

router.post('/viewers/:login/redeem', async (req, res) => {
  const login = req.params.login.toLowerCase();
  if (!LOGIN_PATTERN.test(login)) { res.status(400).json({ error: 'not a Twitch login' }); return; }
  const { reward, input } = (req.body ?? {}) as { reward?: unknown; input?: unknown };
  if (typeof reward !== 'string' || !reward.trim()) { res.status(400).json({ error: 'reward must be a name' }); return; }
  const result = await redeem(login, login, reward, typeof input === 'string' ? input : '');
  if (!result.ok) { res.status(REFUSAL_STATUS[result.code]).json({ error: result.code, message: result.message }); return; }
  res.json(result);
});

router.get('/rewards', (_req, res) => {
  res.json(listPointRewards());
});

router.post('/rewards', (req, res) => {
  const result = createPointReward(req.body);
  if ('error' in result) { res.status(400).json(result); return; }
  res.status(201).json(result);
});

router.patch('/rewards/:id', (req, res) => {
  const result = updatePointReward(Number(req.params.id), req.body);
  if (result === null) { res.status(404).json({ error: 'no such reward' }); return; }
  if ('error' in result) { res.status(400).json(result); return; }
  res.json(result);
});

router.delete('/rewards/:id', (req, res) => {
  if (!deletePointReward(Number(req.params.id))) { res.status(404).json({ error: 'no such reward' }); return; }
  res.json({ ok: true });
});

export default router;

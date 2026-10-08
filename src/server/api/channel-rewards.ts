import { Router } from 'express';
import { createChannelReward, deleteChannelReward, listChannelRewards, updateChannelReward } from '../channel-rewards';

/** Twitch channel-point rewards, from the app (#24). Errors carry a sentence for the streamer. */
const router = Router();

const ID = /^[0-9a-f-]{1,64}$/i;

router.get('/', async (_req, res) => {
  const result = await listChannelRewards();
  if ('error' in result) { res.status(result.status).json(result); return; }
  res.json(result);
});

router.post('/', async (req, res) => {
  const result = await createChannelReward(req.body);
  if ('error' in result) { res.status(result.status).json(result); return; }
  res.status(201).json(result);
});

router.patch('/:id', async (req, res) => {
  if (!ID.test(req.params.id)) { res.status(400).json({ error: 'not a reward id' }); return; }
  const result = await updateChannelReward(req.params.id, req.body);
  if ('error' in result) { res.status(result.status).json(result); return; }
  res.json(result);
});

router.delete('/:id', async (req, res) => {
  if (!ID.test(req.params.id)) { res.status(400).json({ error: 'not a reward id' }); return; }
  const result = await deleteChannelReward(req.params.id);
  if (result !== true) { res.status(result.status).json(result); return; }
  res.json({ ok: true });
});

export default router;

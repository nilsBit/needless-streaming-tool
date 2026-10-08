import { Router } from 'express';
import { evaluateQuests, questOverview } from '../quests/index';

/** The streamer's quests (spec 2026-10-08-quests-design). Done only by the state — nothing is written here. */
const router = Router();

router.get('/', async (_req, res) => {
  await evaluateQuests();
  res.json(questOverview());
});

export default router;

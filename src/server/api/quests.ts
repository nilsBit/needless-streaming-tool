import { Router } from 'express';
import { evaluateQuests, markIntroSeen, questOverview } from '../quests/index';

/** The streamer's quests (spec 2026-10-08-quests-design). Done only by the state — nothing is written here. */
const router = Router();

router.get('/', async (_req, res) => {
  await evaluateQuests();
  res.json(questOverview());
});

/** The short intro to quests was shown; it does not come again. */
router.post('/intro-seen', (_req, res) => {
  markIntroSeen();
  res.json({ ok: true });
});

export default router;

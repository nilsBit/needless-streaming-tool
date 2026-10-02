import { Router } from 'express';
import { answerChatMessage } from '../bot/chat-answers';

const router = Router();

/**
 * POST /try — what chat would get for a message, without being live.
 *
 * Goes down the path the bot takes, so trying a command out in the app is
 * trying the real thing. Tries as the streamer unless told otherwise, so it
 * never starts a cooldown for chat.
 */
router.post('/try', async (req, res) => {
  const privileged = req.body?.as !== 'viewer';
  const viewer = typeof req.body?.user === 'string' && req.body.user.trim() ? req.body.user.trim() : undefined;
  res.json(await answerChatMessage(String(req.body?.message ?? ''), privileged, viewer));
});

export default router;

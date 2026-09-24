import { Router } from 'express';
import { builtinDescriptions, commandList, panelText, saveBuiltinDescriptions } from '../bot/command-list';

/** The whole command list — for the app's overview and the text for a Twitch panel. */
const router = Router();

router.get('/', (_req, res) => {
  res.json({ commands: commandList(), panel: panelText(), builtinDescriptions: builtinDescriptions() });
});

/** The streamer's own wording for built-in commands, by command key. */
router.post('/descriptions', (req, res) => {
  const body = req.body;
  if (typeof body !== 'object' || body === null || Array.isArray(body)) { res.status(400).json({ error: 'expected an object of key → text' }); return; }
  res.json({ builtinDescriptions: saveBuiltinDescriptions(body as Record<string, string>) });
});

export default router;

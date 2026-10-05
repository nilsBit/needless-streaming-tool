import { Router } from 'express';
import { builtinDescriptions, commandList, featuredCommands, MAX_FEATURED, panelText, saveBuiltinDescriptions, saveFeaturedCommands } from '../bot/command-list';
import { getAliases, saveAliases } from '../bot/command-names';

/** The whole command list — for the app's overview and the text for a Twitch panel. */
const router = Router();

function overview() {
  const commands = commandList();
  return {
    commands,
    panel: panelText(),
    builtinDescriptions: builtinDescriptions(),
    aliases: getAliases(),
    featured: { ...featuredCommands(commands), max: MAX_FEATURED },
  };
}

router.get('/', (_req, res) => {
  res.json(overview());
});

/** The streamer's own wording for built-in commands, by command key. */
router.post('/descriptions', (req, res) => {
  const body = req.body;
  if (typeof body !== 'object' || body === null || Array.isArray(body)) { res.status(400).json({ error: 'expected an object of key → text' }); return; }
  res.json({ builtinDescriptions: saveBuiltinDescriptions(body as Record<string, string>) });
});

/** Second names: the whole map, alias → command. */
router.post('/aliases', (req, res) => {
  const refusal = saveAliases(req.body);
  if (refusal) { res.status(refusal.status).json({ error: refusal.error, message: refusal.message }); return; }
  res.json(overview());
});

/** The few commands `!befehle` names first; an empty list goes back to the built-in pick. */
router.post('/featured', (req, res) => {
  const result = saveFeaturedCommands((req.body as { triggers?: unknown })?.triggers);
  if ('error' in result) { res.status(400).json(result); return; }
  res.json(overview());
});

export default router;

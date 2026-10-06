import { Router } from 'express';
import { broadcast } from '../websocket/index';
import { getFeatures, markSetupDone, saveFeatures, setupDone, worldbuilderInstalled } from '../features';
import { DEFAULT_FEATURES } from '../../shared/features';

/**
 * The setup on first start and the choice "Was dein Stream kann".
 *   GET  /api/setup           — done?, the chosen features, whether the Worldbuilder is set up here
 *   PUT  /api/setup/features  — { features: [...] } → saves the choice
 *   POST /api/setup/done      — the setup was walked through (or skipped)
 */
const router = Router();

router.get('/', (_req, res) => {
  res.json({ done: setupDone(), features: getFeatures(), worldbuilder: worldbuilderInstalled(), defaults: DEFAULT_FEATURES });
});

router.put('/features', (req, res) => {
  const result = saveFeatures((req.body as { features?: unknown } | undefined)?.features);
  if ('error' in result) { res.status(400).json(result); return; }
  broadcast('features-changed', { features: result.features });
  res.json(result);
});

router.post('/done', (_req, res) => {
  markSetupDone();
  res.json({ done: true });
});

export default router;

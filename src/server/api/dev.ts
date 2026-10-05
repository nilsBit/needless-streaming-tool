import { Router } from 'express';
import { publicOverlayConfig } from '../design-apply';
import { implementStatus, startImplement } from '../design-implement';
import { broadcast } from '../websocket/index';

/**
 * Development-only tools. Under /api/dev, so only the app's own tokens reach
 * it — the Figma token opens /api/design/* and nothing else.
 */
const router = Router();

/** Whether the "Umsetzen" button exists here, and how its last run went. */
router.get('/implement', (_req, res) => {
  res.json(implementStatus());
});

router.post('/implement', (_req, res) => {
  const result = startImplement(() => {
    broadcast('overlay-config', publicOverlayConfig());
    broadcast('design-implement', implementStatus());
  });
  if (result === 'not-available') { res.status(404).json({ error: 'only in development' }); return; }
  if (result === 'running') { res.status(409).json({ error: 'a run is already going' }); return; }
  if (result === 'nothing') { res.status(400).json({ error: 'nothing is waiting' }); return; }
  broadcast('design-implement', implementStatus());
  res.status(202).json(implementStatus());
});

export default router;

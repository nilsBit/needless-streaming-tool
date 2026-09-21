import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { designDir, isKnownState, readStates } from '../showcase';

/**
 * The Figma round trip: captures go out to the plugin, finished frames come
 * back as drafts next to the code. Names from a request only become paths
 * after `isKnownState` — nothing is written outside design/drafts/.
 */
const router = Router();

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function png(base64: unknown): Buffer | null {
  if (typeof base64 !== 'string') return null;
  const bytes = Buffer.from(base64, 'base64');
  return bytes.subarray(0, 8).equals(PNG_SIGNATURE) ? bytes : null;
}

router.get('/states', (_req, res) => {
  res.json(readStates());
});

router.get('/captures', (_req, res) => {
  const found: { overlay: string; state: string }[] = [];
  const { overlays } = readStates();
  for (const [overlay, entry] of Object.entries(overlays)) {
    for (const state of Object.keys(entry.states)) {
      if (fs.existsSync(path.join(designDir(), 'captured', overlay, `${state}.json`))) found.push({ overlay, state });
    }
  }
  res.json(found);
});

router.get('/captures/:overlay/:state', (req, res) => {
  const { overlay, state } = req.params;
  const file = path.join(designDir(), 'captured', overlay, `${state}.json`);
  if (!isKnownState(overlay, state) || !fs.existsSync(file)) { res.status(404).json({ error: 'not captured' }); return; }
  res.type('application/json').send(fs.readFileSync(file, 'utf8'));
});

router.get('/drafts/:overlay/:state', (req, res) => {
  const { overlay, state } = req.params;
  const dir = path.join(designDir(), 'drafts', overlay, state);
  if (!isKnownState(overlay, state) || !fs.existsSync(path.join(dir, 'draft.json'))) { res.status(404).json({ error: 'no draft' }); return; }
  const images = ['image.png', 'image@2x.png'].filter((f) => fs.existsSync(path.join(dir, f)));
  res.json({ draft: JSON.parse(fs.readFileSync(path.join(dir, 'draft.json'), 'utf8')), images });
});

router.post('/inbox', (req, res) => {
  const { overlay, state, draft, image, image2x } = req.body ?? {};
  if (typeof overlay !== 'string' || typeof state !== 'string' || !isKnownState(overlay, state)) {
    res.status(400).json({ error: `unknown overlay/state: ${String(overlay)} / ${String(state)}` });
    return;
  }
  if (typeof draft !== 'object' || draft === null) { res.status(400).json({ error: 'draft must be an object' }); return; }
  const one = png(image);
  const two = png(image2x);
  if (!one || !two) { res.status(400).json({ error: 'image and image2x must be PNG (base64)' }); return; }

  const dir = path.join(designDir(), 'drafts', overlay, state);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'draft.json'), JSON.stringify(draft, null, 2));
  fs.writeFileSync(path.join(dir, 'image.png'), one);
  fs.writeFileSync(path.join(dir, 'image@2x.png'), two);
  res.status(201).json({ saved: `design/drafts/${overlay}/${state}` });
});

export default router;

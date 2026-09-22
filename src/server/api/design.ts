import express, { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { designDir, isKnownState, readStates, stateNames } from '../showcase';
import { appliedChanges, applyDraft, draftStatuses, keepApplied, markDone, publicOverlayConfig, uncomparedDraft, undoApplied, writeStatus } from '../design-apply';
import { broadcast } from '../websocket/index';
import { getOverlayConfig } from './overlay-config';

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

/** The live palette — what the plugin sets its NST variables to on import, not a capture's older copy. */
router.get('/palette', (_req, res) => {
  res.json(getOverlayConfig().global);
});

router.get('/captures', (_req, res) => {
  res.json(stateNames().filter(({ overlay, state }) => fs.existsSync(path.join(designDir(), 'captured', overlay, `${state}.json`))));
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

// Drafts carry two PNGs of a whole overlay; the global body limit is for everything else.
router.post('/inbox', express.json({ limit: '30mb' }), (req, res) => {
  const { overlay, state, draft, image, image2x } = req.body ?? {};
  if (typeof overlay !== 'string' || typeof state !== 'string' || !isKnownState(overlay, state)) {
    res.status(400).json({ error: `unknown overlay/state: ${String(overlay)} / ${String(state)}` });
    return;
  }
  if (typeof draft !== 'object' || draft === null) { res.status(400).json({ error: 'draft must be an object' }); return; }
  const one = png(image);
  const two = png(image2x);
  if (!one || !two) { res.status(400).json({ error: 'image and image2x must be PNG (base64)' }); return; }

  // What has a CSS equivalent goes live now; the rest waits in status.json.
  // A draft without `changes` could not be compared (older import, copied
  // frame) — it applies nothing and takes nothing back.
  const result = 'changes' in draft ? applyDraft(overlay, state, draft) : uncomparedDraft(overlay, state, draft);

  const dir = path.join(designDir(), 'drafts', overlay, state);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'draft.json'), JSON.stringify(draft, null, 2));
  fs.writeFileSync(path.join(dir, 'image.png'), one);
  fs.writeFileSync(path.join(dir, 'image@2x.png'), two);
  const status = writeStatus(overlay, state, result);

  broadcast('overlay-config', publicOverlayConfig());
  res.status(201).json({
    saved: `design/drafts/${overlay}/${state}`,
    applied: result.applied,
    pending: status.pending.map((p) => p.label),
    wishes: status.wishes,
  });
});

/** For the app: what was applied from Figma, and which drafts still wait. */
router.get('/status', (_req, res) => {
  res.json({ applied: appliedChanges(), drafts: draftStatuses() });
});

router.post('/applied/:id/undo', (req, res) => {
  if (!undoApplied(req.params.id)) { res.status(404).json({ error: 'not applied' }); return; }
  broadcast('overlay-config', publicOverlayConfig());
  res.json({ success: true });
});

/** A palette change that stays: off the list, value untouched. */
router.post('/applied/:id/keep', (req, res) => {
  const result = keepApplied(req.params.id);
  if (result === 'not-found') { res.status(404).json({ error: 'not applied' }); return; }
  if (result === 'not-palette') { res.status(400).json({ error: 'only palette changes can be kept — style overrides move into the overlay CSS' }); return; }
  broadcast('overlay-config', publicOverlayConfig());
  res.json({ success: true });
});

/** A draft whose pending part has been implemented (or dismissed). */
router.post('/drafts/:overlay/:state/done', (req, res) => {
  const { overlay, state } = req.params;
  if (!isKnownState(overlay, state) || !markDone(overlay, state)) { res.status(404).json({ error: 'no draft' }); return; }
  res.json({ success: true });
});

export default router;

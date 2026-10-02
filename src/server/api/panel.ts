import { Router } from 'express';
import { getDb } from '../db/index';
import { broadcast } from '../websocket/index';

/**
 * What the panel overlay (/overlay/panel/) shows. The streamer picks it by
 * hand — a button, a hotkey — and it stays until picked again; nothing turns
 * on its own.
 */
export const PANEL_VIEWS = ['progress', 'todos', 'off'] as const;
export type PanelView = (typeof PANEL_VIEWS)[number];

const KEY = 'panel_view';

export function getPanelView(): PanelView {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(KEY) as { value: string } | undefined;
  return (PANEL_VIEWS as readonly string[]).includes(row?.value ?? '') ? (row!.value as PanelView) : 'progress';
}

function setPanelView(view: PanelView): PanelView {
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(KEY, view);
  broadcast('panel-view', { view });
  return view;
}

const router = Router();

router.get('/', (_req, res) => {
  res.json({ view: getPanelView(), views: PANEL_VIEWS });
});

router.post('/', (req, res) => {
  const view = (req.body as { view?: string })?.view;
  if (!(PANEL_VIEWS as readonly string[]).includes(view ?? '')) {
    res.status(400).json({ error: `Invalid view. Must be one of: ${PANEL_VIEWS.join(', ')}` });
    return;
  }
  res.json({ view: setPanelView(view as PanelView), views: PANEL_VIEWS });
});

// The next one in order, round and round — what a single key can do.
router.post('/next', (_req, res) => {
  const next = PANEL_VIEWS[(PANEL_VIEWS.indexOf(getPanelView()) + 1) % PANEL_VIEWS.length];
  res.json({ view: setPanelView(next), views: PANEL_VIEWS });
});

export default router;

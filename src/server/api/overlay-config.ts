import { Router } from 'express';
import { getDb } from '../db/index';
import { broadcast } from '../websocket/index';

const router = Router();

const VALID_KEYS = new Set([
  '--color-primary', '--color-secondary', '--color-accent',
  '--color-text', '--color-bg', '--color-bg-opacity', '--color-bg-secondary',
  '--font-display', '--font-body', '--font-size-base',
]);

export function getOverlayConfig(): { global: Record<string, string>; overrides: Record<string, Record<string, string>> } {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get('overlay_config') as { value: string } | undefined;
  if (!row) return { global: {}, overrides: {} };
  try {
    return JSON.parse(row.value);
  } catch {
    return { global: {}, overrides: {} };
  }
}

export function isOverlayVar(key: string): boolean {
  return VALID_KEYS.has(key);
}

/** Stores the config as is. Broadcasting is the caller's job. */
export function saveOverlayConfig(config: { global: Record<string, string>; overrides: Record<string, Record<string, string>> }): void {
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('overlay_config', JSON.stringify(config));
}

// Plain values only — colours, numbers, px, font lists. Nothing with brackets,
// so no url() reaches an overlay running in OBS (review 09.10.).
const PLAIN_VALUE = /^[#A-Za-z0-9 .,'_-]{1,120}$/;

function validateVars(vars: Record<string, string>): Record<string, string> {
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(vars)) {
    if (VALID_KEYS.has(k) && typeof v === 'string' && PLAIN_VALUE.test(v)) {
      clean[k] = v;
    }
  }
  return clean;
}

router.get('/', (_req, res) => {
  res.json(getOverlayConfig());
});

router.post('/', (req, res) => {
  const { global, overrides } = req.body;
  const config = {
    global: global ? validateVars(global) : {},
    overrides: {} as Record<string, Record<string, string>>,
  };
  if (overrides && typeof overrides === 'object') {
    for (const [name, vars] of Object.entries(overrides)) {
      const cleaned = validateVars(vars as Record<string, string>);
      if (Object.keys(cleaned).length > 0) {
        config.overrides[name] = cleaned;
      }
    }
  }
  saveOverlayConfig(config);
  broadcast('overlay-config', config);
  res.json({ success: true });
});

// PUT /overrides/:name { vars } — one overlay's own look, the rest untouched
// (2026-10-08: "Aussehen" in an overlay's workshop). Empty vars: it follows
// the style for all again.
router.put('/overrides/:name(*)', (req, res) => {
  const name = req.params.name;
  if (!/^[a-z0-9][a-z0-9/_-]{0,80}$/.test(name)) { res.status(400).json({ error: 'invalid overlay name' }); return; }
  const vars = (req.body ?? {}).vars;
  if (!vars || typeof vars !== 'object' || Array.isArray(vars)) { res.status(400).json({ error: 'vars must be an object' }); return; }
  const config = getOverlayConfig();
  const overrides = { ...(config.overrides ?? {}) };
  const cleaned = validateVars(vars as Record<string, string>);
  if (Object.keys(cleaned).length > 0) overrides[name] = cleaned; else delete overrides[name];
  const next = { ...config, global: config.global ?? {}, overrides };
  saveOverlayConfig(next);
  broadcast('overlay-config', next);
  res.json(next);
});

router.delete('/', (_req, res) => {
  getDb().prepare('DELETE FROM settings WHERE key = ?').run('overlay_config');
  broadcast('overlay-config', { global: {}, overrides: {} });
  res.json({ success: true });
});

export default router;

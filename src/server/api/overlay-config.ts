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

function validateVars(vars: Record<string, string>): Record<string, string> {
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(vars)) {
    if (VALID_KEYS.has(k) && typeof v === 'string') {
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
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('overlay_config', JSON.stringify(config));
  broadcast('overlay-config', config);
  res.json({ success: true });
});

router.delete('/', (_req, res) => {
  getDb().prepare('DELETE FROM settings WHERE key = ?').run('overlay_config');
  broadcast('overlay-config', { global: {}, overrides: {} });
  res.json({ success: true });
});

export default router;

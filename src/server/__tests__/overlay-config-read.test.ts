import { describe, it, expect, beforeAll } from 'vitest';
import { getDb, initDatabase } from '../db/index';
import { getOverlayConfig } from '../api/overlay-config';

// Security review 15.10.: the plain-value check ran only in the overlay-config
// routes. Written through /api/settings/set or a backup, a url() reached every
// overlay in OBS. It is now checked when read, too.
describe('the overlay look, as read', () => {
  beforeAll(() => { initDatabase(':memory:'); });

  it('drops values with brackets, unknown keys and odd overlay names', () => {
    getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('overlay_config', JSON.stringify({
      global: { '--color-accent': '#e67e22', '--font-display': 'x; background:url(https://evil.example/t)', '--evil': 'red' },
      overrides: { song: { '--color-text': '#ffffff' }, '../x': { '--color-text': '#000000' }, chat: 'nonsense' },
    }));
    expect(getOverlayConfig()).toEqual({
      global: { '--color-accent': '#e67e22' },
      overrides: { song: { '--color-text': '#ffffff' } },
    });
  });

  it('survives something that is not an object', () => {
    getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('overlay_config', '[1,2]');
    expect(getOverlayConfig()).toEqual({ global: {}, overrides: {} });
  });
});

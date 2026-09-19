import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';

/**
 * The Lexikon palette, as an overlay in OBS gets it.
 *
 * The stored config is applied as an inline style on `:root`, so it beats every
 * stylesheet — the palette has to live in the database, not only in the overlay
 * files, or the redesign stays invisible.
 */
describe('overlay config after the Lexikon migration', () => {
  let app: Express;
  let token: string;

  beforeAll(() => {
    initDatabase(':memory:');
    token = generateApiToken();
    app = createApp();
  });

  it('serves the Lexikon palette to overlays without a token', async () => {
    const res = await request(app).get('/public/overlay-config').expect(200);

    expect(res.body.global['--color-bg']).toBe('#0e0c0a');
    expect(res.body.global['--color-text']).toBe('#e1d6c2');
    expect(res.body.global['--color-accent']).toBe('#c9a45c');
    expect(res.body.global['--font-body']).toBe("'Source Serif 4', Georgia, serif");
  });

  it('keeps per-overlay overrides that were set by hand', async () => {
    await request(app)
      .post('/api/overlay-config')
      .set('Authorization', `Bearer ${token}`)
      .send({ global: { '--color-accent': '#c9a45c' }, overrides: { song: { '--color-accent': '#ff0000' } } })
      .expect(200);

    const res = await request(app).get('/public/overlay-config').expect(200);
    expect(res.body.overrides.song['--color-accent']).toBe('#ff0000');
  });

  it('serves the shared overlay assets without a token', async () => {
    const js = await request(app).get('/overlay/boot.js').expect(200);
    expect(js.text).toContain('__applyOverlayConfig');

    const css = await request(app).get('/overlay/lexikon.css').expect(200);
    expect(css.text).toContain('--lex-rule');
  });

  /**
   * The one that catches a forgotten overlay. Every file has to reach the
   * shared boot script and stylesheet, and none may still carry the copy of
   * the boot block that used to sit in all of them.
   */
  it('has every overlay on the shared boot script and stylesheet', async () => {
    const names = [
      'alerts', 'challenge', 'character', 'milestone', 'poll', 'progress',
      'reward-leaderboard', 'reward-rankchange', 'roulette', 'song',
      'song-queue', 'todos', '_template',
    ];

    for (const name of names) {
      const res = await request(app).get(`/overlay/${name}/index.html`).expect(200);

      expect(res.text, `${name} misses boot.js`).toContain('/overlay/boot.js');
      expect(res.text, `${name} misses lexikon.css`).toContain('/overlay/lexikon.css');
      expect(res.text, `${name} still carries its own boot block`).not.toContain('function hexToRgb');
    }
  });

  /**
   * A browser source in OBS stays open for hours; the server restarts under it.
   * An overlay that does not reconnect goes deaf and stays that way until
   * someone refreshes the source by hand.
   */
  it('has every overlay reconnect after the server restarts', async () => {
    const names = [
      'alerts', 'challenge', 'character', 'milestone', 'poll', 'progress',
      'reward-leaderboard', 'reward-rankchange', 'roulette', 'song',
      'song-queue', 'todos', '_template',
    ];

    for (const name of names) {
      const res = await request(app).get(`/overlay/${name}/index.html`).expect(200);
      expect(res.text, `${name} never reconnects its WebSocket`).toMatch(/\.onclose\s*=/);
    }
  });
});

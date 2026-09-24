import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';

/**
 * The shared overlay look, as an overlay in OBS gets it. The palette itself is
 * the Kompendium now (overlay-kompendium.test.ts); what the Lexikon migration
 * set up around it — size, opacity, overrides, shared assets — still holds.
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

  /**
   * Type that is legible over a video: the stored value has to grow too, not
   * only the fallback in the stylesheet — an inline style on :root beats every
   * sheet, so a stored 15px would keep the overlays small forever.
   */
  it('serves type big enough to read and cards that do not show the video through', async () => {
    const res = await request(app).get('/public/overlay-config').expect(200);

    expect(res.body.global['--font-size-base']).toBe('18px');
    expect(res.body.global['--color-bg-opacity']).toBe('1');
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
      'song-queue', 'todos', 'chat', '_template',
    ];

    for (const name of names) {
      const res = await request(app).get(`/overlay/${name}/index.html`).expect(200);

      expect(res.text, `${name} misses boot.js`).toContain('/overlay/boot.js');
      expect(res.text, `${name} misses lexikon.css`).toContain('/overlay/lexikon.css');
      expect(res.text, `${name} still carries its own boot block`).not.toContain('function hexToRgb');
    }
  });

  /**
   * One setting has to move all of it. Type sized in px ignores
   * --font-size-base, so the slider in the settings panel used to move the
   * body text while every title, kicker and number stayed where it was.
   */
  it('sizes every overlay relative to the one setting, never in px', async () => {
    const names = [
      'alerts', 'challenge', 'character', 'milestone', 'poll', 'progress',
      'reward-leaderboard', 'reward-rankchange', 'roulette', 'song',
      'song-queue', 'todos', 'chat', '_template',
    ];

    for (const name of names) {
      const res = await request(app).get(`/overlay/${name}/index.html`).expect(200);
      const fixed = res.text.match(/font(?:-size)?\s*:[^;{}]*?\d+(?:\.\d+)?px/g) ?? [];

      expect(fixed, `${name} sizes type in px: ${fixed.join(' | ')}`).toEqual([]);
    }
  });

  it('sizes the shared stylesheet relative too, apart from the base itself', async () => {
    const css = (await request(app).get('/overlay/lexikon.css').expect(200)).text;
    const fixed = (css.match(/font(?:-size)?\s*:[^;{}]*?\d+(?:\.\d+)?px/g) ?? []).filter(
      (rule) => !rule.includes('--font-size-base'),
    );

    expect(fixed, `lexikon.css sizes type in px: ${fixed.join(' | ')}`).toEqual([]);
  });

  /**
   * The wheel has to turn over the list the server drew from. It used to build
   * its segments from /public/issues alone and keep only the winner id out of
   * the event — so a preview with no open issues spun an empty wheel, and a
   * stale list could show names the draw never knew about.
   */
  it('lets the wheel turn over the issues that came with the draw', async () => {
    const res = await request(app).get('/overlay/roulette/index.html').expect(200);

    expect(res.text, 'the wheel drops the issues in roulette-spin').toMatch(/data\.issues/);
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
      'song-queue', 'todos', 'chat', '_template',
    ];

    for (const name of names) {
      const res = await request(app).get(`/overlay/${name}/index.html`).expect(200);
      expect(res.text, `${name} never reconnects its WebSocket`).toMatch(/\.onclose\s*=/);
    }
  });
});

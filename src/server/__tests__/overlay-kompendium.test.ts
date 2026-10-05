import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { initDatabase, getDb } from '../db/index';
import { createApp } from '../index';

/**
 * The Kompendium look (the streamer's layout draft of 23.09.): a mono face,
 * cream on near-black, red as the one accent.
 *
 * Like the Lexikon palette before it, it has to reach the stored config — that
 * is applied as an inline style on :root and beats every stylesheet.
 */
const KOMPENDIUM_ACCENT = '#e0201b';
const MONO = "'JetBrains Mono', ui-monospace, monospace";

describe('the Kompendium palette', () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('is what a new install serves', async () => {
    initDatabase(':memory:');
    const res = await request(createApp()).get('/public/overlay-config').expect(200);

    expect(res.body.global['--color-accent']).toBe(KOMPENDIUM_ACCENT);
    expect(res.body.global['--font-display']).toBe(MONO);
    expect(res.body.global['--font-body']).toBe(MONO);
    expect(res.body.global['--color-bg-opacity']).toBe('1');
  });

  it('replaces the stored Lexikon palette but keeps the type size and what was set per overlay', async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nst-kompendium-'));
    const file = path.join(dir, 'stream.db');
    initDatabase(file);
    getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
      'overlay_config',
      JSON.stringify({
        global: { '--color-accent': '#c9a45c', '--font-body': "'Source Serif 4', Georgia, serif", '--font-size-base': '20px' },
        overrides: { song: { '--color-accent': '#ff0000' } },
      }),
    );
    // As if this database had last run before the Kompendium existed.
    getDb().exec('DELETE FROM schema_version');
    getDb().prepare('INSERT INTO schema_version (version) VALUES (?)').run(22);
    getDb().close();

    initDatabase(file);
    const res = await request(createApp()).get('/public/overlay-config').expect(200);

    expect(res.body.global['--color-accent']).toBe(KOMPENDIUM_ACCENT);
    expect(res.body.global['--font-body']).toBe(MONO);
    expect(res.body.global['--font-size-base']).toBe('20px');
    expect(res.body.overrides.song['--color-accent']).toBe('#ff0000');
    getDb().close();
  });

  it('names the Entry Card a page of the Kompendium', async () => {
    initDatabase(':memory:');
    const res = await request(createApp()).get('/overlay/character/index.html').expect(200);

    expect(res.text).toContain("--lex-kicker: 'Kompendium'");
  });

  it('falls back to the Kompendium look before the config arrives', async () => {
    initDatabase(':memory:');
    const css = (await request(createApp()).get('/overlay/lexikon.css').expect(200)).text;

    expect(css).toContain(`--color-accent: ${KOMPENDIUM_ACCENT}`);
    expect(css).toContain("--font-body: 'JetBrains Mono'");
  });
});

describe('the Entry Card initial', () => {
  /**
   * OBS's browser leaves ::first-letter out inside the clamped body — the red
   * initial showed in Chrome and never on stream. It is an element now.
   */
  it('is an element, not a pseudo-element OBS drops', async () => {
    initDatabase(':memory:');
    const res = await request(createApp()).get('/overlay/character/index.html').expect(200);

    expect(res.text).not.toContain('::first-letter');
    expect(res.text).toContain('class="initial"');
  });
});

describe('the Entry Card in a low source', () => {
  /**
   * The strip at the bottom of the draft is 304px high — the full card with its
   * facts is not. In a low source the card drops the facts, like the draft.
   */
  it('gives way to a low browser source instead of being cut off', async () => {
    initDatabase(':memory:');
    const res = await request(createApp()).get('/overlay/character/index.html').expect(200);
    const low = /@media \(max-height: (\d+)px\) \{([\s\S]*?)\n    \}/.exec(res.text);

    expect(low, 'no rule for a low source').not.toBeNull();
    expect(Number(low![1])).toBeGreaterThanOrEqual(304);
    expect(low![2]).toMatch(/dl \{ display: none; \}/);
  });
});

describe('the whole-picture screens', () => {
  /**
   * Start, pause and end are one page three times: what differs is what they
   * say. A screen that brings its own layout drifts off the other two the
   * first time one of them is restyled.
   */
  it('are the same page of the Kompendium, each saying its own thing', async () => {
    initDatabase(':memory:');
    const app = createApp();
    const says = { start: 'geht’s los.', pause: 'Gleich zurück.', end: 'nächsten Mal.' };

    for (const [name, title] of Object.entries(says)) {
      const res = await request(app).get(`/overlay/${name}/index.html`).expect(200);

      expect(res.text, `${name} is not on the shared page`).toContain('class="lex lex-seite"');
      expect(res.text, `${name} carries a layout of its own`).not.toContain('<style>');
      expect(res.text, `${name} lost its title`).toContain(title);
      expect(res.text, `${name} never says which entry was last open`).toContain('/public/entry');
    }
  });

  it('can be looked at in the showcase, with and without an entry', async () => {
    initDatabase(':memory:');
    const { overlays } = (await request(createApp()).get('/overlay/showcase/states.json').expect(200)).body;

    for (const name of ['start', 'pause', 'end']) {
      expect(overlays[name].size, name).toEqual({ width: 1920, height: 1080 });
      expect(Object.keys(overlays[name].states), name).toEqual(['mit-eintrag', 'ohne-eintrag']);
    }
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Express } from 'express';
import { initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';

// Smallest valid PNG (1×1, transparent).
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const PALETTE = {
  '--color-primary': '#f4ead7',
  '--color-accent': '#c9a45c',
  '--font-display': "'Cormorant Garamond', Georgia, serif",
  '--font-body': "'Source Serif 4', Georgia, serif",
  '--font-size-base': '18px',
};

describe('drafts from Figma', () => {
  let app: Express;
  let token: string;
  let dir: string;

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nst-apply-'));
    process.env.NST_DESIGN_DIR = dir;
    initDatabase(':memory:');
    token = generateApiToken();
    app = createApp();
    await request(app).post('/api/overlay-config').set(auth()).send({ global: PALETTE }).expect(200);
  });

  afterEach(() => {
    delete process.env.NST_DESIGN_DIR;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const send = (changes: object, note?: string, state = 'with-portrait') =>
    request(app).post('/api/design/inbox').set(auth())
      .send({ overlay: 'character', state, draft: { changes, note }, image: PNG, image2x: PNG }).expect(201);
  const publicConfig = async () => (await request(app).get('/public/overlay-config').expect(200)).body;
  const status = async () => (await request(app).get('/api/design/status').set(auth()).expect(200)).body;

  const titleSize = { selector: 'div.title.lex-title', name: 'Der Zirkel', type: 'TEXT', property: 'fontSize', before: 72, after: 81 };

  it('applies a changed font size at once, in rem', async () => {
    const res = await send({ nodes: [titleSize] });
    expect(res.body.applied).toHaveLength(1);
    expect(res.body.pending).toEqual([]);
    expect((await publicConfig()).styles.character).toBe('div.title.lex-title { font-size: 4.5rem !important; }');
  });

  it('turns colours bound to NST variables into var(), and keeps their opacity', async () => {
    await send({ nodes: [
      { selector: 'div.kicker', name: 'k', type: 'TEXT', property: 'fill', before: { hex: '#b8a98c', alpha: 1 }, after: { hex: '#c9a45c', alpha: 1, variable: '--color-accent' } },
      { selector: 'dl', name: 'dl', type: 'FRAME', property: 'stroke', before: { hex: '#f4ead7', alpha: 0.15 }, after: { hex: '#f4ead7', alpha: 0.4, variable: '--color-primary' } },
    ] });
    const css = (await publicConfig()).styles.character;
    expect(css).toContain('div.kicker { color: var(--color-accent) !important; }');
    expect(css).toContain('dl { border-color: color-mix(in srgb, var(--color-primary) 40%, transparent) !important; }');
  });

  it('applies a changed palette colour to the palette', async () => {
    const res = await send({ variables: { '--color-accent': { before: '#c9a45c', after: '#8fb07a' } } });
    expect(res.body.applied).toEqual(['Palette --color-accent: „#c9a45c“ → „#8fb07a“']);
    expect((await publicConfig()).global['--color-accent']).toBe('#8fb07a');
  });

  it('keeps layout changes, new layers and wishes for later', async () => {
    const res = await send(
      { nodes: [{ selector: 'div.title.lex-title', name: 't', type: 'TEXT', property: 'y', before: 71, after: 90 }], added: ['Rectangle 3'], removed: ['div.foot'] },
      'So bewegt es sich jetzt:\n• …\n\nWünsche:\nTitel etwas tiefer',
    );
    expect(res.body.applied).toEqual([]);
    expect(res.body.pending).toEqual(['div.title.lex-title: Position y 71 → 90', 'Neu in Figma: Rectangle 3', 'In Figma entfernt: div.foot']);

    const [draft] = (await status()).drafts;
    expect(draft).toMatchObject({ overlay: 'character', state: 'with-portrait', wishes: 'Titel etwas tiefer', done: false });
    expect((await publicConfig()).styles.character).toBeUndefined();
  });

  it('counts a draft with nothing left to do as done', async () => {
    await send({ nodes: [titleSize] }, 'Wünsche:\n');
    expect((await status()).drafts[0].done).toBe(true);
  });

  it('marks a draft done once its pending part is implemented', async () => {
    await send({ added: ['Rectangle 3'] });
    await request(app).post('/api/design/drafts/character/with-portrait/done').set(auth()).expect(200);
    expect((await status()).drafts[0].done).toBe(true);
    await request(app).post('/api/design/drafts/character/long-text/done').set(auth()).expect(404);
  });

  it('takes an applied change back', async () => {
    await send({ nodes: [titleSize], variables: { '--color-accent': { before: '#c9a45c', after: '#8fb07a' } } });
    for (const change of (await status()).applied) {
      await request(app).post(`/api/design/applied/${change.id}/undo`).set(auth()).expect(200);
    }
    const config = await publicConfig();
    expect(config.styles.character).toBeUndefined();
    expect(config.global['--color-accent']).toBe('#c9a45c');
    await request(app).post('/api/design/applied/nope/undo').set(auth()).expect(404);
  });

  it('replaces what the same frame applied before when it is sent again', async () => {
    await send({ nodes: [titleSize], variables: { '--color-accent': { before: '#c9a45c', after: '#8fb07a' } } });
    await send({ nodes: [{ ...titleSize, after: 90 }] });
    const config = await publicConfig();
    expect(config.styles.character).toBe('div.title.lex-title { font-size: 5rem !important; }');
    expect(config.global['--color-accent']).toBe('#c9a45c');
    expect((await status()).applied).toHaveLength(1);
  });

  it('keeps what other frames applied', async () => {
    await send({ nodes: [titleSize] });
    await send({ nodes: [{ ...titleSize, selector: 'p.body', property: 'opacity', before: 1, after: 0.8 }] }, undefined, 'long-text');
    expect((await publicConfig()).styles.character).toBe('div.title.lex-title { font-size: 4.5rem !important; }\np.body { opacity: 0.8 !important; }');
  });

  it('leaves a family the overlays do not load for later', async () => {
    const res = await send({ nodes: [{ ...titleSize, property: 'fontFamily', before: 'Cormorant Garamond', after: 'Comic Sans MS' }] });
    expect(res.body.pending).toHaveLength(1);
  });

  it('keeps the overrides when the palette is saved from the Design panel', async () => {
    await send({ nodes: [titleSize] });
    await request(app).post('/api/overlay-config').set(auth()).send({ global: { ...PALETTE, '--color-accent': '#ffffff' } }).expect(200);
    expect((await publicConfig()).styles.character).toContain('font-size: 4.5rem');
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Express } from 'express';
import { initDatabase } from '../db/index';
import { generateApiToken, getDesignToken } from '../auth-token';
import { createApp } from '../index';

// Smallest valid PNG (1×1, transparent).
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const PALETTE = {
  '--color-primary': '#f4ead7',
  '--color-accent': '#c9a45c',
  '--color-bg-opacity': '1',
  '--font-display': "'Cormorant Garamond', Georgia, serif",
  '--font-body': "'Source Serif 4', Georgia, serif",
  '--font-size-base': '18px',
};

// The selectors a capture of these states produced — the only ones a draft may name.
const CAPTURED = ['div.title.lex-title', 'div.kicker.lex-kicker', 'div.card.lex.lex-voll.has-portrait > dl:not([class])', 'p.body', 'div.card.lex.lex-voll.has-portrait', '#\\31 23'];

describe('drafts from Figma', () => {
  let app: Express;
  let token: string;
  let dir: string;

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nst-apply-'));
    process.env.NST_DESIGN_DIR = dir;
    fs.mkdirSync(path.join(dir, 'captured', 'character'), { recursive: true });
    const nodes = [{ selector: CAPTURED[4], children: [...CAPTURED.slice(0, 4), CAPTURED[5]].map((selector) => ({ selector })) }];
    for (const state of ['with-portrait', 'long-text']) {
      fs.writeFileSync(path.join(dir, 'captured', 'character', `${state}.json`), JSON.stringify({ nodes }));
    }
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
  const send = (draft: object, state = 'with-portrait') =>
    request(app).post('/api/design/inbox').set(auth())
      .send({ overlay: 'character', state, draft, image: PNG, image2x: PNG }).expect(201);
  const sendChanges = (changes: object, state = 'with-portrait', note?: string) => send({ changes, note }, state);
  const publicConfig = async () => (await request(app).get('/public/overlay-config').expect(200)).body;
  const status = async () => (await request(app).get('/api/design/status').set(auth()).expect(200)).body;
  const css = async () => (await publicConfig()).styles.character as string | undefined;

  const change = (property: string, before: unknown, after: unknown, extra: object = {}) =>
    ({ selector: 'div.title.lex-title', name: 'Der Zirkel', type: 'TEXT', property, before, after, ...extra });
  const titleSize = change('fontSize', 72, 81);

  describe('applying', () => {
    it('applies a changed font size at once, in rem and without !important', async () => {
      const res = await sendChanges({ nodes: [titleSize] });
      expect(res.body.applied).toHaveLength(1);
      expect(res.body.pending).toEqual([]);
      expect(await css()).toBe('div.title.lex-title { font-size: 4.5rem; }');
    });

    it('turns colours bound to palette variables into var(), and keeps their opacity', async () => {
      await sendChanges({ nodes: [
        change('fill', { hex: '#b8a98c', alpha: 1 }, { hex: '#c9a45c', alpha: 1, variable: '--color-accent' }, { selector: 'div.kicker.lex-kicker' }),
        { selector: CAPTURED[2], name: 'dl', type: 'FRAME', property: 'stroke', before: { hex: '#f4ead7', alpha: 0.15 }, after: { hex: '#f4ead7', alpha: 0.4, variable: '--color-primary' } },
      ] });
      const styles = await css();
      expect(styles).toContain('div.kicker.lex-kicker { color: var(--color-accent); }');
      expect(styles).toContain(`${CAPTURED[2]} { border-color: color-mix(in srgb, var(--color-primary) 40%, transparent); }`);
    });

    it('writes a colour bound to any other variable as its colour', async () => {
      await sendChanges({ nodes: [change('fill', { hex: '#ffffff', alpha: 1 }, { hex: '#336699', alpha: 1, variable: 'Colors/Primary/500' })] });
      expect(await css()).toBe('div.title.lex-title { color: #336699; }');
    });

    it('gives a newly drawn border a style and a width', async () => {
      const box = { selector: 'p.body', name: 'p.body', type: 'FRAME' };
      await sendChanges({ nodes: [
        { ...box, property: 'stroke', before: null, after: { hex: '#c9a45c', alpha: 1 } },
        { ...box, property: 'strokeWeights', before: [1, 1, 1, 1], after: [1, 1, 1, 1] },
      ] });
      expect(await css()).toBe('p.body { border-style: solid; border-color: #c9a45c; border-width: 1px 1px 1px 1px; }');
    });

    it('applies a changed palette colour to the palette', async () => {
      const res = await sendChanges({ variables: { '--color-accent': { before: '#c9a45c', after: '#8fb07a' } } });
      expect(res.body.applied).toEqual(['Palette --color-accent: „#c9a45c“ → „#8fb07a“']);
      expect((await publicConfig()).global['--color-accent']).toBe('#8fb07a');
    });

    it('keeps what other frames applied', async () => {
      await sendChanges({ nodes: [titleSize] });
      await sendChanges({ nodes: [{ ...titleSize, selector: 'p.body', type: 'FRAME', property: 'opacity', before: 1, after: 0.8 }] }, 'long-text');
      expect(await css()).toBe('div.title.lex-title { font-size: 4.5rem; }\np.body { opacity: 0.8; }');
    });

    it('keeps the overrides when the palette is saved from the Design panel', async () => {
      await sendChanges({ nodes: [titleSize] });
      await request(app).post('/api/overlay-config').set(auth()).send({ global: { ...PALETTE, '--color-accent': '#ffffff' } }).expect(200);
      expect(await css()).toContain('font-size: 4.5rem');
    });
  });

  describe('sending again', () => {
    it('replaces the same property, and takes nothing else back', async () => {
      await sendChanges({ nodes: [titleSize, { ...titleSize, property: 'textAlign', before: 'LEFT', after: 'CENTER' }] });
      await sendChanges({ nodes: [{ ...titleSize, after: 90 }] });
      expect(await css()).toBe('div.title.lex-title { text-align: center; font-size: 5rem; }');
    });

    it('books a palette change sent with several frames once, undone to where it started', async () => {
      const accent = { variables: { '--color-accent': { before: '#c9a45c', after: '#8fb07a' } } };
      await sendChanges(accent);
      await sendChanges(accent, 'long-text');
      const { applied } = await status();
      expect(applied).toHaveLength(1);
      await request(app).post(`/api/design/applied/${applied[0].id}/undo`).set(auth()).expect(200);
      expect((await publicConfig()).global['--color-accent']).toBe('#c9a45c');
    });

    it('applies nothing and takes nothing back for a frame it could not compare', async () => {
      await sendChanges({ nodes: [titleSize] });
      const res = await send({ note: 'Wünsche:\n' });
      expect(res.body.applied).toEqual([]);
      expect(res.body.pending[0]).toMatch(/Ohne Vergleichsstand/);
      expect(await css()).toBe('div.title.lex-title { font-size: 4.5rem; }');
    });

    it('clears what an earlier send left waiting once a later send settles it', async () => {
      const family = change('fontFamily', 'Cormorant Garamond', 'Inter');
      await sendChanges({ nodes: [family] });
      await send({ note: 'Wünsche:\n' });
      expect((await status()).drafts[0].pending).toHaveLength(2);
      await request(app).post('/api/overlay-config').set(auth()).send({ global: { ...PALETTE, '--font-display': "'Inter', sans-serif" } }).expect(200);
      const res = await sendChanges({ nodes: [family] });
      expect(res.body.applied).toHaveLength(1);
      expect(res.body.pending).toEqual([]);
      expect((await status()).drafts[0].done).toBe(true);
    });

    it('books nothing for a palette value that is already the palette after it was kept', async () => {
      const accent = { variables: { '--color-accent': { before: '#c9a45c', after: '#8fb07a' } } };
      await sendChanges(accent);
      await request(app).post(`/api/design/applied/${(await status()).applied[0].id}/keep`).set(auth()).expect(200);
      const res = await sendChanges(accent);
      expect(res.body.applied).toEqual([]);
      expect((await status()).applied).toEqual([]);
    });

    it('keeps what still waits when a later send of the frame no longer mentions it', async () => {
      await sendChanges({ added: ['Rectangle 3'] });
      await sendChanges({ nodes: [titleSize] });
      expect((await status()).drafts[0].pending.map((p: { label: string }) => p.label)).toEqual(['Neu in Figma: Rectangle 3']);
    });
  });

  describe('waiting', () => {
    it('keeps layout changes, new layers and wishes for later', async () => {
      const res = await sendChanges(
        { nodes: [change('y', 71, 90)], added: ['Rectangle 3'], removed: ['div.foot'] },
        'with-portrait', 'So bewegt es sich jetzt:\n• …\n\nWünsche:\nTitel etwas tiefer',
      );
      expect(res.body.applied).toEqual([]);
      expect(res.body.pending).toEqual(['div.title.lex-title: Position y 71 → 90', 'Neu in Figma: Rectangle 3', 'In Figma entfernt: div.foot']);
      expect((await status()).drafts[0]).toMatchObject({ overlay: 'character', state: 'with-portrait', wishes: 'Titel etwas tiefer', done: false });
      expect(await css()).toBeUndefined();
    });

    it('does not guess at text coloured in parts, gradients, mixed or unknown type styles', async () => {
      // Each on a layer of its own: one layer has one value per property.
      const res = await sendChanges({ nodes: [
        change('fill', { hex: '#ffffff', alpha: 1 }, { kind: 'mixed' }, { name: 'a' }),
        change('fill', { hex: '#ffffff', alpha: 1 }, null, { name: 'b' }),
        { selector: 'p.body', name: 'p', type: 'FRAME', property: 'fill', before: { hex: '#000000', alpha: 1 }, after: { kind: 'GRADIENT_LINEAR' } },
        change('fontStyle', 'Regular', 'mixed', { name: 'c' }),
        change('fontStyle', 'Regular', 'Display Bold', { name: 'd' }),
        change('fontStyle', 'Regular', 'constructor', { name: 'e' }),
        change('fontFamily', 'Cormorant Garamond', 'Comic Sans MS'),
      ] });
      expect(res.body.applied).toEqual([]);
      expect(res.body.pending).toHaveLength(7);
    });

    it('leaves what a text layer cannot say about its box for later', async () => {
      const res = await sendChanges({ nodes: [
        change('opacity', 1, 0.5),
        change('stroke', null, { hex: '#000000', alpha: 1 }),
        { selector: 'div.card.lex.lex-voll.has-portrait', role: 'outline', name: '::outline', type: 'FRAME', property: 'radii', before: [0, 0, 0, 0], after: [4, 4, 4, 4] },
      ] });
      expect(res.body.applied).toEqual([]);
    });

    it('counts a draft with nothing left to do as done', async () => {
      await sendChanges({ nodes: [titleSize] }, 'with-portrait', 'Wünsche:\n');
      expect((await status()).drafts[0].done).toBe(true);
    });

    it('treats an edited motion note as a wish', async () => {
      const res = await send({ changes: {}, note: 'So bewegt es sich jetzt:\n• langsamer!\n\nWünsche:\n', noteChanged: true });
      expect(res.body.wishes).toContain('langsamer!');
    });

    it('marks a draft done once its pending part is implemented', async () => {
      await sendChanges({ added: ['Rectangle 3'] });
      await request(app).post('/api/design/drafts/character/with-portrait/done').set(auth()).expect(200);
      expect((await status()).drafts[0].done).toBe(true);
      await request(app).post('/api/design/drafts/character/long-text/done').set(auth()).expect(404);
    });
  });

  describe('taking back', () => {
    it('takes an applied change back', async () => {
      await sendChanges({ nodes: [titleSize], variables: { '--color-accent': { before: '#c9a45c', after: '#8fb07a' } } });
      for (const applied of (await status()).applied) {
        await request(app).post(`/api/design/applied/${applied.id}/undo`).set(auth()).expect(200);
      }
      const config = await publicConfig();
      expect(config.styles.character).toBeUndefined();
      expect(config.global['--color-accent']).toBe('#c9a45c');
      await request(app).post('/api/design/applied/nope/undo').set(auth()).expect(404);
    });

    it('keeps a palette change and takes it off the list — but not a style override', async () => {
      await sendChanges({ nodes: [titleSize], variables: { '--color-accent': { before: '#c9a45c', after: '#8fb07a' } } });
      const { applied } = await status();
      const palette = applied.find((c: { kind: string }) => c.kind === 'variable');
      const style = applied.find((c: { kind: string }) => c.kind === 'style');
      await request(app).post(`/api/design/applied/${palette.id}/keep`).set(auth()).expect(200);
      await request(app).post(`/api/design/applied/${style.id}/keep`).set(auth()).expect(400);
      expect((await status()).applied).toHaveLength(1);
      expect((await publicConfig()).global['--color-accent']).toBe('#8fb07a');
    });
  });

  describe('untrusted drafts', () => {
    const injection = 'html::after{content:"";position:fixed;inset:0;background:url(data:image/png;base64,AAAA)}x';

    it('applies nothing to a selector the capture did not produce', async () => {
      const res = await sendChanges({ nodes: [
        { ...titleSize, selector: 'div.not-captured' },
        { ...titleSize, selector: injection, type: 'FRAME', property: 'opacity', before: 1, after: 0.9 },
      ] });
      expect(res.body.applied).toEqual([]);
      expect(await css()).toBeUndefined();
    });

    it('reports a captured selector it would not serve as waiting, not as applied', async () => {
      const res = await sendChanges({ nodes: [{ ...titleSize, selector: CAPTURED[5], type: 'FRAME', property: 'opacity', before: 1, after: 0.5 }] });
      expect(res.body.applied).toEqual([]);
      expect(res.body.pending).toHaveLength(1);
    });

    it('applies no colour that is not a plain hex, and no variable name as CSS', async () => {
      const res = await sendChanges({ nodes: [
        change('fill', null, { hex: 'red} html::after{content:"x"} x{color:red', alpha: 1 }, { name: 'a' }),
        change('fill', null, { hex: '#ff0000', alpha: '1' }, { name: 'b' }),
        change('fill', null, { hex: '#ff0000', alpha: 1, variable: '--color-accent);background-image:url(data:x' }, { name: 'c' }),
      ] });
      expect(res.body.pending).toHaveLength(2);
      expect(await css()).toBe('div.title.lex-title { color: #ff0000; }');
    });

    it('takes palette values only in their own notation', async () => {
      const res = await sendChanges({ variables: {
        '--color-accent': { before: '#c9a45c', after: 'red;}body{display:none' },
        '--font-size-base': { before: '18px', after: 'calc(18px)' },
        '--font-body': { before: 'x', after: "a'; } body { display: none" },
        __proto__: { before: 'x', after: '#000000' },
      } });
      expect(res.body.applied).toEqual([]);
      expect((await publicConfig()).global['--color-accent']).toBe('#c9a45c');
    });

    it('survives malformed changes', async () => {
      await sendChanges({ nodes: 'x', added: null, variables: [] });
      await sendChanges({ nodes: [null, 1, { property: 'fill' }, { ...titleSize, after: 'big' }], removed: [{}] });
      await sendChanges({ nodes: [{ ...titleSize, property: 'lineHeight', after: { unit: 'PIXELS', value: 'x' } }] });
      expect(await css()).toBeUndefined();
    });

    it('serves no rule from a stored log that a backup smuggled in', async () => {
      const smuggled = [
        { id: '1', overlay: 'character', state: 'x', at: '', label: '', kind: 'style', target: 'div } body { display: none', property: 'color', value: 'red' },
        { id: '2', overlay: 'character', state: 'x', at: '', label: '', kind: 'style', target: 'p.body', property: 'color', value: 'red; } body { display: none' },
        { id: '3', overlay: 'character', state: 'x', at: '', label: '', kind: 'style', target: 'p.body', property: 'behavior', value: 'url(x)' },
        { id: '4', overlay: 'character', state: 'x', at: '', label: '', kind: 'style', target: 'p.body', property: 'color', value: '#123456' },
      ];
      await request(app).post('/api/backup/import').set(auth())
        .send({ settings: [{ key: 'design_applied', value: JSON.stringify(smuggled) }, { key: 'overlay_config', value: JSON.stringify({ global: PALETTE, overrides: {} }) }] })
        .expect(200);
      expect(await css()).toBe('p.body { color: #123456; }');
    });
  });

  describe('the Figma token', () => {
    it('opens the Figma routes and nothing else', async () => {
      const figma = { Authorization: `Bearer ${getDesignToken()}` };
      await request(app).get('/api/design/states').set(figma).expect(200);
      await request(app).get('/api/design/palette').set(figma).expect(200);
      await request(app).get('/api/health').set(figma).expect(401);
      await request(app).get('/api/backup/export').set(figma).expect(401);
      await request(app).get('/api/token').set(figma).expect(401);
    });
  });
});

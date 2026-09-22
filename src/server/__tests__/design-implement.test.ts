import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Express } from 'express';
import { initDatabase } from '../db/index';
import { generateApiToken, getDesignToken, getFixedToken } from '../auth-token';
import { createApp } from '../index';
import { permissionPath } from '../design-implement';

// Smallest valid PNG (1×1, transparent).
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const TITLE = 'body > div.slot.in > div.card.lex.lex-voll.has-portrait > div.title.lex-title';

/**
 * Stands in for the Claude CLI: reads the prompt from stdin, moves every
 * override into lexikon.css of its working copy and claims all drafts done.
 * FAKE_MODE `silent` answers without a result line, `idle` changes no file.
 * FAKE_APPEND / FAKE_NEW write FAKE_TEXT to a file of the copy.
 */
const FAKE = `
const fs = require('fs');
let prompt = '';
process.stdin.on('data', (c) => { prompt += c; });
process.stdin.on('end', () => {
  const data = JSON.parse(prompt.split('DRAFT DATA (JSON):\\n')[1].split('\\n\\nFinish with')[0]);
  setTimeout(() => {
    if (process.env.FAKE_MODE !== 'idle') {
      fs.appendFileSync('lexikon.css', data.overridesToBake.map((o) => '\\n.moved { font-size: ' + o.value + '; }').join('') || '\\n.x { color: red; }');
    }
    if (process.env.FAKE_APPEND) fs.appendFileSync(process.env.FAKE_APPEND, process.env.FAKE_TEXT);
    if (process.env.FAKE_NEW) fs.writeFileSync(process.env.FAKE_NEW, process.env.FAKE_TEXT);
    if (process.env.FAKE_MODE === 'silent') { process.stdout.write(JSON.stringify({ result: 'nothing' })); return; }
    const result = { done: data.drafts.map((d) => ({ overlay: d.overlay, state: d.state })), baked: data.overridesToBake.map((o) => o.id), notes: 'Erledigt.' };
    process.stdout.write(JSON.stringify({ result: 'Did it.\\nNST-RESULT: ' + JSON.stringify(result) }));
  }, Number(process.env.FAKE_DELAY || 30));
});
`;

describe('the Umsetzen button', () => {
  let app: Express;
  let token: string;
  let dir: string;
  let overlays: string;

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nst-implement-test-'));
    process.env.NST_DESIGN_DIR = path.join(dir, 'design');
    // A copy of the real overlays — the tests never write into the repo.
    overlays = path.join(dir, 'overlays');
    fs.cpSync(path.join(process.cwd(), 'src', 'overlays'), overlays, { recursive: true });
    process.env.NST_OVERLAYS_DIR = overlays;
    fs.mkdirSync(path.join(dir, 'design', 'captured', 'character'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'design', 'captured', 'character', 'with-portrait.json'), JSON.stringify({ nodes: [{ selector: TITLE }] }));
    const fake = path.join(dir, 'fake-claude.cjs');
    fs.writeFileSync(fake, FAKE);
    process.env.NST_CLAUDE_BIN = fake;
    process.env.NST_DEV = '1';
    for (const key of ['FAKE_MODE', 'FAKE_DELAY', 'FAKE_APPEND', 'FAKE_NEW', 'FAKE_TEXT']) delete process.env[key];
    initDatabase(':memory:');
    token = generateApiToken();
    app = createApp();
  });

  afterEach(() => {
    for (const key of ['NST_DESIGN_DIR', 'NST_OVERLAYS_DIR', 'NST_CLAUDE_BIN', 'NST_DEV']) delete process.env[key];
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const status = async () => (await request(app).get('/api/dev/implement').set(auth()).expect(200)).body;
  const settled = async () => {
    for (let i = 0; i < 200; i++) {
      const s = await status();
      if (s.state !== 'running') return s;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error('run did not end');
  };
  const design = async () => (await request(app).get('/api/design/status').set(auth()).expect(200)).body;
  const sendDraft = (note?: string) => request(app).post('/api/design/inbox').set(auth()).send({
    overlay: 'character', state: 'with-portrait', image: PNG, image2x: PNG,
    draft: { note, changes: { nodes: [
      { selector: TITLE, name: 't', type: 'TEXT', property: 'fontSize', before: 72, after: 90 },
      { selector: TITLE, name: 't', type: 'TEXT', property: 'y', before: 70, after: 80 },
    ] } },
  }).expect(201);
  const start = () => request(app).post('/api/dev/implement').set(auth()).expect(202);
  const lexikon = () => fs.readFileSync(path.join(overlays, 'lexikon.css'), 'utf8');

  it('exists only in development', async () => {
    delete process.env.NST_DEV;
    expect((await status()).available).toBe(false);
    await request(app).post('/api/dev/implement').set(auth()).expect(404);
  });

  it('is out of reach of the Figma token', async () => {
    await request(app).post('/api/dev/implement').set({ Authorization: `Bearer ${getDesignToken()}` }).expect(401);
  });

  it('has nothing to do while nothing waits', async () => {
    await request(app).post('/api/dev/implement').set(auth()).expect(400);
  });

  it('takes the work over, marks what Claude finished done and takes the overrides it moved out', async () => {
    await sendDraft();
    await start();
    const run = await settled();
    expect(run).toMatchObject({ state: 'done', done: ['character / with-portrait'], baked: 1, reverted: [], notes: 'Erledigt.' });
    expect(lexikon()).toContain('.moved { font-size: 5rem; }');
    const now = await design();
    expect(now.drafts[0].done).toBe(true);
    expect(now.applied).toEqual([]);
  });

  it('changes nothing live while Claude works', async () => {
    process.env.FAKE_DELAY = '400';
    const before = lexikon();
    await sendDraft();
    await start();
    expect(lexikon()).toBe(before);
    await settled();
  });

  it('runs one at a time', async () => {
    process.env.FAKE_DELAY = '400';
    await sendDraft();
    await start();
    await request(app).post('/api/dev/implement').set(auth()).expect(409);
    await settled();
  });

  it('hands over a prompt longer than any command line', async () => {
    await sendDraft('Wunsch '.repeat(6000));
    await start();
    expect((await settled()).state).toBe('done');
  });

  it('books nothing when Claude reports no result', async () => {
    process.env.FAKE_MODE = 'silent';
    const before = lexikon();
    await sendDraft();
    await start();
    expect((await settled()).state).toBe('failed');
    expect(lexikon()).toBe(before);
    const now = await design();
    expect(now.drafts[0].done).toBe(false);
    expect(now.applied).toHaveLength(1);
  });

  it('books nothing Claude claims without changing a file', async () => {
    process.env.FAKE_MODE = 'idle';
    await sendDraft();
    await start();
    expect(await settled()).toMatchObject({ state: 'done', done: [], baked: 0 });
    const now = await design();
    expect(now.drafts[0].done).toBe(false);
    expect(now.applied).toHaveLength(1);
  });

  it('leaves a draft open that was sent again during the run', async () => {
    process.env.FAKE_DELAY = '400';
    await sendDraft();
    await start();
    await new Promise((r) => setTimeout(r, 20));
    await sendDraft('Noch etwas');
    expect((await settled()).done).toEqual([]);
    expect((await design()).drafts[0].done).toBe(false);
  });

  it('takes nothing over if a file was changed by hand during the run', async () => {
    process.env.FAKE_DELAY = '400';
    await sendDraft();
    await start();
    fs.appendFileSync(path.join(overlays, 'lexikon.css'), '\n/* by hand */\n');
    const run = await settled();
    expect(run).toMatchObject({ state: 'failed', reverted: ['lexikon.css: während des Laufs von Hand geändert'] });
    expect(lexikon()).not.toContain('.moved');
    expect(lexikon()).toContain('/* by hand */');
    fs.rmSync(run.kept, { recursive: true, force: true });
  });

  describe('when the run wants what it must not', () => {
    const refused = async () => {
      const before = lexikon();
      await sendDraft();
      await start();
      const run = await settled();
      expect(run.state).toBe('failed');
      expect(lexikon()).toBe(before);
      const now = await design();
      expect(now.drafts[0].done).toBe(false);
      expect(now.applied).toHaveLength(1);
      fs.rmSync(run.kept, { recursive: true, force: true });
      return run;
    };

    it('takes nothing of it over and books nothing', async () => {
      process.env.FAKE_APPEND = 'lexikon.css';
      process.env.FAKE_TEXT = '@import url(https://example.com/x.css);\n';
      expect((await refused()).reverted[0]).toMatch(/^lexikon\.css: @import/);
    });

    it('refuses a token written into a file', async () => {
      process.env.FAKE_APPEND = 'lexikon.css';
      process.env.FAKE_TEXT = `/* ${getFixedToken()} */\n`;
      expect((await refused()).reverted).toContain('lexikon.css: Token');
    });

    it('refuses a changed script', async () => {
      process.env.FAKE_APPEND = 'boot.js';
      process.env.FAKE_TEXT = '\nfetch("/x");\n';
      expect((await refused()).reverted).toEqual(['boot.js: Datei dieser Art darf sich nicht ändern']);
    });

    it('refuses a new file that is not a stylesheet or image', async () => {
      process.env.FAKE_NEW = 'character/extra.html';
      process.env.FAKE_TEXT = '<p>hi</p>';
      expect((await refused()).reverted).toEqual(['character/extra.html: neue Datei dieser Art']);
      expect(fs.existsSync(path.join(overlays, 'character', 'extra.html'))).toBe(false);
    });
  });

  it('says so when Claude cannot be started', async () => {
    process.env.NST_CLAUDE_BIN = path.join(dir, 'no-such-claude');
    await sendDraft();
    await start();
    expect((await settled()).error).toMatch(/nicht starten/);
  });

  it('writes permission paths the way Claude Code reads them', () => {
    expect(permissionPath('D:\\dev\\x\\overlays')).toBe('//d/dev/x/overlays');
    expect(permissionPath('/tmp/x/overlays')).toBe('//tmp/x/overlays');
  });
});

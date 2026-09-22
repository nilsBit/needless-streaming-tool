import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Express } from 'express';
import { initDatabase } from '../db/index';
import { generateApiToken, getDesignToken, getFixedToken } from '../auth-token';
import { createApp } from '../index';

// Smallest valid PNG (1×1, transparent).
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const TITLE = 'body > div.slot.in > div.card.lex.lex-voll.has-portrait > div.title.lex-title';

/**
 * Stands in for the Claude CLI: reads the drafts from the prompt, claims all
 * of them done and every override moved, and touches no file. FAKE_MODE
 * `silent` answers without a result line.
 */
const FAKE = `#!/usr/bin/env node
const require = (await import('module')).createRequire(import.meta.url);
const prompt = process.argv[process.argv.indexOf('-p') + 1];
const data = JSON.parse(prompt.split('DRAFT DATA (JSON):\\n')[1].split('\\n\\nFinish with')[0]);
const fs = require('fs');
setTimeout(() => {
  if (process.env.FAKE_APPEND) fs.appendFileSync(process.env.FAKE_APPEND, process.env.FAKE_TEXT);
  if (process.env.FAKE_NEW) fs.writeFileSync(process.env.FAKE_NEW, process.env.FAKE_TEXT);
  if (process.env.FAKE_MODE === 'silent') { process.stdout.write(JSON.stringify({ result: 'nothing' })); return; }
  const result = { done: data.drafts.map((d) => ({ overlay: d.overlay, state: d.state })), baked: data.overridesToBake.map((o) => o.id), notes: 'Erledigt.' };
  process.stdout.write(JSON.stringify({ result: 'Did it.\\nNST-RESULT: ' + JSON.stringify(result) }));
}, Number(process.env.FAKE_DELAY || 30));
`;

describe('the Umsetzen button', () => {
  let app: Express;
  let token: string;
  let dir: string;

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nst-implement-'));
    process.env.NST_DESIGN_DIR = dir;
    fs.mkdirSync(path.join(dir, 'captured', 'character'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'captured', 'character', 'with-portrait.json'), JSON.stringify({ nodes: [{ selector: TITLE }] }));
    const fake = path.join(dir, 'fake-claude.mjs');
    fs.writeFileSync(fake, FAKE, { mode: 0o755 });
    process.env.NST_CLAUDE_BIN = fake;
    process.env.NST_DEV = '1';
    for (const key of ['FAKE_MODE', 'FAKE_DELAY', 'FAKE_APPEND', 'FAKE_NEW', 'FAKE_TEXT']) delete process.env[key];
    initDatabase(':memory:');
    token = generateApiToken();
    app = createApp();
  });

  afterEach(() => {
    delete process.env.NST_DESIGN_DIR;
    delete process.env.NST_CLAUDE_BIN;
    delete process.env.NST_DEV;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const status = async () => (await request(app).get('/api/dev/implement').set(auth()).expect(200)).body;
  const settled = async () => {
    for (let i = 0; i < 100; i++) {
      const s = await status();
      if (s.state !== 'running') return s;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error('run did not end');
  };
  const sendDraft = () => request(app).post('/api/design/inbox').set(auth()).send({
    overlay: 'character', state: 'with-portrait', image: PNG, image2x: PNG,
    draft: { changes: { nodes: [
      { selector: TITLE, name: 't', type: 'TEXT', property: 'fontSize', before: 72, after: 90 },
      { selector: TITLE, name: 't', type: 'TEXT', property: 'y', before: 70, after: 80 },
    ] } },
  }).expect(201);

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

  it('marks what Claude finished done and takes the overrides it moved into CSS out', async () => {
    await sendDraft();
    await request(app).post('/api/dev/implement').set(auth()).expect(202);
    const run = await settled();
    expect(run).toMatchObject({ state: 'done', done: ['character / with-portrait'], baked: 1, reverted: [], notes: 'Erledigt.' });
    const design = (await request(app).get('/api/design/status').set(auth()).expect(200)).body;
    expect(design.drafts[0].done).toBe(true);
    expect(design.applied).toEqual([]);
  });

  it('runs one at a time', async () => {
    process.env.FAKE_DELAY = '400';
    await sendDraft();
    await request(app).post('/api/dev/implement').set(auth()).expect(202);
    await request(app).post('/api/dev/implement').set(auth()).expect(409);
    await settled();
  });

  it('books nothing when Claude reports no result', async () => {
    process.env.FAKE_MODE = 'silent';
    await sendDraft();
    await request(app).post('/api/dev/implement').set(auth()).expect(202);
    expect((await settled()).state).toBe('failed');
    const design = (await request(app).get('/api/design/status').set(auth()).expect(200)).body;
    expect(design.drafts[0].done).toBe(false);
    expect(design.applied).toHaveLength(1);
  });

  describe('when an overlay file grows what it must not', () => {
    // Files of the test's own, next to the real overlays — never a real one.
    const existing = path.join(process.cwd(), 'src', 'overlays', 'zz-guard-test.css');
    const created = path.join(process.cwd(), 'src', 'overlays', 'zz-guard-new.html');
    afterEach(() => {
      fs.rmSync(existing, { force: true });
      fs.rmSync(created, { force: true });
    });

    it('restores the file and books nothing of the run', async () => {
      fs.writeFileSync(existing, '.a { color: red; }\n');
      process.env.FAKE_APPEND = existing;
      process.env.FAKE_TEXT = '@import url(https://example.com/x.css);\n';
      await sendDraft();
      await request(app).post('/api/dev/implement').set(auth()).expect(202);
      const run = await settled();
      expect(run).toMatchObject({ state: 'failed', reverted: ['zz-guard-test.css (externe Adresse, @import)'] });
      expect(fs.readFileSync(existing, 'utf8')).toBe('.a { color: red; }\n');
      const design = (await request(app).get('/api/design/status').set(auth()).expect(200)).body;
      expect(design.drafts[0].done).toBe(false);
      expect(design.applied).toHaveLength(1);
    });

    it('restores a file a token was written into', async () => {
      fs.writeFileSync(existing, '.a { color: red; }\n');
      process.env.FAKE_APPEND = existing;
      process.env.FAKE_TEXT = `/* ${getFixedToken()} */\n`;
      await sendDraft();
      await request(app).post('/api/dev/implement').set(auth()).expect(202);
      expect((await settled()).reverted).toEqual(['zz-guard-test.css (Token)']);
      expect(fs.readFileSync(existing, 'utf8')).toBe('.a { color: red; }\n');
    });

    it('removes a new file that is not a stylesheet or image', async () => {
      process.env.FAKE_NEW = created;
      process.env.FAKE_TEXT = '<p>hi</p>';
      await sendDraft();
      await request(app).post('/api/dev/implement').set(auth()).expect(202);
      expect((await settled()).reverted).toEqual(['zz-guard-new.html (neu)']);
      expect(fs.existsSync(created)).toBe(false);
    });
  });

  it('says so when Claude cannot be started', async () => {
    process.env.NST_CLAUDE_BIN = path.join(dir, 'no-such-claude');
    await sendDraft();
    await request(app).post('/api/dev/implement').set(auth()).expect(202);
    expect((await settled()).error).toMatch(/nicht starten/);
  });
});

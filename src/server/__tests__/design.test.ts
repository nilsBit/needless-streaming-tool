import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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

describe('design round trip', () => {
  let app: Express;
  let token: string;
  let dir: string;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nst-design-'));
    process.env.NST_DESIGN_DIR = dir;
    initDatabase(':memory:');
    token = generateApiToken();
    app = createApp();
  });

  afterAll(() => {
    delete process.env.NST_DESIGN_DIR;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  it('needs the token', async () => {
    await request(app).get('/api/design/captures').expect(401);
    await request(app).post('/api/design/inbox').send({}).expect(401);
  });

  it('hands the state list to the plugin', async () => {
    const res = await request(app).get('/api/design/states').set(auth()).expect(200);
    expect(res.body.overlays.character.states['with-portrait']).toBeDefined();
  });

  it('lists and serves captures', async () => {
    fs.mkdirSync(path.join(dir, 'captured', 'song'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'captured', 'song', 'playing.json'), JSON.stringify({ overlay: 'song', state: 'playing', nodes: [] }));

    const list = await request(app).get('/api/design/captures').set(auth()).expect(200);
    expect(list.body).toContainEqual({ overlay: 'song', state: 'playing' });

    const one = await request(app).get('/api/design/captures/song/playing').set(auth()).expect(200);
    expect(one.body.overlay).toBe('song');
  });

  it('answers 404 for a known state that was never captured', async () => {
    await request(app).get('/api/design/captures/poll/open').set(auth()).expect(404);
  });

  it('refuses names that are not in the state list', async () => {
    await request(app).get('/api/design/captures/..%2F..%2Fsecret/x').set(auth()).expect(404);
    const res = await request(app).post('/api/design/inbox').set(auth())
      .send({ overlay: '../../evil', state: 'playing', draft: {}, image: PNG, image2x: PNG }).expect(400);
    expect(res.body.error).toMatch(/unknown/i);
  });

  it('saves a draft next to the code', async () => {
    const res = await request(app).post('/api/design/inbox').set(auth())
      .send({ overlay: 'character', state: 'with-portrait', draft: { name: 'character / with-portrait' }, image: PNG, image2x: PNG })
      .expect(201);
    expect(res.body.saved).toBe('design/drafts/character/with-portrait');

    const saved = await request(app).get('/api/design/drafts/character/with-portrait').set(auth()).expect(200);
    expect(saved.body.draft.name).toBe('character / with-portrait');
    expect(saved.body.images).toEqual(['image.png', 'image@2x.png']);
  });

  it('refuses an image that is not a PNG', async () => {
    const res = await request(app).post('/api/design/inbox').set(auth())
      .send({ overlay: 'song', state: 'playing', draft: {}, image: Buffer.from('hello').toString('base64'), image2x: PNG })
      .expect(400);
    expect(res.body.error).toMatch(/png/i);
  });

  it('takes drafts bigger than the global body limit', async () => {
    const big = { padding: 'x'.repeat(500_000) };
    await request(app).post('/api/design/inbox').set(auth())
      .send({ overlay: 'song', state: 'playing', draft: big, image: PNG, image2x: PNG }).expect(201);
  });

  it('lets the Figma plugin (origin null) through CORS only under /api/design', async () => {
    const design = await request(app).get('/api/design/captures').set(auth()).set('Origin', 'null').expect(200);
    expect(design.headers['access-control-allow-origin']).toBe('null');
    const other = await request(app).get('/api/health').set(auth()).set('Origin', 'null');
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Express } from 'express';
import { getDb, initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';

/**
 * The three milestone hotkeys celebrate at their level. They used to create a
 * milestone without a title and got 400 (12.10.2026).
 */
describe('celebrating a milestone by hotkey', () => {
  let app: Express;
  let token: string;
  let dir: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const add = (title: string, level: string) =>
    request(app).post('/api/milestones').set(auth()).send({ title, level }).expect(201);

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nst-celebrate-'));
    initDatabase(path.join(dir, 'stream.db'));
    token = generateApiToken();
    app = createApp();
  });

  // Windows refuses to delete a database that is still open.
  afterEach(() => {
    getDb().close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('ticks off the oldest open milestone of that level', async () => {
    await add('Erste Karte', 'minor');
    await add('Kapitel 1', 'major');
    await add('Zweite Karte', 'minor');
    const res = await request(app).post('/api/milestones/celebrate').set(auth()).send({ level: 'minor' }).expect(200);
    expect(res.body.milestone).toMatchObject({ title: 'Erste Karte', status: 'completed' });
    const again = await request(app).post('/api/milestones/celebrate').set(auth()).send({ level: 'minor' }).expect(200);
    expect(again.body.milestone).toMatchObject({ title: 'Zweite Karte', status: 'completed' });
    const list = (await request(app).get('/api/milestones').set(auth()).expect(200)).body as Array<{ title: string; status: string }>;
    expect(list.find((m) => m.title === 'Kapitel 1')?.status).toBe('pending');
  });

  it('celebrates without storing anything when no milestone of that level is open', async () => {
    const res = await request(app).post('/api/milestones/celebrate').set(auth()).send({ level: 'epic' }).expect(200);
    expect(res.body.milestone).toBeNull();
    expect((await request(app).get('/api/milestones').set(auth()).expect(200)).body).toEqual([]);
  });

  it('refuses an unknown level', async () => {
    await request(app).post('/api/milestones/celebrate').set(auth()).send({ level: 'huge' }).expect(400);
    await request(app).post('/api/milestones/celebrate').set(auth()).send({}).expect(400);
  });
});

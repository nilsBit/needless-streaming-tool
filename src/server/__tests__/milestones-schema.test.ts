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
 * A database made from scratch must carry the columns the milestone list
 * joins over. They used to be added by a migration with a REFERENCES clause,
 * which SQLite refuses while foreign keys are on — the error was swallowed,
 * so every fresh install answered 500 on /api/milestones.
 */
describe('a fresh database', () => {
  let app: Express;
  let token: string;
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nst-schema-'));
    initDatabase(path.join(dir, 'stream.db'));
    token = generateApiToken();
    app = createApp();
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('serves the milestone list', async () => {
    const res = await request(app).get('/api/milestones').set({ Authorization: `Bearer ${token}` }).expect(200);
    expect(res.body).toEqual([]);
  });

  it('puts a column back that a database lost', async () => {
    getDb().exec('ALTER TABLE todos DROP COLUMN milestone_id');
    initDatabase(path.join(dir, 'stream.db')); // as on the next start
    app = createApp();
    const res = await request(app).get('/api/milestones').set({ Authorization: `Bearer ${token}` }).expect(200);
    expect(res.body).toEqual([]);
  });
});

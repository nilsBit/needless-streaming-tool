import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import Database from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { initDatabase, getDb } from '../db/index';
import { SCHEMA } from '../db/schema';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';

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
});

describe('overlay config migration from a pre-Lexikon database', () => {
  // A fresh `:memory:` database is always created already at SCHEMA_VERSION, so it
  // can never exercise the `if (from < 20)` upgrade path itself — there is nothing
  // to migrate from. A real file is the only way to hand initDatabase() a database
  // that looks like it predates this migration. Do not change this back to
  // `:memory:`; everything asserted below still goes through HTTP, never the DB.
  let app: Express;
  let dbPath: string;

  beforeAll(() => {
    dbPath = path.join(os.tmpdir(), `overlay-lexikon-migration-${process.pid}-${Date.now()}.db`);

    const seed = new Database(dbPath);
    seed.exec(SCHEMA);
    seed.prepare('INSERT OR REPLACE INTO schema_version (version) VALUES (?)').run(19);
    seed.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
      'overlay_config',
      JSON.stringify({
        global: { '--color-accent': '#e67e22', '--font-body': "'Inter', sans-serif" },
        overrides: { song: { '--color-accent': '#ff0000' } },
      }),
    );
    seed.close();

    initDatabase(dbPath);
    app = createApp();
  });

  afterAll(() => {
    // Close before unlinking: on Windows a still-open file cannot be deleted.
    getDb().close();
    fs.unlinkSync(dbPath);
  });

  it('replaces the old global palette with Lexikon and keeps the existing overrides', async () => {
    const res = await request(app).get('/public/overlay-config').expect(200);

    expect(res.body.global['--color-accent']).toBe('#c9a45c');
    expect(res.body.global['--font-body']).toBe("'Source Serif 4', Georgia, serif");
    expect(res.body.overrides.song['--color-accent']).toBe('#ff0000');
  });
});

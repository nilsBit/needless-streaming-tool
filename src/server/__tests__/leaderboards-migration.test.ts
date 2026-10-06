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
 * Before 2026-10-06 (evening) the Bestenliste was the flex ranking: a chosen
 * reward unlocked a flex (`flex_credits`), !flex spent it. The update turns
 * the chosen reward into the first list, "Flex", and counts open flexes as
 * points, so nobody loses what they paid for.
 */
describe('the update to several Bestenlisten', () => {
  let dir: string;
  let token: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nst-leaderboards-'));
  });

  afterEach(() => {
    getDb().close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  /** A database as version 27 left it: counts under `flex`, open credits, the chosen reward. */
  function databaseFromBefore(withReward: boolean): Express {
    const file = path.join(dir, 'stream.db');
    initDatabase(file);
    const db = getDb();
    db.exec('DROP TABLE IF EXISTS leaderboards');
    db.exec('CREATE TABLE IF NOT EXISTS flex_credits (user_name TEXT PRIMARY KEY, credits INTEGER NOT NULL DEFAULT 0, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
    db.prepare("INSERT INTO reward_stats (user_name, reward_type, count) VALUES ('kartograph', 'flex', 3), ('tintenfass', 'flex', 1)").run();
    db.prepare("INSERT INTO flex_credits (user_name, credits) VALUES ('tintenfass', 2), ('neuling', 1)").run();
    if (withReward) {
      db.prepare("INSERT INTO settings (key, value) VALUES ('flex_reward_id', 'rw-1'), ('flex_reward_title', 'Flex!')").run();
    }
    db.prepare('DELETE FROM schema_version').run();
    db.prepare('INSERT INTO schema_version (version) VALUES (27)').run();
    db.close();
    initDatabase(file); // the next start
    token = generateApiToken();
    return createApp();
  }

  it('turns the chosen flex reward into the list "Flex" and keeps every point', async () => {
    const app = databaseFromBefore(true);
    const lists = (await request(app).get('/api/leaderboards').set(auth()).expect(200)).body;
    expect(lists).toEqual([{ key: 'flex', title: 'Flex', reward_id: 'rw-1', reward_title: 'Flex!', viewers: 3 }]);
    const board = (await request(app).get('/api/leaderboards/flex/board').set(auth()).expect(200)).body;
    expect(board.map((r: { user_name: string; count: number }) => [r.user_name, r.count])).toEqual([['kartograph', 3], ['tintenfass', 3], ['neuling', 1]]);
    expect(getDb().prepare("SELECT name FROM sqlite_master WHERE name = 'flex_credits'").get()).toBeUndefined();
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM settings WHERE key LIKE 'flex_reward%'").get()).toEqual({ n: 0 });
  });

  it('creates no list without a chosen reward, but keeps the old counts for a list named "Flex" later', async () => {
    const app = databaseFromBefore(false);
    expect((await request(app).get('/api/leaderboards').set(auth()).expect(200)).body).toEqual([]);
    await request(app).post('/api/leaderboards').set(auth()).send({ title: 'Flex', reward: { id: 'rw-5', title: 'Flex' } }).expect(201);
    const board = (await request(app).get('/api/leaderboards/flex/board').set(auth()).expect(200)).body;
    expect(board.map((r: { user_name: string; count: number }) => [r.user_name, r.count])).toEqual([['kartograph', 3], ['tintenfass', 3], ['neuling', 1]]);
  });

  it('runs on a fresh database without a trace', async () => {
    initDatabase(path.join(dir, 'fresh.db'));
    token = generateApiToken();
    const app = createApp();
    expect((await request(app).get('/api/leaderboards').set(auth()).expect(200)).body).toEqual([]);
    expect(getDb().prepare("SELECT name FROM sqlite_master WHERE name = 'flex_credits'").get()).toBeUndefined();
  });
});

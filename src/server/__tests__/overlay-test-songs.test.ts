import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Express } from 'express';
import type Database from 'better-sqlite3';
import { initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';

/**
 * The song queue's test button fills the overlay with three songs and takes
 * them out again eight seconds later. A restart in between used to leave them
 * in the real queue — three of them stood there from 19.09. to 24.09.
 */
describe('the song queue test button', () => {
  let app: Express;
  let token: string;
  let file: string;
  let dir: string;
  let db: Database.Database | null = null;

  // Windows refuses to delete a database that is still open, so every start
  // closes the one before, as the app's own restart would.
  const start = () => {
    db?.close();
    db = initDatabase(file);
    token = generateApiToken();
    app = createApp();
  };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nst-songs-'));
    file = path.join(dir, 'stream.db');
    start();
  });

  afterEach(() => {
    db?.close();
    db = null;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const queue = async () => (await request(app).get('/public/song-queue').expect(200)).body;

  it('fills the overlay, and the next start clears what it left behind', async () => {
    await request(app).post('/api/actions/overlay-test/song-queue').set(auth()).expect(200);
    const filled = await queue();
    expect(JSON.stringify(filled)).toContain('Sandstorm');

    // As after a restart while the eight seconds were still running. Only
    // rows the button marked go; a real request has no mark.
    start();
    expect(await queue()).toEqual([]);
  });

});

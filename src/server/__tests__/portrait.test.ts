import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { Socket } from 'net';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';

/**
 * Pinning an Entry copies its portrait onto disk first, and that copy is a
 * request to another app. A stream must not stall because that app went quiet —
 * the same rule every other read of the world already follows.
 *
 * Worldbuilder here is a stub that accepts the connection and then says
 * nothing. That is how a busy app fails: not refused, which would come back at
 * once, but silent, which without a deadline never comes back at all.
 */

const TOKEN = 'portrait-token';
const CONNECTION = path.join(os.tmpdir(), `wb-portrait-${process.pid}.json`);

let stub: http.Server;
const open = new Set<Socket>();

function startSilentStub(): Promise<number> {
  stub = http.createServer(() => {
    /* accepts the request and never answers it */
  });
  // The sockets stay open by design, so they have to be torn down by hand —
  // stub.close() alone would wait for them.
  stub.on('connection', (socket) => {
    open.add(socket);
    socket.on('close', () => open.delete(socket));
  });
  return new Promise((resolve) => stub.listen(0, '127.0.0.1', () => resolve((stub.address() as { port: number }).port)));
}

describe('portraits', () => {
  let app: Express;
  let token: string;
  let port: number;

  beforeAll(async () => {
    port = await startSilentStub();
    fs.writeFileSync(CONNECTION, JSON.stringify({ version: 1, port, token: TOKEN, pid: process.pid }));
    process.env.WORLDBUILDER_ANSCHLUSS = CONNECTION;
    initDatabase(':memory:');
    token = generateApiToken();
    app = createApp();
  });

  afterAll(async () => {
    for (const socket of open) socket.destroy();
    await new Promise<void>((done) => stub.close(() => done()));
    fs.rmSync(CONNECTION, { force: true });
    delete process.env.WORLDBUILDER_ANSCHLUSS;
  });

  it('gives up on a portrait the world never sends, and pins the entry without it', async () => {
    const entry = {
      id: 'e-still',
      source: 'worldbuilder',
      title: 'Die Stille',
      art: 'Figur',
      artColor: null,
      maturity: 'Entwurf',
      aliases: [],
      text: null,
      fields: [],
      // A portrait on the open world's own port, so it travels with the token.
      image: `http://127.0.0.1:${port}/bild/e-still`,
      world: 'Testwelt',
    };

    const started = Date.now();
    const res = await request(app)
      .post('/api/entries/active')
      .set({ Authorization: `Bearer ${token}` })
      .send(entry)
      .expect(200);
    const took = Date.now() - started;

    // A portrait an overlay cannot follow is worse than none, so the card drops it.
    expect(res.body.card).toMatchObject({ id: 'e-still', title: 'Die Stille', image: null });
    // The budget is five seconds; without one this ran until the test gave up.
    expect(took).toBeLessThan(10000);
  }, 30000);
});

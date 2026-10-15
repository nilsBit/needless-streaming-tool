import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import os from 'os';
import path from 'path';
import { initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';

/**
 * Characters come from Worldbuilder, which is not running here — so these
 * tests cover what can be observed without it: the failure mode when it is
 * closed, and the active-character snapshot, which is pure local state.
 * Reading a running Worldbuilder is `worldbuilder.test.ts`.
 */
describe('characters', () => {
  let app: Express;
  let token: string;

  beforeAll(() => {
    // Never the real announcement file a running Worldbuilder may have written.
    process.env.WORLDBUILDER_ANSCHLUSS = path.join(os.tmpdir(), `wb-none-${process.pid}.json`);
    initDatabase(':memory:');
    token = generateApiToken();
    app = createApp();
  });

  afterAll(() => {
    delete process.env.WORLDBUILDER_ANSCHLUSS;
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  it('reports a closed Worldbuilder as not running', async () => {
    const res = await request(app).get('/api/characters').set(auth()).expect(503);
    expect(res.body.error).toBe('worldbuilder_not_running');
  });

  it('has no active character before one is picked', async () => {
    const res = await request(app).get('/api/characters/active').set(auth()).expect(200);
    expect(res.body.character).toBeNull();
  });

  it('serves the active character to overlays without a token', async () => {
    const res = await request(app).get('/public/character').expect(200);
    expect(res.body.character).toBeNull();
  });

  it('rejects an active character without id or name', async () => {
    await request(app).post('/api/characters/active').set(auth()).send({ name: 'Mila' }).expect(400);
    await request(app).post('/api/characters/active').set(auth()).send({ id: 'abc' }).expect(400);
  });

  it('pins a character and serves it to the overlay', async () => {
    await request(app)
      .post('/api/characters/active')
      .set(auth())
      .send({
        id: 'page-1',
        name: 'Mila',
        role: 'Protagonistin',
        status: 'In Arbeit',
        summary: 'Introvertierte Grafikdesign-Studentin.',
        image: 'https://example.invalid/mila.png',
      })
      .expect(200);

    const overlay = await request(app).get('/public/character').expect(200);
    expect(overlay.body.character).toMatchObject({
      name: 'Mila',
      role: 'Protagonistin',
      summary: 'Introvertierte Grafikdesign-Studentin.',
    });
  });

  it('drops optional fields that are not strings', async () => {
    await request(app)
      .post('/api/characters/active')
      .set(auth())
      .send({ id: 'page-2', name: 'Rafe', role: 42, summary: null })
      .expect(200);

    const res = await request(app).get('/api/characters/active').set(auth()).expect(200);
    expect(res.body.character).toMatchObject({ name: 'Rafe', role: null, summary: null });
  });

  it('starts the clock when a character is pinned', async () => {
    await request(app)
      .post('/api/characters/active')
      .set(auth())
      .send({ id: 'page-3', name: 'Akira' })
      .expect(200);

    const res = await request(app).get('/api/characters/active').set(auth()).expect(200);
    expect(Number(res.body.since)).toBeGreaterThan(0);
  });

  it('clears the active character and stops the clock', async () => {
    await request(app).delete('/api/characters/active').set(auth()).expect(200);
    const res = await request(app).get('/public/character').expect(200);
    expect(res.body.character).toBeNull();

    const active = await request(app).get('/api/characters/active').set(auth()).expect(200);
    expect(active.body.since).toBeNull();
  });

  it('reports a closed Worldbuilder when cycling too', async () => {
    const res = await request(app).post('/api/characters/cycle').set(auth()).expect(503);
    expect(res.body.error).toBe('worldbuilder_not_running');
  });

  it('switches from one picked character to the next', async () => {
    await request(app).post('/api/characters/active').set(auth()).send({ id: 'a', name: 'Erste' }).expect(200);
    await request(app).post('/api/characters/active').set(auth()).send({ id: 'b', name: 'Zweite' }).expect(200);

    const res = await request(app).get('/public/character').expect(200);
    expect(res.body.character.name).toBe('Zweite');
  });
});

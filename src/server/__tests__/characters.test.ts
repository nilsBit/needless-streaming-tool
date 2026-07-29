import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';

/**
 * Characters come from Notion, so these tests deliberately cover only what can
 * be observed without contacting it: the failure modes when nothing is
 * configured, and the active-character snapshot, which is pure local state.
 */
describe('characters', () => {
  let app: Express;
  let token: string;

  beforeAll(() => {
    initDatabase(':memory:');
    token = generateApiToken();
    app = createApp();
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  it('reports a missing database instead of calling Notion', async () => {
    const res = await request(app).get('/api/characters').set(auth()).expect(400);
    expect(res.body.error).toBe('no_database');
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

  it('clears the active character', async () => {
    await request(app).delete('/api/characters/active').set(auth()).expect(200);
    const res = await request(app).get('/public/character').expect(200);
    expect(res.body.character).toBeNull();
  });
});

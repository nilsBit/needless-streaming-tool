import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';

/** The wheel is called whatever the streamer names it; "Glücksrad" until then. */
describe('the wheel’s title', () => {
  let app: Express;
  let auth: { Authorization: string };

  beforeEach(() => {
    initDatabase(':memory:');
    auth = { Authorization: `Bearer ${generateApiToken()}` };
    app = createApp();
  });

  const shown = async () => (await request(app).get('/public/roulette').expect(200)).body.title;

  it('is Glücksrad until renamed, and then the streamer’s word', async () => {
    expect(await shown()).toBe('Glücksrad');
    await request(app).post('/api/actions/roulette-title').set(auth).send({ title: '  Themenrad  ' }).expect(200);
    expect(await shown()).toBe('Themenrad');
  });

  it('goes back to Glücksrad when emptied, and refuses a title too long', async () => {
    await request(app).post('/api/actions/roulette-title').set(auth).send({ title: 'Rad der Stadt' }).expect(200);
    await request(app).post('/api/actions/roulette-title').set(auth).send({ title: '' }).expect(200);
    expect(await shown()).toBe('Glücksrad');
    await request(app).post('/api/actions/roulette-title').set(auth).send({ title: 'x'.repeat(31) }).expect(400);
    await request(app).post('/api/actions/roulette-title').send({ title: 'Fremd' }).expect(401);
    expect(await shown()).toBe('Glücksrad');
  });
});

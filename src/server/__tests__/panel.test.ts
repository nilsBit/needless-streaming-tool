import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';

/**
 * The panel overlay shows one of progress and todos in a single browser
 * source. Which one is the streamer's pick: it stays until picked again.
 */
describe('the panel overlay’s view', () => {
  let app: Express;
  let auth: { Authorization: string };

  beforeEach(() => {
    initDatabase(':memory:');
    auth = { Authorization: `Bearer ${generateApiToken()}` };
    app = createApp();
  });

  const shown = async () => (await request(app).get('/public/panel').expect(200)).body.view;

  it('shows progress until something else is picked', async () => {
    expect(await shown()).toBe('progress');
    expect((await request(app).get('/api/panel').set(auth).expect(200)).body).toEqual({ view: 'progress', views: ['progress', 'todos', 'off'] });
  });

  it('shows what was picked, and keeps it', async () => {
    await request(app).post('/api/panel').set(auth).send({ view: 'todos' }).expect(200);
    expect(await shown()).toBe('todos');
    // A fresh overlay — a reloaded browser source — asks and gets the same.
    expect(await shown()).toBe('todos');
  });

  it('steps to the next with one call, round and round — for a hotkey', async () => {
    const next = async () => (await request(app).post('/api/panel/next').set(auth).expect(200)).body.view;
    expect(await next()).toBe('todos');
    expect(await next()).toBe('off');
    expect(await next()).toBe('progress');
    expect(await shown()).toBe('progress');
  });

  it('refuses a view it does not have, and changes nothing', async () => {
    await request(app).post('/api/panel').set(auth).send({ view: 'leaderboard' }).expect(400);
    await request(app).post('/api/panel').set(auth).send({}).expect(400);
    expect(await shown()).toBe('progress');
  });

  it('tells an overlay that loads mid-vote which vote is running', async () => {
    expect((await request(app).get('/public/poll').expect(200)).body).toEqual({ poll: null });
    await request(app).post('/api/voting/start').set(auth).send({ title: 'Wohin?', options: ['Hafen', 'Markt'], duration: 60 }).expect(200);
    expect((await request(app).get('/public/poll').expect(200)).body.poll).toEqual({
      title: 'Wohin?',
      options: [{ label: 'hafen', votes: 0 }, { label: 'markt', votes: 0 }],
    });
    await request(app).post('/api/voting/cancel').set(auth).expect(200);
    expect((await request(app).get('/public/poll').expect(200)).body).toEqual({ poll: null });
  });

  it('is picked only with a token; any overlay may read it', async () => {
    await request(app).post('/api/panel').send({ view: 'off' }).expect(401);
    await request(app).post('/api/panel/next').expect(401);
    expect(await shown()).toBe('progress');
  });
});

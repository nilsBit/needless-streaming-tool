import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';

// An overlay becomes "einsatzbereit" in three steps (2026-10-08): set up,
// in OBS, tested. Set up and tested are kept here; in OBS comes from OBS,
// which no test reaches — so here it is unknown and nothing becomes ready.

describe('overlay steps', () => {
  let app: Express;
  let token: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(() => {
    initDatabase(':memory:');
    token = generateApiToken();
    app = createApp();
  });

  it('starts with nothing done, except setting up an overlay that has nothing to set', async () => {
    const res = await request(app).get('/api/overlays/steps').set(auth()).expect(200);
    expect(res.body.xp).toBe(20);
    expect(res.body.steps.alerts).toEqual({ tuned: false, placed: null, tested: false, ready: false });
    // Driven live under "Im Stream" or showing by itself: the first step is done.
    expect(res.body.steps.roulette.tuned).toBe(true);
    expect(res.body.steps.chat.tuned).toBe(true);
  });

  it('says in the catalog what the first step is', async () => {
    const res = await request(app).get('/api/overlays/catalog').set(auth()).expect(200);
    const setup = Object.fromEntries(res.body.map((e: { name: string; setup: string }) => [e.name, e.setup]));
    expect(setup.alerts).toBe('settings');
    expect(setup['reward-leaderboard']).toBe('settings');
    expect(setup.roulette).toBe('live');
    expect(setup.chat).toBe('none');
  });

  it('keeps a step once done', async () => {
    const tuned = await request(app).post('/api/overlays/steps/alerts').set(auth()).send({ step: 'tuned' }).expect(200);
    expect(tuned.body.steps).toEqual({ tuned: true, placed: null, tested: false, ready: false });
    expect(tuned.body.becameReady).toBe(false);

    await request(app).post('/api/overlays/steps/alerts').set(auth()).send({ step: 'tested' }).expect(200);
    const res = await request(app).get('/api/overlays/steps').set(auth()).expect(200);
    // Not in OBS as far as anyone knows: not ready, and no EP.
    expect(res.body.steps.alerts).toEqual({ tuned: true, placed: null, tested: true, ready: false });
    const quests = await request(app).get('/api/quests').set(auth()).expect(200);
    expect(quests.body.stage.xp).toBe(0);
  });

  it('refuses an unknown step or overlay', async () => {
    await request(app).post('/api/overlays/steps/alerts').set(auth()).send({ step: 'placed' }).expect(400);
    await request(app).post('/api/overlays/steps/nope').set(auth()).send({ step: 'tested' }).expect(404);
  });
});

describe('one overlay\'s own look', () => {
  let app: Express;
  let token: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(() => {
    initDatabase(':memory:');
    token = generateApiToken();
    app = createApp();
  });

  it('sets and removes one overlay\'s look without touching the others', async () => {
    await request(app).post('/api/overlay-config').set(auth())
      .send({ global: { '--color-accent': '#e0201b' }, overrides: { song: { '--color-accent': '#00ff00' } } }).expect(200);

    await request(app).put('/api/overlay-config/overrides/alerts').set(auth())
      .send({ vars: { '--color-accent': '#123456', '--not-a-var': 'x' } }).expect(200);
    let config = (await request(app).get('/api/overlay-config').set(auth()).expect(200)).body;
    expect(config.global).toEqual({ '--color-accent': '#e0201b' });
    expect(config.overrides).toEqual({ song: { '--color-accent': '#00ff00' }, alerts: { '--color-accent': '#123456' } });

    await request(app).put('/api/overlay-config/overrides/alerts').set(auth()).send({ vars: {} }).expect(200);
    config = (await request(app).get('/api/overlay-config').set(auth()).expect(200)).body;
    expect(config.overrides).toEqual({ song: { '--color-accent': '#00ff00' } });
  });

  it('keeps only plain values, never url()', async () => {
    await request(app).put('/api/overlay-config/overrides/alerts').set(auth())
      .send({ vars: { '--color-accent': 'url(https://example.com/x)', '--font-body': "'Inter', sans-serif", '--font-size-base': '20px' } }).expect(200);
    const config = (await request(app).get('/api/overlay-config').set(auth()).expect(200)).body;
    expect(config.overrides.alerts).toEqual({ '--font-body': "'Inter', sans-serif", '--font-size-base': '20px' });
  });

  it('refuses a bad name or body', async () => {
    await request(app).put('/api/overlay-config/overrides/..%2Fx').set(auth()).send({ vars: {} }).expect(400);
    await request(app).put('/api/overlay-config/overrides/alerts').set(auth()).send({ vars: [] }).expect(400);
  });
});

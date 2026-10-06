import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';
import { forgetWorldbuilder } from '../features';

// The setup on first start and "Was dein Stream kann": what a fresh install
// starts with, how a choice is saved, and how the choice reaches the bot's
// commands, the readiness checks and the overlay catalog.

describe('setup and features', () => {
  let app: Express;
  let token: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  // Where the Worldbuilder would announce itself on this machine — nowhere, to begin with.
  const anschluss = path.join(os.tmpdir(), `nst-setup-test-${process.pid}-${Date.now()}.json`);

  beforeAll(() => {
    process.env.WORLDBUILDER_ANSCHLUSS = anschluss;
    initDatabase(':memory:');
    token = generateApiToken();
    app = createApp();
  });

  afterAll(() => {
    try { fs.unlinkSync(anschluss); } catch { /* never written */ }
    delete process.env.WORLDBUILDER_ANSCHLUSS;
  });

  it('needs a token like every API route', async () => {
    await request(app).get('/api/setup').expect(401);
  });

  it('starts a fresh install with everything on, the setup still open and the defaults for its first step', async () => {
    const res = await request(app).get('/api/setup').set(auth()).expect(200);
    expect(res.body.done).toBe(false);
    // Everything but the personal features — the Worldbuilder is not set up here.
    expect(res.body.features).toHaveLength(16);
    expect(res.body.features).not.toContain('welt');
    expect(res.body.defaults).toEqual(['chat', 'alerts', 'momente']);
    expect(res.body.worldbuilder).toBe(false);
  });

  it('saves a choice once, refuses unknown keys and drops personal ones without the Worldbuilder', async () => {
    const saved = await request(app).post('/api/setup/features').set(auth()).send({ features: ['rad', 'welt', 'rad'] }).expect(200);
    expect(saved.body.features).toEqual(['rad']);
    await request(app).post('/api/setup/features').set(auth()).send({ features: ['leaderboard'] }).expect(400);
    await request(app).post('/api/setup/features').set(auth()).send({ features: 'rad' }).expect(400);
    const again = await request(app).get('/api/setup').set(auth()).expect(200);
    expect(again.body.features).toEqual(['rad']);
  });

  it('keeps built-in commands of features that are off out of the list', async () => {
    const triggers = async () => ((await request(app).get('/api/commands').set(auth()).expect(200)).body.commands as Array<{ trigger: string }>).map((c) => c.trigger);
    // Only the wheel is on: !themen answers, !sr does not; !befehle belongs to no feature and stays.
    let list = await triggers();
    expect(list).toContain('!themen');
    expect(list).toContain('!befehle');
    expect(list).not.toContain('!sr');
    expect(list).not.toContain('!stats');

    await request(app).post('/api/setup/features').set(auth()).send({ features: ['musik', 'bestenliste'] }).expect(200);
    list = await triggers();
    expect(list).toContain('!sr');
    expect(list).toContain('!queue');
    expect(list).toContain('!stats');
    expect(list).not.toContain('!themen');
  });

  it('drops the readiness checks of features that are off', async () => {
    const ids = async () => ((await request(app).get('/api/readiness').set(auth()).expect(200)).body.items as Array<{ id: string }>).map((i) => i.id);
    // Only the moments: nothing needs a connection, so nothing can be missing.
    await request(app).post('/api/setup/features').set(auth()).send({ features: ['momente'] }).expect(200);
    expect(await ids()).toEqual([]);
    expect((await request(app).get('/api/readiness').set(auth()).expect(200)).body.ready).toBe(true);

    // Alerts need Twitch, OBS and a browser source; their sound is their own check.
    await request(app).post('/api/setup/features').set(auth()).send({ features: ['alerts'] }).expect(200);
    const withAlerts = await ids();
    expect(withAlerts).toEqual(['twitch', 'obs', 'overlays', 'alertSounds']);
  });

  it('tags every catalog overlay with its feature', async () => {
    const res = await request(app).get('/api/overlays/catalog').set(auth()).expect(200);
    const byName = Object.fromEntries(res.body.map((e: { name: string; feature: string | null }) => [e.name, e.feature]));
    expect(byName.chat).toBe('chat');
    expect(byName.roulette).toBe('rad');
    expect(byName.todos).toBe('fortschritt');
    expect(byName['reward-rankchange']).toBe('bestenliste');
    expect(byName.character).toBe('welt');
    expect(byName.start).toBe('bilder');
  });

  it('marks the setup done and keeps the choice', async () => {
    await request(app).post('/api/setup/done').set(auth()).expect(200);
    const res = await request(app).get('/api/setup').set(auth()).expect(200);
    expect(res.body.done).toBe(true);
    expect(res.body.features).toEqual(['alerts']);
  });

  it('offers the personal features once the Worldbuilder is set up on this machine', async () => {
    fs.writeFileSync(anschluss, JSON.stringify({ port: 1, token: 'x' }));
    forgetWorldbuilder();
    const res = await request(app).get('/api/setup').set(auth()).expect(200);
    expect(res.body.worldbuilder).toBe(true);
    const saved = await request(app).post('/api/setup/features').set(auth()).send({ features: ['welt', 'bilder'] }).expect(200);
    expect(saved.body.features).toEqual(['welt', 'bilder']);
    // Gone again: the choice stays stored, but the personal features count as off.
    fs.unlinkSync(anschluss);
    forgetWorldbuilder();
    const after = await request(app).get('/api/setup').set(auth()).expect(200);
    expect(after.body.features).toEqual([]);
  });

  it('also counts the Worldbuilder as set up once it is the chosen source for the world', async () => {
    await request(app).post('/api/characters/source').set(auth()).send({ source: 'worldbuilder' }).expect(200);
    const res = await request(app).get('/api/setup').set(auth()).expect(200);
    expect(res.body.worldbuilder).toBe(true);
    expect(res.body.features).toEqual(['welt', 'bilder']);
    await request(app).post('/api/characters/source').set(auth()).send({ source: 'notion' }).expect(200);
    expect((await request(app).get('/api/setup').set(auth()).expect(200)).body.worldbuilder).toBe(false);
  });
});

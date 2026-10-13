import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getDb, initDatabase } from '../db/index';
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
  const connectTo = (channel: string) =>
    getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('twitch_config', JSON.stringify({ channel, username: channel, oauth_token: '' }));

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
    // Everything but the personal features — no Twitch channel is connected.
    expect(res.body.features).toHaveLength(14);
    expect(res.body.features).not.toContain('welt');
    expect(res.body.features).not.toContain('momente');
    expect(res.body.defaults).not.toContain('chat');
    expect(res.body.defaults).not.toContain('alerts');
    expect(res.body.defaults).toContain('rad');
    expect(res.body.worldbuilder).toBe(false);
    expect(res.body.personal).toBe(false);
  });

  it('saves a choice once, refuses unknown keys and drops personal ones off his channel', async () => {
    const saved = await request(app).post('/api/setup/features').set(auth()).send({ features: ['rad', 'welt', 'rad'] }).expect(200);
    expect(saved.body.features).toEqual(['rad']);
    await request(app).post('/api/setup/features').set(auth()).send({ features: ['leaderboard'] }).expect(400);
    await request(app).post('/api/setup/features').set(auth()).send({ features: 'rad' }).expect(400);
    const again = await request(app).get('/api/setup').set(auth()).expect(200);
    expect(again.body.features).toEqual(['rad']);
  });

  it('keeps built-in commands of features that are off out of the list', async () => {
    const triggers = async () => ((await request(app).get('/api/commands').set(auth()).expect(200)).body.commands as Array<{ trigger: string }>).map((c) => c.trigger);
    // Only the wheel is on: !themen answers, !stats does not; !befehle belongs to no feature and stays.
    let list = await triggers();
    expect(list).toContain('!themen');
    expect(list).toContain('!befehle');
    expect(list).not.toContain('!stats');

    await request(app).post('/api/setup/features').set(auth()).send({ features: ['bestenliste'] }).expect(200);
    list = await triggers();
    expect(list).toContain('!stats');
    expect(list).not.toContain('!themen');
  });

  it('drops the readiness checks of features that are off', async () => {
    const ids = async () => ((await request(app).get('/api/readiness').set(auth()).expect(200)).body.items as Array<{ id: string }>).map((i) => i.id);
    // Nothing on: nothing needs a connection, so nothing can be missing.
    await request(app).post('/api/setup/features').set(auth()).send({ features: [] }).expect(200);
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
    expect(byName.progress).toBe('fortschritt');
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

  it('keeps the personal features away from a machine that merely has the Worldbuilder', async () => {
    fs.writeFileSync(anschluss, JSON.stringify({ port: 1, token: 'x' }));
    forgetWorldbuilder();
    const res = await request(app).get('/api/setup').set(auth()).expect(200);
    expect(res.body.worldbuilder).toBe(true);
    expect(res.body.personal).toBe(false);
    const saved = await request(app).post('/api/setup/features').set(auth()).send({ features: ['welt', 'momente'] }).expect(200);
    expect(saved.body.features).toEqual([]);
    fs.unlinkSync(anschluss);
    forgetWorldbuilder();
  });

  it('offers the personal features only while the tool is connected to his channel', async () => {
    connectTo('Chain_Des');
    const res = await request(app).get('/api/setup').set(auth()).expect(200);
    expect(res.body.personal).toBe(true);
    const saved = await request(app).post('/api/setup/features').set(auth()).send({ features: ['welt', 'bilder', 'momente', 'autoclips'] }).expect(200);
    expect(saved.body.features).toEqual(['welt', 'bilder', 'momente', 'autoclips']);
    // Another channel: the choice stays stored, but the personal features count as off.
    connectTo('someone_else');
    const after = await request(app).get('/api/setup').set(auth()).expect(200);
    expect(after.body.personal).toBe(false);
    expect(after.body.features).toEqual([]);
    connectTo('chain_des');
    expect((await request(app).get('/api/setup').set(auth()).expect(200)).body.features).toEqual(['welt', 'bilder', 'momente', 'autoclips']);
  });

  it('also counts the Worldbuilder as set up once it is the chosen source for the world', async () => {
    await request(app).post('/api/characters/source').set(auth()).send({ source: 'worldbuilder' }).expect(200);
    const res = await request(app).get('/api/setup').set(auth()).expect(200);
    expect(res.body.worldbuilder).toBe(true);
    await request(app).post('/api/characters/source').set(auth()).send({ source: 'notion' }).expect(200);
    expect((await request(app).get('/api/setup').set(auth()).expect(200)).body.worldbuilder).toBe(false);
  });
});

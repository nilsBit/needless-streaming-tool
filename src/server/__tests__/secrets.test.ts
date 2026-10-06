import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';

// Security review of 2026-10-06, first block: secrets never leave through a
// backup and never come in through one; the generic settings routes neither
// read nor write them; the Twitch login accepts a token only for a login
// this tool started.

describe('secrets stay on the machine', () => {
  let app: Express;
  let token: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    initDatabase(':memory:');
    token = generateApiToken();
    app = createApp();
    // Something secret (the OBS password) and something ordinary.
    await request(app).post('/api/obs/config').set(auth()).send({ host: 'localhost', port: 4455, password: 'geheim' }).expect(200);
    await request(app).post('/api/settings/set').set(auth()).send({ key: 'raid_shoutout', value: 'true' }).expect(200);
  });

  it('exports the settings without tokens, passwords and webhooks', async () => {
    const res = await request(app).get('/api/backup/export').set(auth()).expect(200);
    const keys = (res.body.settings as Array<{ key: string }>).map((r) => r.key);
    expect(keys).toContain('raid_shoutout');
    expect(keys).not.toContain('api_token');
    expect(keys).not.toContain('design_token');
    expect(keys).not.toContain('obs_config');
    expect(JSON.stringify(res.body)).not.toContain('geheim');
  });

  it('imports ordinary settings, skips foreign secrets and keeps its own', async () => {
    const before = (await request(app).get('/api/settings/api-token').set(auth()).expect(200)).body.token;
    const res = await request(app).post('/api/backup/import').set(auth()).send({
      settings: [
        { key: 'api_token', value: 'fremd' },
        { key: 'obs_config', value: '{"host":"evil","port":1,"password":"x"}' },
        { key: 'notion_auto_sync', value: 'true' },
      ],
    }).expect(200);
    expect(res.body.secretsSkipped).toBe(2);

    const after = (await request(app).get('/api/settings/api-token').set(auth()).expect(200)).body.token;
    expect(after).toBe(before);
    expect((await request(app).get('/api/settings/get/notion_auto_sync').set(auth()).expect(200)).body.value).toBe('true');
    const obs = (await request(app).get('/api/obs/config').set(auth()).expect(200)).body;
    expect(obs.host).toBe('localhost');
    expect(obs.has_password).toBe(true);
  });

  it('refuses secret keys on the generic settings routes', async () => {
    await request(app).get('/api/settings/get/obs_config').set(auth()).expect(403);
    await request(app).get('/api/settings/get/api_token').set(auth()).expect(403);
    await request(app).get('/api/settings/get/notion_token').set(auth()).expect(403);
    await request(app).post('/api/settings/set').set(auth()).send({ key: 'twitch_config', value: '{}' }).expect(403);
    await request(app).post('/api/settings/batch').set(auth()).send({ discord_live_webhook: 'https://x', ui_density: 'compact' }).expect(403);
    // The whole batch is refused: the harmless key did not land either.
    expect((await request(app).get('/api/settings/get/ui_density').set(auth()).expect(200)).body.value).toBeNull();
    // Ordinary keys work as before (the import above replaced them, so set one again).
    await request(app).post('/api/settings/set').set(auth()).send({ key: 'raid_shoutout', value: 'false' }).expect(200);
    expect((await request(app).get('/api/settings/get/raid_shoutout').set(auth()).expect(200)).body.value).toBe('false');
  });
});

describe('Twitch login', () => {
  let app: Express;
  let token: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(() => {
    initDatabase(':memory:');
    token = generateApiToken();
    app = createApp();
  });

  it('puts a one-time state into the login address', async () => {
    const res = await request(app).get('/api/auth/twitch/url').set(auth()).expect(200);
    expect(res.body.url).toMatch(/[&?]state=[0-9a-f]{32}(&|$)/);
    expect(res.body.url).toContain('response_type=token');
  });

  it('sends the state back from the callback page', async () => {
    const res = await request(app).get('/api/auth/twitch/callback').expect(200);
    expect(res.text).toContain("params.get('state')");
    expect(res.text).toContain('Content-Security-Policy');
  });

  it('refuses to save a token without a state it issued — before asking Twitch', async () => {
    await request(app).post('/api/auth/twitch/save').send({ access_token: 'fremd' }).expect(403);
    await request(app).post('/api/auth/twitch/save').send({ access_token: 'fremd', state: 'deadbeefdeadbeefdeadbeefdeadbeef' }).expect(403);
    await request(app).post('/api/auth/twitch/save').send({ access_token: 'fremd', state: 'nicht-hex' }).expect(403);
  });
});

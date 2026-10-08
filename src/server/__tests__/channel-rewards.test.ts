import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import http from 'http';
import { initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';
import { handleRedemption } from '../bot/eventsub';

/**
 * #24: Twitch channel-point rewards made and edited from the app, each bound
 * to an action by its id. Against a Helix stub on 127.0.0.1 that behaves like
 * Twitch: a reward from the dashboard answers 403 to editing and deleting.
 */

interface StubReward { id: string; title: string; cost: number; prompt: string; is_user_input_required: boolean; is_enabled: boolean; mine: boolean }
let rewards: StubReward[] = [];
let calls: Array<{ method: string; path: string; body: unknown }> = [];
let nextId = 1;
let stub: http.Server;

function startStub(): Promise<number> {
  stub = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const json = (body: unknown, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(body === undefined ? '' : JSON.stringify(body)); };
      if (req.headers.authorization !== 'Bearer tok') return json({ message: 'invalid token' }, 401);
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      const body = raw ? JSON.parse(raw) : undefined;
      calls.push({ method: req.method ?? '', path: url.pathname, body });
      // What Twitch answers: the reward without the stub's own `mine` flag.
      const out = ({ id, title, cost, prompt, is_user_input_required, is_enabled }: StubReward) => ({ id, title, cost, prompt, is_user_input_required, is_enabled });
      if (url.pathname === '/users') return json({ data: [{ id: '42', login: 'kanal' }] });
      if (url.pathname === '/channel_points/custom_rewards/redemptions' && req.method === 'PATCH') return json({ data: [{ status: body?.status }] });
      if (url.pathname !== '/channel_points/custom_rewards') return json({ message: 'not found' }, 404);
      const id = url.searchParams.get('id');
      const found = rewards.find((r) => r.id === id);
      if (req.method === 'GET') {
        let list = rewards;
        if (url.searchParams.get('only_manageable_rewards') === 'true') list = list.filter((r) => r.mine);
        if (id) list = list.filter((r) => r.id === id);
        return json({ data: list.map(out) });
      }
      if (req.method === 'POST') {
        if (rewards.some((r) => r.title === body.title)) return json({ message: 'CREATE_CUSTOM_REWARD_DUPLICATE_REWARD' }, 400);
        const r: StubReward = { id: `aaaa-${nextId++}`, title: body.title, cost: body.cost, prompt: body.prompt ?? '', is_user_input_required: !!body.is_user_input_required, is_enabled: body.is_enabled ?? true, mine: true };
        rewards.push(r);
        return json({ data: [out(r)] });
      }
      if (!found) return json({ message: 'not found' }, 404);
      if (!found.mine) return json({ message: 'The ID in header Client-Id must match the client ID used to create the custom reward.' }, 403);
      if (req.method === 'PATCH') { Object.assign(found, body); return json({ data: [out(found)] }); }
      if (req.method === 'DELETE') { rewards = rewards.filter((r) => r !== found); res.writeHead(204); return res.end(); }
      return json({ message: 'method' }, 405);
    });
  });
  return new Promise((resolve) => stub.listen(0, '127.0.0.1', () => resolve((stub.address() as { port: number }).port)));
}

describe('Twitch rewards from the app', () => {
  let app: Express;
  let token: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const list = async () => (await request(app).get('/api/channel-rewards').set(auth()).expect(200)).body as Array<Record<string, unknown>>;

  beforeAll(async () => {
    process.env.NST_HELIX_URL = `http://127.0.0.1:${await startStub()}`;
  });
  afterAll(() => {
    delete process.env.NST_HELIX_URL;
    stub.close();
  });

  beforeEach(async () => {
    initDatabase(':memory:');
    token = generateApiToken();
    app = createApp();
    calls = [];
    rewards = [{ id: 'dddd-1', title: 'Hydrate', cost: 100, prompt: '', is_user_input_required: false, is_enabled: true, mine: false }];
    await request(app).post('/api/settings/twitch').set(auth()).send({ channel: 'kanal', username: 'kanal', oauth_token: 'oauth:tok' }).expect(200);
  });

  it('lists every reward of the channel and marks which ones the app may edit', async () => {
    await request(app).post('/api/channel-rewards').set(auth()).send({ title: 'Licht aus', cost: 300, action: 'alert' }).expect(201);
    const all = await list();
    expect(all.map((r) => [r.title, r.manageable, r.action])).toEqual([['Hydrate', false, null], ['Licht aus', true, 'alert']]);
    // and says what a dashboard reward does by its name — nothing beyond the alert here
    expect(all[0].by_name).toBeNull();
  });

  it('creates a reward in Twitch with title, cost, text and its action', async () => {
    const made = (await request(app).post('/api/channel-rewards').set(auth())
      .send({ title: 'Vorschlag', cost: 500, prompt: 'Was soll passieren?', input_required: true, action: 'feature_request' }).expect(201)).body;
    expect(made).toMatchObject({ title: 'Vorschlag', cost: 500, prompt: 'Was soll passieren?', input_required: true, manageable: true, action: 'feature_request' });
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ title: 'Vorschlag', cost: 500, prompt: 'Was soll passieren?', is_user_input_required: true });
  });

  it('edits and deletes a reward it made, also when only the action changes', async () => {
    const made = (await request(app).post('/api/channel-rewards').set(auth()).send({ title: 'Licht aus', cost: 300, action: 'alert' }).expect(201)).body;
    expect((await request(app).patch(`/api/channel-rewards/${made.id}`).set(auth()).send({ cost: 250, enabled: false }).expect(200)).body).toMatchObject({ cost: 250, enabled: false });
    expect((await request(app).patch(`/api/channel-rewards/${made.id}`).set(auth()).send({ action: 'roulette' }).expect(200)).body).toMatchObject({ action: 'roulette' });
    await request(app).delete(`/api/channel-rewards/${made.id}`).set(auth()).expect(200);
    expect((await list()).map((r) => r.title)).toEqual(['Hydrate']);
  });

  it('refuses to edit or delete a reward made in the dashboard, and says why', async () => {
    const edit = await request(app).patch('/api/channel-rewards/dddd-1').set(auth()).send({ cost: 1 }).expect(403);
    expect(edit.body.error).toMatch(/in Twitch angelegt/);
    await request(app).patch('/api/channel-rewards/dddd-1').set(auth()).send({ action: 'alert' }).expect(403);
    await request(app).delete('/api/channel-rewards/dddd-1').set(auth()).expect(403);
    expect(rewards).toHaveLength(1);
  });

  it('passes on what Twitch refuses, and checks the fields first', async () => {
    expect((await request(app).post('/api/channel-rewards').set(auth()).send({ title: 'Hydrate', cost: 10, action: 'alert' }).expect(400)).body.error).toMatch(/Twitch sagt/);
    await request(app).post('/api/channel-rewards').set(auth()).send({ title: '', cost: 10, action: 'alert' }).expect(400);
    await request(app).post('/api/channel-rewards').set(auth()).send({ title: 'X', cost: 0, action: 'alert' }).expect(400);
    await request(app).post('/api/channel-rewards').set(auth()).send({ title: 'X', cost: 10, action: 'format_disk' }).expect(400);
    // A scene change names its scene; how long it stays is 0 to 600 s.
    await request(app).post('/api/channel-rewards').set(auth()).send({ title: 'X', cost: 10, action: 'scene' }).expect(400);
    await request(app).post('/api/channel-rewards').set(auth()).send({ title: 'X', cost: 10, action: 'scene', scene_name: 'Wald', scene_seconds: 9999 }).expect(400);
    expect(calls.some((c) => c.method === 'POST' && (c.body as { title: string }).title === 'X')).toBe(false);
  });

  it('says so when Twitch is not connected', async () => {
    initDatabase(':memory:');
    app = createApp();
    token = generateApiToken();
    expect((await request(app).get('/api/channel-rewards').set(auth()).expect(503)).body.error).toMatch(/nicht verbunden/);
  });

  describe('a redemption', () => {
    const redeem = (reward: { id: string; title: string }) =>
      handleRedemption({ id: 'red-1', user_name: 'Mila', user_login: 'mila', reward, user_input: '' });
    const queue = async () => (await request(app).get('/api/rewards').set(auth()).expect(200)).body as Array<{ reward_type: string }>;

    it('runs the action its id is bound to, whatever its name', async () => {
      const made = (await request(app).post('/api/channel-rewards').set(auth()).send({ title: 'Wie heißt das Ding', cost: 50, action: 'change_music' }).expect(201)).body;
      await redeem({ id: made.id, title: made.title });
      expect((await queue())[0].reward_type).toBe('change_music');
    });

    it('gives the points back when the action does not happen', async () => {
      // The wheel has no open topic.
      const made = (await request(app).post('/api/channel-rewards').set(auth()).send({ title: 'Drehen', cost: 50, action: 'roulette' }).expect(201)).body;
      await redeem({ id: made.id, title: made.title });
      expect(calls.find((c) => c.path === '/channel_points/custom_rewards/redemptions')?.body).toEqual({ status: 'CANCELED' });
    });

    it('shows what a dashboard reward does by its name', async () => {
      rewards.push({ id: 'dddd-3', title: 'Bug-Roulette drehen', cost: 2000, prompt: '', is_user_input_required: false, is_enabled: true, mine: false });
      expect((await list()).find((r) => r.id === 'dddd-3')?.by_name).toBe('roulette');
    });

    it('keeps telling a dashboard reward apart by its name, as before', async () => {
      await redeem({ id: 'dddd-2', title: 'Feature wünschen' });
      expect((await queue())[0].reward_type).toBe('feature_request');
      expect(calls.some((c) => c.path === '/channel_points/custom_rewards/redemptions')).toBe(false);
    });
  });
});

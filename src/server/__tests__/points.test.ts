import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';
import { onBits, onChatMessage, onFollow, onGift, onRaid, onSub, setLive, watchTick, type PagedHelix } from '../points/earn';
import { privacySentence } from '../privacy-text';
import { clearRedeemCooldowns, parseRedeem } from '../points/redeem';

/**
 * Eigene Punkte (spec 2026-10-08): the tool's own currency next to Twitch
 * channel points. Viewers earn only while the stream is live; the app shows,
 * gives and takes. The sources are called as the bot calls them; what they
 * did is read back over HTTP.
 */
describe('own points', () => {
  let app: Express;
  let token: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const viewers = async (q = '') => (await request(app).get(`/api/points/viewers${q ? `?q=${q}` : ''}`).set(auth()).expect(200)).body as Array<{
    user_name: string; display_name: string; balance: number; total: number; stream_total: number; rank: number;
  }>;
  const of = async (login: string) => (await viewers()).find((v) => v.user_name === login);

  beforeEach(async () => {
    initDatabase(':memory:');
    token = generateApiToken();
    app = createApp();
    setLive(false);
    // The channel and its bot, as a Twitch login leaves them.
    await request(app).post('/api/settings/twitch').set(auth())
      .send({ channel: 'kanal', username: 'kanalbot', oauth_token: 'oauth:x' }).expect(200);
  });

  describe('the settings', () => {
    it('start with the numbers of the spec', async () => {
      const res = await request(app).get('/api/points/config').set(auth()).expect(200);
      expect(res.body).toMatchObject({ currency: 'Punkte', watch_points: 5, watch_minutes: 10, chat_points: 1, follow_points: 50, sub_points: 200, raid_points: 100, bits_per_point: 10 });
      expect(res.body.bots).toContain('nightbot');
    });

    it('keep what was saved and leave the rest', async () => {
      await request(app).put('/api/points/config').set(auth()).send({ currency: 'Funken', follow_points: 0, bots: ['@WizeBot', 'wizebot'] }).expect(200);
      const res = await request(app).get('/api/points/config').set(auth()).expect(200);
      expect(res.body).toMatchObject({ currency: 'Funken', follow_points: 0, sub_points: 200, bots: ['wizebot'] });
    });

    it('refuse a negative or broken number', async () => {
      await request(app).put('/api/points/config').set(auth()).send({ chat_points: -1 }).expect(400);
      await request(app).put('/api/points/config').set(auth()).send({ raid_points: 2.5 }).expect(400);
      await request(app).put('/api/points/config').set(auth()).send({ currency: '' }).expect(400);
      await request(app).put('/api/points/config').set(auth()).send({ watch_minutes: 0 }).expect(400);
    });
  });

  describe('earning', () => {
    it('gives nothing while the stream is offline', async () => {
      onFollow('mila', 'Mila');
      onChatMessage('mila', 'Mila');
      expect(await viewers()).toEqual([]);
    });

    it('credits follow, sub, raid and bits while live', async () => {
      setLive(true, '2026-10-08T18:00:00Z');
      onFollow('mila', 'Mila');
      onSub('mila', 'Mila');
      onRaid('saldor');
      onBits('mila', 129, 'Mila');
      expect(await of('mila')).toMatchObject({ display_name: 'Mila', balance: 262, total: 262, stream_total: 262, rank: 1 });
      expect(await of('saldor')).toMatchObject({ total: 100, rank: 2 });
    });

    it('gives gifted subs to the one who gifts, per sub', async () => {
      setLive(true, '2026-10-08T18:00:00Z');
      onGift('mila', 5, 'Mila');
      expect(await of('mila')).toMatchObject({ total: 1000 });
    });

    it('credits a chat message at most once a minute', async () => {
      setLive(true, '2026-10-08T18:00:00Z');
      expect(onChatMessage('mila', 'Mila', 0)).toBe(true);
      expect(onChatMessage('mila', 'Mila', 30_000)).toBe(false);
      expect(onChatMessage('mila', 'Mila', 60_000)).toBe(true);
      expect(await of('mila')).toMatchObject({ total: 2 });
    });

    it('never credits the channel, its bot or a listed bot', async () => {
      setLive(true, '2026-10-08T18:00:00Z');
      onFollow('kanal');
      onFollow('KanalBot');
      onFollow('nightbot');
      onGift('ananonymousgifter', 3);
      expect(await viewers()).toEqual([]);
    });

    it('skips a source set to 0', async () => {
      await request(app).put('/api/points/config').set(auth()).send({ follow_points: 0, bits_per_point: 0 }).expect(200);
      setLive(true, '2026-10-08T18:00:00Z');
      onFollow('mila');
      onBits('mila', 500);
      expect(await viewers()).toEqual([]);
    });

    it('starts the Beitrag of this stream at zero for a new stream, not for the same one again', async () => {
      setLive(true, '2026-10-08T18:00:00Z');
      onFollow('mila', 'Mila');
      setLive(false);
      setLive(true, '2026-10-08T18:00:00Z'); // the tool restarted mid-stream
      setLive(true, '2026-10-08T18:00:00.482Z'); // EventSub writes the same start with fractions
      expect(await of('mila')).toMatchObject({ stream_total: 50 });
      setLive(false);
      setLive(true, '2026-10-09T18:00:00Z');
      expect(await of('mila')).toMatchObject({ total: 50, balance: 50, stream_total: 0 });
    });
  });

  describe('the watch tick', () => {
    const twitch = (opts: { live: boolean; pages: Array<Array<{ user_login: string; user_name: string }>>; refuse?: boolean }): PagedHelix =>
      async (path) => {
        if (path === 'users') return { data: [{ id: '42' }] };
        if (path.startsWith('streams?user_id=42')) return { data: opts.live ? [{ started_at: '2026-10-08T18:00:00Z' }] : [] };
        if (path.startsWith('chat/chatters?broadcaster_id=42&moderator_id=42')) {
          if (opts.refuse) return null;
          const page = Number(/after=(\d+)/.exec(path)?.[1] ?? 0);
          return { data: opts.pages[page] ?? [], pagination: page + 1 < opts.pages.length ? { cursor: String(page + 1) } : {} };
        }
        return null;
      };

    it('credits everyone in chat on every page, lurkers included, bots not', async () => {
      const credited = await watchTick(twitch({
        live: true,
        pages: [[{ user_login: 'mila', user_name: 'Mila' }, { user_login: 'kanalbot', user_name: 'KanalBot' }], [{ user_login: 'saldor', user_name: 'Saldor' }]],
      }));
      expect(credited).toBe(2);
      expect(await of('mila')).toMatchObject({ total: 5 });
      expect(await of('saldor')).toMatchObject({ total: 5 });
      expect(await of('kanalbot')).toBeUndefined();
    });

    it('credits nobody when Twitch says the stream is offline', async () => {
      setLive(true, '2026-10-08T18:00:00Z');
      expect(await watchTick(twitch({ live: false, pages: [[{ user_login: 'mila', user_name: 'Mila' }]] }))).toBe(0);
      // and the missed offline event is caught up on
      onFollow('mila');
      expect(await viewers()).toEqual([]);
    });

    it('credits nobody when Twitch refuses the list', async () => {
      expect(await watchTick(twitch({ live: true, pages: [], refuse: true }))).toBe(0);
    });
  });

  describe('giving and taking', () => {
    beforeEach(() => {
      setLive(true, '2026-10-08T18:00:00Z');
      onFollow('mila', 'Mila');
    });

    it('gives, also to someone who had nothing yet, and outside a stream', async () => {
      setLive(false);
      const res = await request(app).post('/api/points/viewers/saldor/adjust').set(auth()).send({ amount: 30 }).expect(200);
      expect(res.body).toMatchObject({ user_name: 'saldor', balance: 30, total: 30 });
    });

    it('takes from Guthaben and Beitrag, never below zero', async () => {
      const res = await request(app).post('/api/points/viewers/mila/adjust').set(auth()).send({ amount: -80 }).expect(200);
      expect(res.body).toMatchObject({ balance: 0, total: 0, stream_total: 0 });
    });

    it('refuses nonsense', async () => {
      await request(app).post('/api/points/viewers/mila/adjust').set(auth()).send({ amount: 0 }).expect(400);
      await request(app).post('/api/points/viewers/mila/adjust').set(auth()).send({ amount: '5' }).expect(400);
      await request(app).post('/api/points/viewers/not%20a%20login/adjust').set(auth()).send({ amount: 5 }).expect(400);
      await request(app).post('/api/points/viewers/niemand/adjust').set(auth()).send({ amount: -5 }).expect(404);
    });

    it('finds a viewer by name', async () => {
      onFollow('saldor', 'Saldor');
      expect((await viewers('mil')).map((v) => v.user_name)).toEqual(['mila']);
      expect(await viewers('%')).toEqual([]);
    });
  });

  describe('privacy', () => {
    it('forgets a viewer with their points', async () => {
      setLive(true, '2026-10-08T18:00:00Z');
      onFollow('mila', 'Mila');
      const res = await request(app).post('/api/reward-stats/forget').set(auth()).send({ user_name: 'Mila' }).expect(200);
      expect(res.body.removed.points).toBe(1);
      expect(await viewers()).toEqual([]);
    });

    it('names the points in !datenschutz and stays under 400 characters', () => {
      expect(privacySentence()).toContain('deine Punkte');
      expect(privacySentence().length).toBeLessThan(400);
    });

    it('leaves the points out of !datenschutz when the feature is off', async () => {
      await request(app).post('/api/setup/features').set(auth()).send({ features: ['rad'] }).expect(200);
      expect(privacySentence()).not.toContain('Punkte');
    });
  });
  describe('Punkte-Belohnungen', () => {
    const create = (body: Record<string, unknown>) => request(app).post('/api/points/rewards').set(auth()).send(body);

    it('are created, listed cheapest first, edited and deleted', async () => {
      const wald = (await create({ name: 'Licht aus', cost: 300, action: 'alert' }).expect(201)).body;
      await create({ name: 'Vorschlag', cost: 100, action: 'feature_request', needs_input: true, cooldown_seconds: 60 }).expect(201);
      const list = (await request(app).get('/api/points/rewards').set(auth()).expect(200)).body;
      expect(list.map((r: { name: string }) => r.name)).toEqual(['Vorschlag', 'Licht aus']);
      expect(list[0]).toMatchObject({ needs_input: true, cooldown_seconds: 60, enabled: true });
      const edited = (await request(app).patch(`/api/points/rewards/${wald.id}`).set(auth()).send({ cost: 250, enabled: false }).expect(200)).body;
      expect(edited).toMatchObject({ name: 'Licht aus', cost: 250, enabled: false });
      await request(app).delete(`/api/points/rewards/${wald.id}`).set(auth()).expect(200);
      await request(app).delete(`/api/points/rewards/${wald.id}`).set(auth()).expect(404);
    });

    it('refuse a second reward of the same name, in any case', async () => {
      await create({ name: 'Glücksrad', cost: 100, action: 'roulette' }).expect(201);
      await create({ name: 'glücksrad', cost: 50, action: 'alert' }).expect(400);
    });

    it('refuse a bad name, cost or action', async () => {
      await create({ name: '', cost: 10, action: 'alert' }).expect(400);
      await create({ name: '!rad', cost: 10, action: 'alert' }).expect(400);
      await create({ name: 'Rad', cost: 0, action: 'alert' }).expect(400);
      await create({ name: 'Rad', cost: 10, action: 'delete_everything' }).expect(400);
    });

    it('switch only to a mapped scene, never to any scene', async () => {
      await create({ name: 'Desktop', cost: 10, action: 'scene', scene_name: 'Desktop' }).expect(400);
      await request(app).post('/api/obs/mappings').set(auth()).send({ mappings: [{ reward_title: 'Wald', scene_name: 'Wald' }] }).expect(200);
      await create({ name: 'Wald', cost: 10, action: 'scene', scene_name: 'Wald' }).expect(201);
    });
  });

  describe('redeeming', () => {
    const redeemFor = (login: string, body: Record<string, unknown>) => request(app).post(`/api/points/viewers/${login}/redeem`).set(auth()).send(body);

    beforeEach(async () => {
      clearRedeemCooldowns();
      setLive(true, '2026-10-08T18:00:00Z');
      onFollow('mila', 'Mila'); // 50
      await request(app).post('/api/points/rewards').set(auth()).send({ name: 'Licht aus', cost: 30, action: 'alert', cooldown_seconds: 60 }).expect(201);
      await request(app).post('/api/points/rewards').set(auth()).send({ name: 'Vorschlag', cost: 10, action: 'feature_request', needs_input: true }).expect(201);
    });

    it('takes the cost from the Guthaben only, the Beitrag stays', async () => {
      const res = await redeemFor('mila', { reward: 'licht aus' }).expect(200);
      expect(res.body.standing).toMatchObject({ balance: 20, total: 50 });
      expect(res.body.message).toContain('„Licht aus“');
      // and it stands in the queue like a Twitch redemption
      const queue = (await request(app).get('/api/rewards').set(auth()).expect(200)).body as Array<{ user_name: string; data: string }>;
      expect(JSON.parse(queue[0].data)).toMatchObject({ reward_title: 'Licht aus', source: 'points', cost: 30 });
    });

    it('takes nothing when the Guthaben is too small', async () => {
      await redeemFor('mila', { reward: 'Licht aus' }).expect(200);
      const res = await redeemFor('mila', { reward: 'Vorschlag', input: 'Ein Leuchtturm' }).expect(200);
      expect(res.body.standing.balance).toBe(10);
      clearRedeemCooldowns();
      const refused = await redeemFor('mila', { reward: 'Licht aus' }).expect(409);
      expect(refused.body).toMatchObject({ error: 'balance' });
      expect(refused.body.message).toContain('kostet 30 Punkte, du hast 10');
    });

    it('holds a cooldown per viewer', async () => {
      await redeemFor('mila', { reward: 'Licht aus' }).expect(200);
      expect((await redeemFor('mila', { reward: 'Licht aus' }).expect(429)).body.error).toBe('cooldown');
      expect((await of('mila'))?.balance).toBe(20);
    });

    it('asks for the text a reward needs', async () => {
      expect((await redeemFor('mila', { reward: 'Vorschlag' }).expect(400)).body.error).toBe('input');
    });

    it('refuses a reward that is off or unknown', async () => {
      const id = (await request(app).get('/api/points/rewards').set(auth())).body.find((r: { name: string }) => r.name === 'Licht aus').id;
      await request(app).patch(`/api/points/rewards/${id}`).set(auth()).send({ enabled: false }).expect(200);
      expect((await redeemFor('mila', { reward: 'Licht aus' }).expect(409)).body.error).toBe('off');
      expect((await redeemFor('mila', { reward: 'Drache' }).expect(404)).body.error).toBe('unknown');
      expect((await of('mila'))?.balance).toBe(50);
    });

    it('gives the points back when the action does not happen', async () => {
      // No open topic for the wheel, and OBS is not connected for the scene.
      await request(app).post('/api/points/rewards').set(auth()).send({ name: 'Rad', cost: 20, action: 'roulette' }).expect(201);
      await request(app).post('/api/obs/mappings').set(auth()).send({ mappings: [{ reward_title: 'Wald', scene_name: 'Wald' }] }).expect(200);
      await request(app).post('/api/points/rewards').set(auth()).send({ name: 'Wald', cost: 20, action: 'scene', scene_name: 'Wald' }).expect(201);
      const rad = await redeemFor('mila', { reward: 'Rad' }).expect(502);
      expect(rad.body.message).toContain('sind zurück');
      await redeemFor('mila', { reward: 'Wald' }).expect(502);
      expect((await of('mila'))?.balance).toBe(50);
    });

    it('splits what follows !einlösen into the name, spaces and all, and the text', async () => {
      await request(app).post('/api/points/rewards').set(auth()).send({ name: 'Licht', cost: 5, action: 'alert' }).expect(201);
      expect(parseRedeem('licht aus')).toEqual({ name: 'licht aus', input: '' });
      expect(parseRedeem('Vorschlag Ein Leuchtturm am Hafen')).toEqual({ name: 'Vorschlag', input: 'Ein Leuchtturm am Hafen' });
      expect(parseRedeem('Licht an')).toEqual({ name: 'Licht', input: 'an' });
      expect(parseRedeem('Drache spucken')).toEqual({ name: 'Drache', input: 'spucken' });
    });

    it('is not there while the feature is off', async () => {
      await request(app).post('/api/setup/features').set(auth()).send({ features: ['rad'] }).expect(200);
      expect((await redeemFor('mila', { reward: 'Licht aus' }).expect(409)).body.error).toBe('feature_off');
    });
  });

  describe('in chat', () => {
    const say = async (message: string, user = 'mila') =>
      ((await request(app).post('/api/chat/try').set(auth()).send({ message, user }).expect(200)).body.replies ?? []) as string[];

    beforeEach(async () => {
      setLive(true, '2026-10-08T18:00:00Z');
      onFollow('mila', 'Mila');
      onRaid('saldor', 'Saldor');
    });

    it('!punkte tells your Guthaben, Beitrag and place', async () => {
      expect(await say('!punkte')).toEqual(['@Mila du hast 50 Punkte · Beitrag 50 · Platz 2']);
    });

    it('!punkte <Name> tells someone else\'s, and only a login is echoed', async () => {
      expect(await say('!punkte @Saldor')).toEqual(['Saldor hat 100 Punkte · Beitrag 100 · Platz 1']);
      expect(await say('!punkte <script>')).toEqual(['@Mila du hast 50 Punkte · Beitrag 50 · Platz 2']);
    });

    it('!punkte uses the currency\'s name', async () => {
      await request(app).put('/api/points/config').set(auth()).send({ currency: 'Funken' }).expect(200);
      expect(await say('!punkte', 'niemand')).toEqual(['@niemand du hast noch keine Funken — Zuschauen und Chatten im Stream bringt welche.']);
    });

    it('!belohnungen lists what is on, cheapest first', async () => {
      expect(await say('!belohnungen')).toEqual(['Noch keine Belohnungen für Punkte.']);
      await request(app).post('/api/points/rewards').set(auth()).send({ name: 'Licht aus', cost: 300, action: 'alert' }).expect(201);
      await request(app).post('/api/points/rewards').set(auth()).send({ name: 'Vorschlag', cost: 100, action: 'feature_request' }).expect(201);
      await request(app).post('/api/points/rewards').set(auth()).send({ name: 'Geheim', cost: 5, action: 'alert', enabled: false }).expect(201);
      expect(await say('!belohnungen')).toEqual(['Belohnungen (!einlösen <Name>): Vorschlag 100 · Licht aus 300 Punkte']);
    });
  });
  describe('the Beitrag lists', () => {
    const top = async (type: string) => (await request(app).get(`/public/reward-stats/top?type=${type}`).expect(200)).body;

    it('rank by Beitrag of all time and of this stream', async () => {
      setLive(true, '2026-10-08T18:00:00Z');
      onRaid('saldor', 'Saldor');
      setLive(false);
      setLive(true, '2026-10-09T18:00:00Z');
      onFollow('mila', 'Mila');
      expect(await top('beitrag')).toMatchObject({ title: 'Beitrag', leaderboard: [{ rank: 1, userName: 'Saldor', count: 100 }, { rank: 2, userName: 'Mila', count: 50 }] });
      expect(await top('beitrag-stream')).toMatchObject({ title: 'Beitrag heute', leaderboard: [{ rank: 1, userName: 'Mila', count: 50 }] });
    });

    it('do not move when points are spent', async () => {
      setLive(true, '2026-10-08T18:00:00Z');
      onFollow('mila', 'Mila');
      await request(app).post('/api/points/rewards').set(auth()).send({ name: 'Licht aus', cost: 30, action: 'alert' }).expect(201);
      await request(app).post('/api/points/viewers/mila/redeem').set(auth()).send({ reward: 'Licht aus' }).expect(200);
      expect((await top('beitrag')).leaderboard[0]).toMatchObject({ userName: 'Mila', count: 50 });
    });

    it('keep their names — no Bestenliste may take them', async () => {
      await request(app).post('/api/leaderboards').set(auth()).send({ title: 'Beitrag', reward: { id: 'r1', title: 'Flex' } }).expect(400);
      await request(app).post('/api/leaderboards').set(auth()).send({ title: 'Beitrag Stream', reward: { id: 'r1', title: 'Flex' } }).expect(400);
    });
  });
});

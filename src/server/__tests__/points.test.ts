import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';
import { onBits, onChatMessage, onFollow, onGift, onRaid, onSub, setLive, watchTick, type PagedHelix } from '../points/earn';
import { privacySentence } from '../privacy-text';

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
});

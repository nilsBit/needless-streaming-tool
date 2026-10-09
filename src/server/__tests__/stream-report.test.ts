import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';
import { noteActivity, noteChat, noteFollow, noteMoment, noteReward, noteViewers, resetStreamLog, streamEnded, streamStarted } from '../stream-report/log';

/**
 * Nach dem Stream (2026-10-09): what the tool writes down while live, and the
 * report it makes of one stream. The sources are called as the bot, EventSub
 * and the poll call them; the report is read back over HTTP.
 */
describe('stream report', () => {
  let app: Express;
  let token: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const MIN = 60_000;
  const first = Date.parse('2026-10-01T18:00:00Z');
  const second = Date.parse('2026-10-03T18:00:00Z');

  const report = async (id: number) => (await request(app).get(`/api/streams/${id}`).set(auth()).expect(200)).body;
  const list = async () => (await request(app).get('/api/streams').set(auth()).expect(200)).body as Array<{ id: number; started_at: string; minutes: number; live: boolean }>;

  beforeAll(async () => {
    initDatabase(':memory:');
    token = generateApiToken();
    app = createApp();
    resetStreamLog();
    await request(app).post('/api/settings/twitch').set(auth()).send({ channel: 'kanal', username: 'kanalbot', oauth_token: 'oauth:x' }).expect(200);
    await request(app).post('/api/text-commands').set(auth()).send({ trigger: '!lore', response: 'Die Welt heißt Varn.' }).expect(201);

    // Nothing is written down before the stream is live.
    noteChat('mila', 'Mila', 'hallo', first - MIN);

    // Stream 1: an hour on "cam", a poll at 0:20, the wheel at 0:30.
    streamStarted('2026-10-01T18:00:00.123Z', first);
    noteActivity('scene', 'cam', null, first);
    for (let m = 0; m < 20; m++) {
      noteChat('mila', 'Mila', 'schreib', first + m * MIN + 1000);
      noteChat('ole', 'Ole', m < 3 ? '!lore' : 'gut', first + m * MIN + 2000);
    }
    noteChat('kanalbot', 'KanalBot', 'Ich bin der Bot', first + 5 * MIN);
    noteChat('kanal', 'Kanal', 'Ich streame', first + 5 * MIN);
    noteChat('ole', 'Ole', '!nix', first + 6 * MIN);
    noteActivity('poll', 'Wer stirbt?', null, first + 20 * MIN);
    for (const who of ['mila', 'ole', 'tara', 'mila', 'ole', 'tara', 'mila', 'ole', 'tara', 'mila']) noteChat(who, who[0].toUpperCase() + who.slice(1), '1', first + 20 * MIN + 5000);
    noteFollow('neu1', 'Neu1', first + 20 * MIN + 30_000);
    noteActivity('poll', null, 3, first + 21 * MIN);
    noteActivity('wheel', 'Thema A', null, first + 30 * MIN);
    for (let m = 30; m < 40; m++) for (let k = 0; k < 5; k++) noteChat('mila', 'Mila', 'rad!', first + m * MIN + k * 1000);
    noteMoment('Akira', first + 35 * MIN);
    noteReward('Hydrate!', 'ole', first + 36 * MIN);
    noteActivity('scene', 'Szene 2', null, first + 45 * MIN);
    noteActivity('scene', 'cam', null, first + 46 * MIN);
    streamEnded(first + 60 * MIN);

    // Stream 2: Mila is back, Neu2 is new; Twitch counted 10 and 20 viewers.
    streamStarted('2026-10-03T18:00:00Z', second);
    noteViewers(10, second + 5 * MIN);
    noteViewers(20, second + 10 * MIN);
    noteChat('mila', 'Mila', 'wieder da', second + MIN);
    noteChat('neu2', 'Neu2', 'hi', second + 2 * MIN);
    streamEnded(second + 30 * MIN);
  });

  it('lists the streams it saw live, newest first', async () => {
    const streams = await list();
    expect(streams.map((s) => s.started_at)).toEqual(['2026-10-03T18:00:00.000Z', '2026-10-01T18:00:00.000Z']);
    expect(streams.map((s) => s.minutes)).toEqual([30, 60]);
    expect(streams.every((s) => !s.live)).toBe(true);
  });

  it('splits a stream by what ran: scene, poll, wheel — a minute in another scene folds away', async () => {
    const [, one] = await list();
    const r = await report(one.id);
    expect(r.parts.map((p: { label: string }) => p.label)).toEqual(['Szene „cam“', 'Abstimmung „Wer stirbt?“', 'Szene „cam“', 'Glücksrad', 'Szene „cam“']);
    const poll = r.parts[1];
    expect(poll.note).toBe('3 von 3 Chattern haben abgestimmt.');
    expect(poll.follows).toBe(1);
    const wheel = r.parts[3];
    expect(wheel.note).toContain('Einmal gedreht.');
    expect(wheel.note).toContain('Moment bei 0:35 („Akira“)');
    expect(r.parts[0].note).toBe('Meistgenutzt hier: !lore (3×).');
  });

  it('counts chat, follows and redemptions — never the streamer or the bot', async () => {
    const [, one] = await list();
    const r = await report(one.id);
    const kpi = (key: string) => r.kpis.find((k: { key: string }) => k.key === key);
    expect(kpi('chatters').value).toBe(3);
    expect(kpi('messages').value).toBe(40 + 1 + 10 + 50);
    expect(kpi('follows').value).toBe(1);
    expect(kpi('rewards').value).toBe(1);
    expect(kpi('viewers').value).toBeNull();
    expect(kpi('follows').mean).toBeNull();
    expect(r.used).toEqual(expect.arrayContaining([
      { name: '!lore', count: 3, people: 1, kind: 'command' },
      { name: 'Hydrate!', count: 1, people: 1, kind: 'reward' },
    ]));
    expect(r.used.some((u: { name: string }) => u.name === '!nix')).toBe(false);
  });

  it('names what stood out, by numbers only', async () => {
    const [, one] = await list();
    const r = await report(one.id);
    expect(r.busiest.label).toBe('Abstimmung „Wer stirbt?“');
    expect(r.insights.map((i: { tone: string }) => i.tone)).toEqual(['busy', 'join', 'follow', 'quiet']);
    expect(r.insights[1].big).toBe('3 von 3');
    expect(r.insights[2].big).toBe('1 von 1');
  });

  it('compares with the streams before and knows who is new', async () => {
    const [two] = await list();
    const r = await report(two.id);
    const kpi = (key: string) => r.kpis.find((k: { key: string }) => k.key === key);
    expect(kpi('viewers')).toMatchObject({ value: 15, mean: null });
    expect(kpi('peak').value).toBe(20);
    expect(kpi('follows')).toMatchObject({ value: 0, mean: 1 });
    expect(r.people).toMatchObject({ total: 2, known: 1, fresh: ['Neu2'], fresh_more: 0, missing: null });
  });

  it('forgets a viewer in every stream', async () => {
    await request(app).post('/api/reward-stats/forget').set(auth()).send({ user_name: 'Mila' }).expect(200);
    const [two, one] = await list();
    expect((await report(two.id)).people.total).toBe(1);
    expect((await report(one.id)).kpis.find((k: { key: string }) => k.key === 'chatters').value).toBe(2);
  });

  it('refuses an id that is no stream', async () => {
    await request(app).get('/api/streams/abc').set(auth()).expect(400);
    await request(app).get('/api/streams/999').set(auth()).expect(404);
    await request(app).get('/api/streams').expect(401);
  });
});

describe('moments', () => {
  let app: Express;
  let token: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(() => {
    initDatabase(':memory:');
    token = generateApiToken();
    app = createApp();
  });

  it('marks a moment with a note, lists and deletes it', async () => {
    const res = await request(app).post('/api/clips').set(auth()).send({ tag: 'highlight', note: 'Aldric bekommt seinen Beinamen' }).expect(201);
    expect(res.body.note).toBe('Aldric bekommt seinen Beinamen');
    const all = (await request(app).get('/api/clips').set(auth()).expect(200)).body as Array<{ id: number }>;
    expect(all.map((c) => c.id)).toContain(res.body.id);
    await request(app).delete(`/api/clips/${res.body.id}`).set(auth()).expect(204);
    expect((await request(app).get('/api/clips').set(auth()).expect(200)).body).toEqual([]);
  });

  it('still names the tags a Stream Deck key can choose', async () => {
    const tags = (await request(app).get('/api/clip-tags').set(auth()).expect(200)).body as Array<{ tag: string }>;
    expect(tags.map((t) => t.tag)).toEqual(['highlight', 'fail', 'funny', 'tutorial', 'issue']);
    await request(app).post('/api/clip-tags').set(auth()).send({ tag: 'neu' }).expect(404);
  });

  it('refuses a moment without a tag, and the content board is gone', async () => {
    await request(app).post('/api/clips').set(auth()).send({ note: 'x' }).expect(400);
    await request(app).post('/api/clips').set(auth()).send({ tag: 'highlight', note: { evil: true } }).expect(400);
    await request(app).patch('/api/clips/1').set(auth()).send({ status: 'published' }).expect(404);
    await request(app).get('/api/clips/export?session_date=today').set(auth()).expect(404);
  });
});

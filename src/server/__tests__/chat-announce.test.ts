import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { getDb, initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';
import { cancelVote, castVote } from '../bot/voting';

const said = vi.hoisted(() => [] as string[]);
vi.mock('../bot/announce', () => ({
  setChatSender: () => {},
  announce: (message: string) => { said.push(message); },
}));

/**
 * What the streamer starts in the app, chat hears about on its own (29.10.):
 * a vote starting and its result, where the wheel stopped, how the goal for
 * today ended. Before, only `!abstimmung` in chat said anything.
 */
describe('telling chat what happened', () => {
  let app: Express;
  let token: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeEach(() => {
    initDatabase(':memory:');
    token = generateApiToken();
    app = createApp();
    cancelVote();
    said.length = 0;
  });
  afterEach(() => vi.useRealTimers());

  it('announces a vote started in the app, numbered', async () => {
    await request(app).post('/api/voting/start').set(auth()).send({ options: ['Rote Tür', 'Blaue Tür'], duration: 60 }).expect(200);
    expect(said).toEqual(['🗳️ ABSTIMMUNG! Schreibt !vote <Nummer> — 1 rote tür | 2 blaue tür — 60s Zeit!']);
  });

  it('names the winner when the vote is ended', async () => {
    await request(app).post('/api/voting/start').set(auth()).send({ options: ['Rote Tür', 'Blaue Tür'], duration: 60 }).expect(200);
    castVote('anna', '2');
    castVote('ben', '2');
    castVote('cem', '1');
    await request(app).post('/api/voting/end').set(auth()).expect(200);
    expect(said.at(-1)).toBe('🗳️ ERGEBNIS: 1 rote tür 1 | 2 blaue tür 2 — Gewinner: blaue tür 🏆');
  });

  it('names the winner when the time runs out', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await request(app).post('/api/voting/start').set(auth()).send({ options: ['Rote Tür', 'Blaue Tür'], duration: 30 }).expect(200);
    castVote('anna', '1');
    vi.advanceTimersByTime(30_000);
    expect(said.at(-1)).toBe('🗳️ ERGEBNIS: 1 rote tür 1 | 2 blaue tür 0 — Gewinner: rote tür 🏆');
  });

  it('says so on a tie, and on no votes at all', async () => {
    await request(app).post('/api/voting/start').set(auth()).send({ options: ['A', 'B'], duration: 60 }).expect(200);
    castVote('anna', '1');
    castVote('ben', '2');
    await request(app).post('/api/voting/end').set(auth()).expect(200);
    expect(said.at(-1)).toBe('🗳️ ERGEBNIS: 1 a 1 | 2 b 1 — Gleichstand: a, b');

    await request(app).post('/api/voting/start').set(auth()).send({ options: ['A', 'B'], duration: 60 }).expect(200);
    await request(app).post('/api/voting/end').set(auth()).expect(200);
    expect(said.at(-1)).toBe('🗳️ Abstimmung vorbei — keine Stimmen.');
  });

  it('keeps quiet when a vote is called off', async () => {
    await request(app).post('/api/voting/start').set(auth()).send({ options: ['A', 'B'], duration: 60 }).expect(200);
    said.length = 0;
    await request(app).post('/api/voting/cancel').set(auth()).expect(200);
    expect(said).toEqual([]);
  });

  it('names the wheel\'s pick once the wheel stands', async () => {
    getDb().prepare("INSERT INTO issues (title, status) VALUES ('Licht im Keller', 'open')").run();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await request(app).post('/api/actions/roulette').set(auth()).expect(200);
    expect(said).toEqual([]);
    vi.advanceTimersByTime(6000);
    expect(said).toEqual(['🎡 Das Rad hat entschieden: Licht im Keller']);
  });

  it('tells how the goal for today ended', async () => {
    await request(app).patch('/api/stream-state').set(auth()).send({ challenge_title: 'Drei Seiten skizzieren', challenge_status: 'in_progress' }).expect(200);
    getDb().prepare('UPDATE stream_state SET timer_seconds = 2520 WHERE id = 1').run();
    await request(app).patch('/api/stream-state').set(auth()).send({ challenge_status: 'done', timer_running: 0 }).expect(200);
    expect(said).toEqual(['✅ Ziel geschafft: Drei Seiten skizzieren – nach 42 min']);

    await request(app).patch('/api/stream-state').set(auth()).send({ challenge_title: 'Kein Radiergummi', challenge_status: 'in_progress', timer_seconds: 0 }).expect(200);
    await request(app).patch('/api/stream-state').set(auth()).send({ challenge_status: 'failed', timer_running: 0 }).expect(200);
    expect(said.at(-1)).toBe('❌ Ziel nicht geschafft: Kein Radiergummi');
  });

  it('says nothing twice when a finished goal is saved again', async () => {
    await request(app).patch('/api/stream-state').set(auth()).send({ challenge_title: 'Eine Seite', challenge_status: 'in_progress' }).expect(200);
    await request(app).patch('/api/stream-state').set(auth()).send({ challenge_status: 'done' }).expect(200);
    await request(app).patch('/api/stream-state').set(auth()).send({ challenge_status: 'done' }).expect(200);
    expect(said).toEqual(['✅ Ziel geschafft: Eine Seite']);
  });
});

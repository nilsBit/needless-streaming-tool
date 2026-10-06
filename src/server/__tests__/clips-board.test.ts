import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';

// The content board on Clip Moments: four steps, platforms, a date, a hook,
// ideas without a stream, and the archive for what has been out for 30 days.

describe('content board', () => {
  let app: Express;
  let token: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(() => {
    initDatabase(':memory:');
    token = generateApiToken();
    app = createApp();
  });

  it('starts a marked moment in "new" with no platforms', async () => {
    const res = await request(app).post('/api/clips').set(auth()).send({ tag: 'highlight', note: 'Aldric bekommt seinen Beinamen' }).expect(201);
    expect(res.body.status).toBe('new');
    expect(res.body.platforms).toEqual([]);
    expect(res.body.planned_for).toBeNull();
    expect(res.body.archived_at).toBeNull();
  });

  it('moves a moment along the board and keeps what was planned', async () => {
    const created = (await request(app).post('/api/clips').set(auth()).send({ tag: 'funny' }).expect(201)).body;

    const planned = (await request(app).patch(`/api/clips/${created.id}`).set(auth())
      .send({ status: 'planned', platforms: ['tiktok', 'shorts', 'tiktok'], planned_for: '2026-10-10', hook: 'Der Chat rät die Portale' })
      .expect(200)).body;
    expect(planned.status).toBe('planned');
    expect(planned.platforms).toEqual(['tiktok', 'shorts']);
    expect(planned.planned_for).toBe('2026-10-10');
    expect(planned.hook).toBe('Der Chat rät die Portale');

    const onBoard = (await request(app).get('/api/clips?status=planned').set(auth()).expect(200)).body;
    expect(onBoard.map((c: { id: number }) => c.id)).toContain(created.id);

    const published = (await request(app).patch(`/api/clips/${created.id}`).set(auth()).send({ status: 'published' }).expect(200)).body;
    expect(published.published_at).not.toBeNull();
  });

  it('refuses a step or a date it does not know', async () => {
    const created = (await request(app).post('/api/clips').set(auth()).send({ tag: 'highlight' }).expect(201)).body;
    await request(app).patch(`/api/clips/${created.id}`).set(auth()).send({ status: 'done' }).expect(400);
    await request(app).patch(`/api/clips/${created.id}`).set(auth()).send({ planned_for: 'Freitag' }).expect(400);
    await request(app).patch(`/api/clips/${created.id}`).set(auth()).send({ platforms: ['Tik Tok!'] }).expect(400);
  });

  it('takes an idea without a stream: no timecodes, tag "idee"', async () => {
    const res = await request(app).post('/api/clips').set(auth()).send({ idea: true, hook: 'Ein Markt unter der Brücke', note: 'nur nachts offen' }).expect(201);
    expect(res.body.tag).toBe('idee');
    expect(res.body.hook).toBe('Ein Markt unter der Brücke');
    expect(res.body.stream_timecode).toBeNull();
    expect(res.body.recording_timecode).toBeNull();
    expect(res.body.status).toBe('new');
  });

  it('archives what has been published for 30 days, and only that', async () => {
    const old = (await request(app).post('/api/clips').set(auth()).send({ tag: 'highlight' }).expect(201)).body;
    const fresh = (await request(app).post('/api/clips').set(auth()).send({ tag: 'highlight' }).expect(201)).body;
    await request(app).patch(`/api/clips/${old.id}`).set(auth()).send({ status: 'published', published_at: '2026-08-01T20:00:00Z' }).expect(200);
    await request(app).patch(`/api/clips/${fresh.id}`).set(auth()).send({ status: 'published' }).expect(200);

    const run = (await request(app).post('/api/clips/archive-run').set(auth()).expect(200)).body;
    expect(run.archived).toBe(1);

    const board = (await request(app).get('/api/clips').set(auth()).expect(200)).body;
    expect(board.map((c: { id: number }) => c.id)).not.toContain(old.id);
    expect(board.map((c: { id: number }) => c.id)).toContain(fresh.id);

    const archive = (await request(app).get('/api/clips?archived=true').set(auth()).expect(200)).body;
    expect(archive.map((c: { id: number }) => c.id)).toEqual([old.id]);

    // Back on the board by hand: a step before "published" unarchives.
    const back = (await request(app).patch(`/api/clips/${old.id}`).set(auth()).send({ status: 'cut' }).expect(200)).body;
    expect(back.archived_at).toBeNull();
  });

  it('keeps an auto-detected moment by dropping its auto- prefix', async () => {
    const created = (await request(app).post('/api/clips').set(auth()).send({ tag: 'auto-milestone', note: 'Karte der Unterstadt fertig' }).expect(201)).body;
    const kept = (await request(app).patch(`/api/clips/${created.id}`).set(auth()).send({ tag: 'milestone' }).expect(200)).body;
    expect(kept.tag).toBe('milestone');
    expect(kept.status).toBe('new');
  });
});

describe('reward breakdown', () => {
  let app: Express;
  let token: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(() => {
    initDatabase(':memory:');
    token = generateApiToken();
    app = createApp();
  });

  it('lists every viewer with every reward type for the per-viewer ranking', async () => {
    await request(app).post('/api/reward-stats').set(auth()).send({ user_name: 'Kartograph', reward_type: 'roulette', count: 12 }).expect(200);
    await request(app).post('/api/reward-stats').set(auth()).send({ user_name: 'Kartograph', reward_type: 'song', count: 3 }).expect(200);
    await request(app).post('/api/reward-stats').set(auth()).send({ user_name: 'Tintenfass', reward_type: 'song', count: 7 }).expect(200);

    const rows = (await request(app).get('/api/reward-stats/breakdown').set(auth()).expect(200)).body;
    // Names are stored lowercased, the way Twitch logins come in.
    const kartograph = rows.filter((r: { user_name: string }) => r.user_name === 'kartograph');
    expect(kartograph.map((r: { reward_type: string; count: number }) => [r.reward_type, r.count])).toEqual([['roulette', 12], ['song', 3]]);
    expect(rows.find((r: { user_name: string }) => r.user_name === 'tintenfass').count).toBe(7);
  });
});

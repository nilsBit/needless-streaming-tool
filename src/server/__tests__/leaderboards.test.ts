import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';
import { countRedemption, keyFromTitle, standing, standingsText } from '../leaderboards';

/**
 * A Bestenliste hangs on one Twitch reward and ranks who redeemed it most.
 * The streamer names it; the key is derived once and stays, so overlay
 * addresses and counts survive a rename.
 */
describe('Bestenlisten', () => {
  let app: Express;
  let token: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const flex = { title: 'Flex', reward: { id: 'rw-1', title: 'Flex!' } };

  beforeEach(() => {
    initDatabase(':memory:');
    token = generateApiToken();
    app = createApp();
  });

  it('starts empty and lists what the streamer creates', async () => {
    expect((await request(app).get('/api/leaderboards').set(auth()).expect(200)).body).toEqual([]);
    const created = await request(app).post('/api/leaderboards').set(auth()).send(flex).expect(201);
    expect(created.body.leaderboard).toEqual({ key: 'flex', title: 'Flex', reward_id: 'rw-1', reward_title: 'Flex!', viewers: 0 });
    expect((await request(app).get('/api/leaderboards').set(auth()).expect(200)).body).toEqual([created.body.leaderboard]);
  });

  it('derives a plain key from the title', () => {
    expect(keyFromTitle('Flex')).toBe('flex');
    expect(keyFromTitle('Angeben für Könner!')).toBe('angeben-fuer-koenner');
    expect(keyFromTitle('  Große   Pause ')).toBe('grosse-pause');
    expect(keyFromTitle('!!!')).toBe('liste');
  });

  it('refuses a second list on the same reward, and a title whose key is taken', async () => {
    await request(app).post('/api/leaderboards').set(auth()).send(flex).expect(201);
    const sameReward = await request(app).post('/api/leaderboards').set(auth()).send({ title: 'Noch mal', reward: { id: 'rw-1', title: 'Flex!' } }).expect(400);
    expect(sameReward.body.error).toMatch(/reward/);
    const sameKey = await request(app).post('/api/leaderboards').set(auth()).send({ title: 'flex!', reward: { id: 'rw-2', title: 'Anders' } }).expect(400);
    expect(sameKey.body.error).toMatch(/name/);
  });

  it('refuses what is no list', async () => {
    await request(app).post('/api/leaderboards').set(auth()).send({ title: '', reward: { id: 'rw-1', title: 'Flex!' } }).expect(400);
    await request(app).post('/api/leaderboards').set(auth()).send({ title: 'Flex' }).expect(400);
    await request(app).post('/api/leaderboards').set(auth()).send({ title: 'x'.repeat(46), reward: { id: 'rw-1', title: 'Flex!' } }).expect(400);
    await request(app).post('/api/leaderboards').set(auth()).send({ title: 'Flex', reward: { id: '', title: 'Flex!' } }).expect(400);
  });

  it('renames a list without touching its key, and lets the reward change', async () => {
    await request(app).post('/api/leaderboards').set(auth()).send(flex).expect(201);
    const renamed = await request(app).patch('/api/leaderboards/flex').set(auth()).send({ title: 'Angeben' }).expect(200);
    expect(renamed.body.leaderboard).toMatchObject({ key: 'flex', title: 'Angeben', reward_id: 'rw-1' });
    const rechosen = await request(app).patch('/api/leaderboards/flex').set(auth()).send({ reward: { id: 'rw-9', title: 'Neu' } }).expect(200);
    expect(rechosen.body.leaderboard).toMatchObject({ key: 'flex', title: 'Angeben', reward_id: 'rw-9', reward_title: 'Neu' });
    await request(app).patch('/api/leaderboards/nope').set(auth()).send({ title: 'x' }).expect(404);
    await request(app).patch('/api/leaderboards/flex').set(auth()).send({ title: '' }).expect(400);
  });

  it('shows the board of a list and deletes the list with its counts', async () => {
    await request(app).post('/api/leaderboards').set(auth()).send(flex).expect(201);
    await request(app).post('/api/reward-stats').set(auth()).send({ user_name: 'Kartograph', reward_type: 'flex', count: 3 }).expect(200);
    await request(app).post('/api/reward-stats').set(auth()).send({ user_name: 'tintenfass', reward_type: 'flex', count: 5 }).expect(200);

    const board = (await request(app).get('/api/leaderboards/flex/board').set(auth()).expect(200)).body;
    expect(board.map((r: { user_name: string; count: number }) => [r.user_name, r.count])).toEqual([['tintenfass', 5], ['kartograph', 3]]);
    expect((await request(app).get('/api/leaderboards').set(auth()).expect(200)).body[0].viewers).toBe(2);
    await request(app).get('/api/leaderboards/nope/board').set(auth()).expect(404);

    expect((await request(app).delete('/api/leaderboards/flex').set(auth()).expect(200)).body).toEqual({ ok: true, removed: 2 });
    expect((await request(app).get('/api/leaderboards').set(auth()).expect(200)).body).toEqual([]);
    expect((await request(app).get('/api/reward-stats').set(auth()).expect(200)).body).toEqual([]);
    await request(app).delete('/api/leaderboards/flex').set(auth()).expect(404);
  });
});

describe('a redemption on a list', () => {
  let app: Express;
  let token: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeEach(async () => {
    initDatabase(':memory:');
    token = generateApiToken();
    app = createApp();
    await request(app).post('/api/leaderboards').set(auth()).send({ title: 'Flex', reward: { id: 'rw-1', title: 'Flex!' } }).expect(201);
  });

  it('counts one point under the lower-case login and ranks the viewer', () => {
    expect(countRedemption('rw-1', 'kartograph', 'Kartograph')).toMatchObject({ count: 1, rank: 1, leaderboard: { key: 'flex', title: 'Flex' } });
    expect(countRedemption('rw-1', 'Kartograph', 'Kartograph')).toMatchObject({ count: 2, rank: 1 });
    expect(countRedemption('rw-1', 'tintenfass')).toMatchObject({ count: 1, rank: 2 });
    expect(standing('flex', 'KARTOGRAPH')).toEqual({ count: 2, rank: 1 });
    expect(standing('flex', 'niemand')).toEqual({ count: 0, rank: null });
  });

  it('counts nothing for a reward without a list', async () => {
    expect(countRedemption('rw-other', 'kartograph')).toBeNull();
    expect((await request(app).get('/api/leaderboards/flex/board').set(auth()).expect(200)).body).toEqual([]);
  });

  it('answers the overlay with title and top three, and stays calm about a list that is gone', async () => {
    countRedemption('rw-1', 'kartograph');
    const top = (await request(app).get('/public/reward-stats/top?type=flex').expect(200)).body;
    expect(top).toEqual({ type: 'flex', title: 'Flex', leaderboard: [{ rank: 1, userName: 'kartograph', count: 1 }] });
    const gone = (await request(app).get('/public/reward-stats/top?type=nope').expect(200)).body;
    expect(gone).toEqual({ type: 'nope', title: null, leaderboard: [] });
    const unset = (await request(app).get('/public/reward-stats/top').expect(200)).body;
    expect(unset.leaderboard).toEqual([]);
  });
  it('tells a viewer where they stand in every list', async () => {
    await request(app).post('/api/leaderboards').set(auth()).send({ title: 'Angeben', reward: { id: 'rw-2', title: 'Angeben' } }).expect(201);
    expect(standingsText('kartograph')).toBe('@kartograph hat noch nichts eingelöst.');
    countRedemption('rw-1', 'kartograph');
    countRedemption('rw-1', 'kartograph');
    countRedemption('rw-2', 'kartograph');
    countRedemption('rw-2', 'tintenfass');
    countRedemption('rw-2', 'tintenfass');
    expect(standingsText('Kartograph')).toBe('@Kartograph: Flex 2 (Platz 1), Angeben 1 (Platz 2).');
    expect(standingsText('tintenfass')).toBe('@tintenfass: Angeben 2 (Platz 1).');
  });

  it('lets "Im Stream testen" show the list overlay with a sample point in the first list', async () => {
    const sent = (await request(app).post('/api/actions/overlay-test/reward-leaderboard').set(auth()).expect(200)).body.sent;
    const point = sent.find((e: { event: string }) => e.event === 'leaderboard-point');
    expect(point.data).toMatchObject({ key: 'flex', title: 'Flex', user: 'TestUser_A', count: 42, rank: 1 });
    const update = sent.find((e: { event: string }) => e.event === 'reward-leaderboard-update');
    expect(update.data).toMatchObject({ type: 'flex', title: 'Flex' });
  });
});

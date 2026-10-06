import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { getDb, initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';
import { adoptFlexReward, flexReward, flexStanding, isFlexReward, useFlex } from '../flex';
import type { Helix } from '../bot/shoutout';

// The Bestenliste counts flexes: the chosen reward unlocks one, !flex spends it.

describe('flexes', () => {
  let app: Express;
  let token: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(() => {
    initDatabase(':memory:');
    token = generateApiToken();
    app = createApp();
  });

  it('starts with no reward chosen, and lets the streamer pick one by its Twitch id', async () => {
    expect((await request(app).get('/api/reward-stats/flex-settings').set(auth()).expect(200)).body).toEqual({ reward: null });
    expect(isFlexReward('rw-1')).toBe(false);

    await request(app).post('/api/reward-stats/flex-settings').set(auth()).send({ id: 'rw-1', title: 'Flex' }).expect(200);
    expect((await request(app).get('/api/reward-stats/flex-settings').set(auth()).expect(200)).body).toEqual({ reward: { id: 'rw-1', title: 'Flex' } });
    expect(isFlexReward('rw-1')).toBe(true);
    // The name no longer matters — only the id does.
    expect(isFlexReward('rw-2')).toBe(false);

    await request(app).post('/api/reward-stats/flex-settings').set(auth()).send({ id: 'rw-2', title: 'Angeben' }).expect(200);
    expect(isFlexReward('rw-1')).toBe(false);
    expect(isFlexReward('rw-2')).toBe(true);
  });

  it('refuses a reward without id or name', async () => {
    await request(app).post('/api/reward-stats/flex-settings').set(auth()).send({ id: '', title: 'Flex' }).expect(400);
    await request(app).post('/api/reward-stats/flex-settings').set(auth()).send({ id: 'rw-3', title: '' }).expect(400);
    await request(app).post('/api/reward-stats/flex-settings').set(auth()).send({ id: 'rw-3', title: 'x'.repeat(46) }).expect(400);
    expect((await request(app).get('/api/reward-stats/flex-settings').set(auth()).expect(200)).body.reward.id).toBe('rw-2');
  });

  it('spends an unlocked flex once, counts it and ranks the viewer', async () => {
    // Nothing unlocked: nothing counted.
    expect(useFlex('kartograph').counted).toBe(false);
    expect(flexStanding('kartograph')).toEqual({ count: 0, rank: null, credits: 0 });

    const grant = await request(app).post('/api/reward-stats/flex/credit').set(auth()).send({ user_name: 'Kartograph' }).expect(200);
    expect(grant.body.credits).toBe(1);

    const first = useFlex('Kartograph', 'Kartograph');
    expect(first).toMatchObject({ counted: true, count: 1, rank: 1, credits: 0 });
    // The credit is gone — a second !flex counts nothing.
    expect(useFlex('kartograph').counted).toBe(false);

    const board = (await request(app).get('/api/reward-stats/breakdown').set(auth()).expect(200)).body;
    expect(board).toEqual([{ user_name: 'kartograph', reward_type: 'flex', count: 1, last_redeemed_at: expect.any(String), credits: 0 }]);
  });

  it('refuses a credit for anything but a login', async () => {
    await request(app).post('/api/reward-stats/flex/credit').set(auth()).send({ user_name: 'DROP TABLE' }).expect(400);
  });
});

/**
 * Before 2026-10-06 the flex reward was a word in the reward's name. On the
 * first Twitch connection after the update the tool picks the reward in
 * Twitch whose name carries that word — once, and only when it is unambiguous.
 */
describe('adopting the old keyword as a reward', () => {
  const twitch = (rewards: Array<{ id: string; title: string }>): Helix => async (path) => {
    if (path === 'users') return { data: [{ id: '42' }] };
    if (path === 'channel_points/custom_rewards?broadcaster_id=42') return { data: rewards };
    return null;
  };
  const keyword = (word: string) => getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('flex_reward', word);

  beforeEach(() => initDatabase(':memory:'));

  it('takes the one reward whose name carries the word', async () => {
    await adoptFlexReward(twitch([{ id: 'rw-7', title: 'Roulette' }, { id: 'rw-8', title: 'Flex!' }]));
    expect(flexReward()).toEqual({ id: 'rw-8', title: 'Flex!' });
    expect(isFlexReward('rw-8')).toBe(true);
  });

  it('uses the word the streamer had set, not the default', async () => {
    keyword('Angeben');
    await adoptFlexReward(twitch([{ id: 'rw-8', title: 'Flex!' }, { id: 'rw-9', title: 'Einmal angeben' }]));
    expect(flexReward()).toEqual({ id: 'rw-9', title: 'Einmal angeben' });
  });

  it('chooses nothing when no reward or several match, and does not try again', async () => {
    await adoptFlexReward(twitch([{ id: 'rw-8', title: 'Flex!' }, { id: 'rw-9', title: 'Reflex' }]));
    expect(flexReward()).toBeNull();
    // Decided once: a later connection with a clear match changes nothing.
    await adoptFlexReward(twitch([{ id: 'rw-8', title: 'Flex!' }]));
    expect(flexReward()).toBeNull();
  });

  it('waits for the next connection when Twitch cannot be asked', async () => {
    await adoptFlexReward(async () => null);
    expect(flexReward()).toBeNull();
    await adoptFlexReward(twitch([{ id: 'rw-8', title: 'Flex!' }]));
    expect(flexReward()).toEqual({ id: 'rw-8', title: 'Flex!' });
  });

  it('leaves a reward the streamer already chose alone', async () => {
    getDb().prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('flex_reward_id', 'rw-1');
    getDb().prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('flex_reward_title', 'Flex');
    await adoptFlexReward(twitch([{ id: 'rw-8', title: 'Flex!' }]));
    expect(flexReward()).toEqual({ id: 'rw-1', title: 'Flex' });
  });
});

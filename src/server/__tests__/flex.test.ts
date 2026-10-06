import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';
import { flexStanding, isFlexReward, useFlex } from '../flex';

// The Bestenliste counts flexes: a "Flex" reward unlocks one, !flex spends it.

describe('flexes', () => {
  let app: Express;
  let token: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(() => {
    initDatabase(':memory:');
    token = generateApiToken();
    app = createApp();
  });

  it('knows which reward unlocks a flex, and lets the streamer rename it', async () => {
    expect((await request(app).get('/api/reward-stats/flex-settings').set(auth()).expect(200)).body.reward).toBe('Flex');
    expect(isFlexReward('Flex!')).toBe(true);
    expect(isFlexReward('Roulette drehen')).toBe(false);
    await request(app).post('/api/reward-stats/flex-settings').set(auth()).send({ reward: 'Angeben' }).expect(200);
    expect(isFlexReward('Einmal richtig angeben')).toBe(true);
    expect(isFlexReward('Flex!')).toBe(false);
    await request(app).post('/api/reward-stats/flex-settings').set(auth()).send({ reward: '' }).expect(400);
    await request(app).post('/api/reward-stats/flex-settings').set(auth()).send({ reward: 'Flex' }).expect(200);
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

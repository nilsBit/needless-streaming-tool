import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';
import { markQuestFlag } from '../quests/flags';

/**
 * Quests (spec 2026-10-08-quests-design): done by the state, kept once done,
 * only for features that are on, and nothing but the choice until the
 * streamer has chosen what the stream can do.
 */
describe('quests', () => {
  let app: Express;
  let token: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  type View = { key: string; xp: number; completedAt: string | null };
  const overview = async () => (await request(app).get('/api/quests').set(auth()).expect(200)).body as {
    stage: { level: number; name: string; xp: number; next: { name: string; from: number } | null };
    choosing: boolean; next: View | null; open: View[]; done: View[];
  };
  const keys = (list: View[]) => list.map((q) => q.key);
  const choose = (features: string[]) => request(app).post('/api/setup/features').set(auth()).send({ features }).expect(200);

  beforeEach(() => {
    initDatabase(':memory:');
    token = generateApiToken();
    app = createApp();
  });

  it('starts with choosing what the stream can do, and shows nothing else until then', async () => {
    const o = await overview();
    expect(o.choosing).toBe(true);
    expect(keys(o.open)).toEqual(['choose']);
    expect(o.stage).toMatchObject({ level: 1, name: 'Funke', xp: 0, next: { name: 'Lagerfeuer', from: 100 } });
  });

  it('shows the quests of the chosen features once chosen, and only those', async () => {
    await choose(['befehle', 'punkte']);
    const o = await overview();
    expect(o.choosing).toBe(false);
    expect(keys(o.done)).toEqual(['choose']);
    expect(keys(o.open)).toEqual(expect.arrayContaining(['twitch', 'obs', 'command', 'pointReward']));
    expect(keys(o.open)).not.toContain('leaderboard');
    expect(keys(o.open)).not.toContain('entryCard');
    expect(o.next?.key).toBe('twitch');
  });

  it('is done by the state: a reward made counts, and stays done when it is deleted', async () => {
    await choose(['punkte']);
    await overview(); // the first check books quietly what is there
    const made = (await request(app).post('/api/points/rewards').set(auth()).send({ name: 'Licht aus', cost: 30, action: 'alert' }).expect(201)).body;
    let o = await overview();
    expect(keys(o.done)).toContain('pointReward');
    expect(o.stage.xp).toBe(20 + 50);
    await request(app).delete(`/api/points/rewards/${made.id}`).set(auth()).expect(200);
    o = await overview();
    expect(keys(o.done)).toContain('pointReward');
  });

  it('counts what happened once, by its flag', async () => {
    await choose(['rad']);
    markQuestFlag('twitch');
    markQuestFlag('spin');
    const o = await overview();
    expect(keys(o.done)).toEqual(expect.arrayContaining(['twitch', 'spin']));
    expect(o.stage.xp).toBe(20 + 40 + 30);
  });

  it('hides the quests of a feature switched off, and their EP stop counting', async () => {
    await choose(['befehle', 'punkte']);
    await request(app).post('/api/points/rewards').set(auth()).send({ name: 'Licht aus', cost: 30, action: 'alert' }).expect(201);
    expect((await overview()).stage.xp).toBe(70);
    await choose(['befehle']);
    const o = await overview();
    expect(keys(o.done)).not.toContain('pointReward');
    expect(o.stage.xp).toBe(20);
  });

  it('climbs a stage with enough EP', async () => {
    await choose(['befehle']);
    for (const flag of ['twitch', 'obs', 'stream']) markQuestFlag(flag);
    const o = await overview();
    expect(o.stage).toMatchObject({ level: 2, name: 'Lagerfeuer', xp: 20 + 40 + 40 + 60 });
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { getDb, initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';
import { REWARD_TIMER_DONE_MS, endRewardTimer, restoreRewardTimer, startRewardTimer, toggleRewardTimerPause } from '../reward-timer';

/**
 * A reward's timer is a countdown over "Ziel für heute": the task, who
 * redeemed it and the time left; "Zeit um!" for a moment; then whatever goal
 * was there before comes back as it was.
 */
describe('reward timer', () => {
  let app: Express;
  let token: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const state = () => getDb().prepare('SELECT * FROM stream_state WHERE id = 1').get() as Record<string, unknown>;
  const T0 = Date.UTC(2026, 9, 14, 20, 0, 0);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    initDatabase(':memory:');
    token = generateApiToken();
    app = createApp();
  });
  afterEach(() => { endRewardTimer(); vi.useRealTimers(); });

  it('shows the task, who and when it ends', () => {
    expect(startRewardTimer({ task: 'Nur Pistole', minutes: 5, who: 'Lena' })).toEqual({ ok: true });
    expect(state()).toMatchObject({ challenge_title: 'Nur Pistole', challenge_status: 'in_progress', timer_ends_at: T0 + 300_000, timer_task_by: 'Lena', timer_running: 0 });
  });

  it('says "Zeit um" at the end, then clears', () => {
    startRewardTimer({ task: 'Nur Pistole', minutes: 1, who: 'Lena' });
    vi.advanceTimersByTime(60_000);
    expect(state()).toMatchObject({ challenge_status: 'done', timer_ends_at: T0 + 60_000 });
    vi.advanceTimersByTime(REWARD_TIMER_DONE_MS);
    expect(state()).toMatchObject({ challenge_title: null, challenge_status: 'idle', timer_ends_at: null, timer_task_by: null });
  });

  it('refuses a second timer while one runs', () => {
    startRewardTimer({ task: 'Eins', minutes: 5, who: 'Lena' });
    expect(startRewardTimer({ task: 'Zwei', minutes: 5, who: 'Tom' })).toEqual({ ok: false, reason: 'es läuft schon ein Timer' });
    expect(state().challenge_title).toBe('Eins');
  });

  it('brings the streamer\'s own goal back, its clock having run on', async () => {
    await request(app).patch('/api/stream-state').set(auth()).send({ challenge_title: 'Kapitel 3 fertig', challenge_status: 'in_progress', timer_seconds: 100, timer_running: 1 }).expect(200);
    startRewardTimer({ task: 'Nur Pistole', minutes: 1, who: 'Lena' });
    vi.advanceTimersByTime(60_000 + REWARD_TIMER_DONE_MS);
    const s = state();
    expect(s).toMatchObject({ challenge_title: 'Kapitel 3 fertig', challenge_status: 'in_progress', timer_running: 1, saved_challenge: null });
    expect(s.timer_seconds as number).toBeGreaterThanOrEqual(165);
    await request(app).patch('/api/stream-state').set(auth()).send({ timer_running: 0 });
  });

  it('pauses and resumes with the time that was left', () => {
    startRewardTimer({ task: 'Nur Pistole', minutes: 5, who: 'Lena' });
    vi.advanceTimersByTime(60_000);
    expect(toggleRewardTimerPause()).toBe(true);
    expect(state()).toMatchObject({ timer_paused_left: 240_000, timer_ends_at: null });
    vi.advanceTimersByTime(600_000);
    expect(state().challenge_status).toBe('in_progress');
    toggleRewardTimerPause();
    expect(state()).toMatchObject({ timer_paused_left: null, timer_ends_at: Date.now() + 240_000 });
  });

  it('runs on after a restart, or ends at once when the time is up', () => {
    startRewardTimer({ task: 'Nur Pistole', minutes: 5, who: 'Lena' });
    restoreRewardTimer(T0 + 10 * 60_000);
    expect(state()).toMatchObject({ challenge_status: 'idle', timer_ends_at: null });

    startRewardTimer({ task: 'Nochmal', minutes: 5, who: 'Lena' });
    restoreRewardTimer();
    vi.advanceTimersByTime(300_000);
    expect(state().challenge_status).toBe('done');
  });

  it('keeps a paused countdown paused after a restart', () => {
    startRewardTimer({ task: 'Nur Pistole', minutes: 5, who: 'Lena' });
    toggleRewardTimerPause();
    restoreRewardTimer(T0 + 60 * 60_000);
    expect(state()).toMatchObject({ challenge_status: 'in_progress', timer_paused_left: 300_000 });
  });

  it('ends from the app and when the goal is reset', async () => {
    startRewardTimer({ task: 'Nur Pistole', minutes: 5, who: 'Lena' });
    await request(app).post('/api/stream-state/reward-timer/end').set(auth()).expect(200);
    expect(state()).toMatchObject({ challenge_status: 'idle', timer_ends_at: null });
  });

  it('resetting the goal ends a reward timer', async () => {
    await request(app).patch('/api/stream-state').set(auth()).send({ challenge_title: 'Eigenes', challenge_status: 'in_progress' }).expect(200);
    startRewardTimer({ task: 'Nur Pistole', minutes: 5, who: 'Lena' });
    await request(app).patch('/api/stream-state').set(auth()).send({ challenge_title: null, challenge_status: 'idle', timer_seconds: 0, timer_running: 0 }).expect(200);
    expect(state()).toMatchObject({ challenge_title: null, timer_ends_at: null, saved_challenge: null });
    vi.advanceTimersByTime(600_000);
    expect(state().challenge_title).toBeNull();
  });
  it('a count-up started during the countdown does not survive it (goal saved and running)', async () => {
    await request(app).patch('/api/stream-state').set(auth()).send({ challenge_title: 'Eigenes', challenge_status: 'in_progress', timer_seconds: 100, timer_running: 1 }).expect(200);
    startRewardTimer({ task: 'Nur Pistole', minutes: 1, who: 'Lena' });
    await request(app).patch('/api/stream-state').set(auth()).send({ timer_running: 1 }).expect(200);
    vi.advanceTimersByTime(60_000 + REWARD_TIMER_DONE_MS);
    const s = state();
    expect(s).toMatchObject({ challenge_title: 'Eigenes', timer_running: 1 });
    expect(s.timer_seconds as number).toBe(165);
    vi.advanceTimersByTime(3000);
    await request(app).patch('/api/stream-state').set(auth()).send({ timer_running: 0 });
    expect(state().timer_seconds).toBe(168);
  });

  it('a count-up started during the countdown stops with it (no goal saved)', async () => {
    startRewardTimer({ task: 'Nur Pistole', minutes: 1, who: 'Lena' });
    await request(app).patch('/api/stream-state').set(auth()).send({ timer_running: 1 }).expect(200);
    vi.advanceTimersByTime(60_000 + REWARD_TIMER_DONE_MS);
    expect(state()).toMatchObject({ timer_running: 0, timer_seconds: 0 });
    vi.advanceTimersByTime(30_000);
    expect(state()).toMatchObject({ timer_running: 0, timer_seconds: 0 });
  });
});

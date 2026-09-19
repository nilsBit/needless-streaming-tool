import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { getDb, initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';
import { restoreTimerState } from '../api/stream-state';

/**
 * A timer that was running when the app went down keeps running after it
 * comes back. The restore used to run at import time, before the database
 * was open, so it always failed and the timer stood still.
 */
describe('stream timer', () => {
  let app: Express;
  let token: string;

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const timerSeconds = () =>
    (getDb().prepare('SELECT timer_seconds FROM stream_state WHERE id = 1').get() as { timer_seconds: number }).timer_seconds;

  beforeEach(() => {
    vi.useFakeTimers();
    initDatabase(':memory:');
    token = generateApiToken();
    app = createApp();
  });

  afterEach(async () => {
    await request(app).patch('/api/stream-state').set(auth()).send({ timer_running: 0 });
    vi.useRealTimers();
  });

  it('picks up a running timer after a restart', () => {
    getDb().prepare('UPDATE stream_state SET timer_running = 1, timer_seconds = 42 WHERE id = 1').run();

    restoreTimerState();
    vi.advanceTimersByTime(10_000);

    expect(timerSeconds()).toBe(52);
  });

  it('leaves a stopped timer alone', () => {
    getDb().prepare('UPDATE stream_state SET timer_running = 0, timer_seconds = 42 WHERE id = 1').run();

    restoreTimerState();
    vi.advanceTimersByTime(10_000);

    expect(timerSeconds()).toBe(42);
  });
});

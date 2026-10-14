import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';

/** Timer and Ton carry their own fields; every other block carries none. */
describe('reward fields for timer and sound', () => {
  let app: Express;
  let token: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const SOUND = `test-${process.pid}-schrei.mp3`;
  const create = (body: Record<string, unknown>) => request(app).post('/api/points/rewards').set(auth()).send({ cost: 10, ...body });

  beforeEach(async () => {
    initDatabase(':memory:');
    token = generateApiToken();
    app = createApp();
    await request(app).post('/api/alerts/sounds').query({ name: SOUND }).set(auth()).set('Content-Type', 'audio/mpeg')
      .send(Buffer.concat([Buffer.from('ID3'), Buffer.alloc(24)])).expect(200);
  });
  afterEach(async () => { await request(app).delete(`/api/alerts/sounds/${SOUND}`).set(auth()); });

  it('keeps the task and minutes of a timer', async () => {
    const made = (await create({ name: 'Handicap', action: 'timer', task: '  Nur Pistole ', minutes: 10 }).expect(201)).body;
    expect(made).toMatchObject({ action: 'timer', task: 'Nur Pistole', minutes: 10, sound: null });
  });

  it('gives a timer five minutes and its name as the task when none is sent', async () => {
    const made = (await create({ name: 'Handicap', action: 'timer' }).expect(201)).body;
    expect(made).toMatchObject({ task: 'Handicap', minutes: 5 });
  });

  it('refuses a timer longer than an hour or a task over 60 characters', async () => {
    await create({ name: 'Lang', action: 'timer', minutes: 61 }).expect(400);
    await create({ name: 'Viel', action: 'timer', task: 'x'.repeat(61) }).expect(400);
  });

  it('keeps the sound of a sound reward', async () => {
    const made = (await create({ name: 'Jumpscare', action: 'sound', sound: SOUND }).expect(201)).body;
    expect(made).toMatchObject({ action: 'sound', sound: SOUND, task: null, minutes: null });
  });

  it('refuses a sound that is gone', async () => {
    await create({ name: 'Weg', action: 'sound', sound: 'gibt-es-nicht.mp3' }).expect(400);
    await create({ name: 'Ohne', action: 'sound' }).expect(400);
  });

  it('drops timer and sound fields when the reward becomes an alert', async () => {
    const made = (await create({ name: 'Wechsel', action: 'timer', minutes: 3 }).expect(201)).body;
    const changed = (await request(app).patch(`/api/points/rewards/${made.id}`).set(auth()).send({ action: 'alert' }).expect(200)).body;
    expect(changed).toMatchObject({ action: 'alert', task: null, minutes: null, sound: null });
  });
});

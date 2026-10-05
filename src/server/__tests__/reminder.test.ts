import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';
import { createReminder } from '../bot/reminder';

/** The line the bot says on its own every so often — only into a chat that is alive. */
describe('the bot’s reminder', () => {
  let app: Express;
  let auth: { Authorization: string };

  beforeEach(() => {
    initDatabase(':memory:');
    auth = { Authorization: `Bearer ${generateApiToken()}` };
    app = createApp();
  });

  it('is off with a built-in line until the streamer sets minutes and words', async () => {
    expect((await request(app).get('/api/settings/reminder').set(auth).expect(200)).body).toMatchObject({
      minutes: 0, text: 'Neu hier? !welt erklärt die Welt, !story die Geschichte, !befehle den Rest.',
    });
    await request(app).post('/api/settings/reminder').set(auth).send({ minutes: 20, text: 'Fragen? !welt und !story helfen.' }).expect(200);
    expect((await request(app).get('/api/settings/reminder').set(auth).expect(200)).body).toMatchObject({ minutes: 20, text: 'Fragen? !welt und !story helfen.' });
    await request(app).post('/api/settings/reminder').set(auth).send({ text: '' }).expect(200);
    expect((await request(app).get('/api/settings/reminder').set(auth).expect(200)).body.text).toMatch(/^Neu hier\?/);
    await request(app).post('/api/settings/reminder').set(auth).send({ minutes: -5 }).expect(400);
    await request(app).post('/api/settings/reminder').set(auth).send({ minutes: 1.5 }).expect(400);
  });

  it('speaks when the interval has passed and somebody wrote since — never into an empty room', () => {
    let now = 0;
    const reminder = createReminder(() => now);
    const minute = 60_000;
    expect(reminder.due(0)).toBe(false);
    now = 25 * minute;
    expect(reminder.due(20)).toBe(false); // nobody wrote
    reminder.noteChat();
    expect(reminder.due(20)).toBe(true);
    reminder.sent();
    now = 30 * minute;
    reminder.noteChat();
    expect(reminder.due(20)).toBe(false); // too soon
    now = 46 * minute;
    expect(reminder.due(20)).toBe(true);
    reminder.sent();
    now = 70 * minute;
    expect(reminder.due(20)).toBe(false); // quiet since the last one
  });
});

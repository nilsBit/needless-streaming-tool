import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';
import { paceFactor, passCooldown, resetCooldowns } from '../bot/cooldown';
import { noteChatActivity } from '../bot/chat-feed';

/**
 * Cooldowns that know the room: shorter when chat is busy, longer for the
 * one viewer who just got the answer, and one shared by the built-ins that
 * only tell something.
 */
describe('cooldowns', () => {
  const s = 1000;

  beforeEach(() => resetCooldowns());

  it('run their course in a quiet chat, and quarter to half as long in a busy one', () => {
    expect(paceFactor(3)).toBe(1);
    expect(paceFactor(20)).toBe(0.5);
    expect(paceFactor(60)).toBe(0.25);

    expect(passCooldown('k', 30, false, { now: 0, pace: 1 })).toBe(true);
    expect(passCooldown('k', 30, false, { now: 29 * s, pace: 1 })).toBe(false);
    expect(passCooldown('k', 30, false, { now: 30 * s, pace: 1 })).toBe(true);
    // The same command in a busy chat: fifteen seconds are enough.
    expect(passCooldown('k', 30, false, { now: 44 * s, pace: 0.5 })).toBe(false);
    expect(passCooldown('k', 30, false, { now: 45 * s, pace: 0.5 })).toBe(true);
  });

  it('answer another viewer after the command’s cooldown, the same one only after four times that', () => {
    expect(passCooldown('k', 30, false, { now: 0, pace: 1, viewer: 'Mila' })).toBe(true);
    expect(passCooldown('k', 30, false, { now: 30 * s, pace: 1, viewer: 'mila' })).toBe(false);
    expect(passCooldown('k', 30, false, { now: 30 * s, pace: 1, viewer: 'selma' })).toBe(true);
    expect(passCooldown('k', 30, false, { now: 119 * s, pace: 1, viewer: 'mila' })).toBe(false);
    expect(passCooldown('k', 30, false, { now: 120 * s, pace: 1, viewer: 'mila' })).toBe(true);
    // Never under a minute, however short the command's own cooldown.
    expect(passCooldown('short', 5, false, { now: 0, pace: 1, viewer: 'mila' })).toBe(true);
    expect(passCooldown('short', 5, false, { now: 59 * s, pace: 1, viewer: 'mila' })).toBe(false);
    expect(passCooldown('short', 5, false, { now: 60 * s, pace: 1, viewer: 'mila' })).toBe(true);
  });

  it('never hold back a mod or the streamer, and do not start for them', () => {
    expect(passCooldown('k', 30, true, { now: 0, pace: 1, viewer: 'nils' })).toBe(true);
    expect(passCooldown('k', 30, false, { now: 1 * s, pace: 1, viewer: 'mila' })).toBe(true);
  });

  it('count what chat writes, commands included', () => {
    const t = 1_000_000;
    for (let i = 0; i < 25; i++) noteChatActivity(t + i * s);
    expect(passCooldown('busy', 30, false, { now: t + 25 * s })).toBe(true);
    // Twenty-five messages a minute: half the cooldown — fifteen seconds suffice.
    expect(passCooldown('busy', 30, false, { now: t + 39 * s })).toBe(false);
    expect(passCooldown('busy', 30, false, { now: t + 40 * s })).toBe(true);
  });

  describe('over the chat', () => {
    let app: Express;
    let auth: { Authorization: string };

    beforeEach(async () => {
      initDatabase(':memory:');
      auth = { Authorization: `Bearer ${generateApiToken()}` };
      app = createApp();
      await request(app).post('/api/text-commands').set(auth).send({ trigger: '!story', response: 'Eine Welt.', cooldown_seconds: 30 }).expect(201);
    });

    const ask = async (message: string, user: string) =>
      (await request(app).post('/api/chat/try').set(auth).send({ message, as: 'viewer', user }).expect(200)).body;

    it('answer a viewer once, hold the same viewer back, and still answer the next after the cooldown', async () => {
      expect((await ask('!story', 'mila')).replies).toEqual(['Eine Welt.']);
      expect(await ask('!story', 'mila')).toEqual({ replies: null, reason: 'cooldown' });
      expect(await ask('!story', 'selma')).toEqual({ replies: null, reason: 'cooldown' });
    });

    it('hold the informational built-ins to one shared, adjustable cooldown', async () => {
      expect((await request(app).get('/api/settings/builtin-cooldown').set(auth).expect(200)).body).toEqual({ seconds: 15, max: 600 });
      expect((await ask('!uptime', 'mila')).replies).toHaveLength(1);
      expect(await ask('!uptime', 'selma')).toEqual({ replies: null, reason: 'cooldown' });
      await request(app).post('/api/settings/builtin-cooldown').set(auth).send({ seconds: 0 }).expect(200);
      expect((await ask('!uptime', 'selma')).replies).toHaveLength(1);
      await request(app).post('/api/settings/builtin-cooldown').set(auth).send({ seconds: 601 }).expect(400);
      await request(app).post('/api/settings/builtin-cooldown').set(auth).send({ seconds: 2.5 }).expect(400);
    });

    it('do not touch the streamer trying a command in the app', async () => {
      for (let i = 0; i < 3; i++) {
        expect((await request(app).post('/api/chat/try').set(auth).send({ message: '!story' }).expect(200)).body.replies).toEqual(['Eine Welt.']);
      }
    });
  });
});

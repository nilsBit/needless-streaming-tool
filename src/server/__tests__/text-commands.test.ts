import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { initDatabase, getDb } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';

/**
 * Text Commands: chat replies the streamer writes once in the app.
 *
 * The bot never runs here — it needs Twitch. What it would say is reachable
 * over `/api/text-commands/try`, which goes down the same path the bot takes
 * for everything that is not a computed built-in. That is how cooldowns and
 * `!befehle` are tested at this seam.
 */

/** 99 characters, ending in a sentence. */
const SENTENCE = 'Die Verborgene Stadt liegt unter dem Meer, und niemand an der Oberfläche weiß, dass sie existiert. ';

describe('text commands', () => {
  let app: Express;
  let token: string;

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const create = (body: Record<string, unknown>) =>
    request(app).post('/api/text-commands').set(auth()).send(body);
  const tryInChat = (message: string, as?: 'viewer' | 'moderator') =>
    request(app).post('/api/text-commands/try').set(auth()).send({ message, as });

  beforeAll(() => {
    initDatabase(':memory:');
    token = generateApiToken();
    app = createApp();
  });

  beforeEach(() => {
    getDb().prepare('DELETE FROM text_commands').run();
    getDb().prepare('DELETE FROM settings WHERE key = ?').run('custom_commands');
  });

  describe('writing them', () => {
    it('creates a Text Command and lists it', async () => {
      const created = await create({ trigger: 'Story', response: 'Es geht um eine Stadt unter dem Meer.' }).expect(201);

      // The "!" is optional when typing, and case never matters in chat.
      expect(created.body).toMatchObject({ trigger: '!story', cooldown_seconds: 30, enabled: true });

      const list = await request(app).get('/api/text-commands').set(auth()).expect(200);
      expect(list.body.map((c: { trigger: string }) => c.trigger)).toEqual(['!story']);
    });

    it('edits and deletes one', async () => {
      const { body } = await create({ trigger: '!welt', response: 'Alt.' }).expect(201);

      await request(app).patch(`/api/text-commands/${body.id}`).set(auth()).send({ response: 'Neu.' }).expect(200);
      const edited = await request(app).get('/api/text-commands').set(auth()).expect(200);
      expect(edited.body[0].response).toBe('Neu.');

      await request(app).delete(`/api/text-commands/${body.id}`).set(auth()).expect(204);
      const after = await request(app).get('/api/text-commands').set(auth()).expect(200);
      expect(after.body).toEqual([]);
    });

    it('refuses a trigger a built-in command already uses, and says which', async () => {
      const res = await create({ trigger: '!figur', response: 'Wer?' }).expect(409);
      expect(res.body.message).toContain('!figur');
    });

    it('refuses a trigger a renamed built-in command uses', async () => {
      await request(app).post('/api/settings/commands').set(auth()).send({ challenge: '!story' }).expect(200);

      await create({ trigger: '!story', response: 'Es geht um …' }).expect(409);
    });

    it('refuses renaming a built-in command onto a Text Command', async () => {
      await create({ trigger: '!story', response: 'Es geht um …' }).expect(201);

      // Built-ins are tried first, so the Text Command would go silent.
      await request(app).post('/api/settings/commands').set(auth()).send({ challenge: '!story' }).expect(409);
    });

    it('refuses the same trigger twice, whatever the case', async () => {
      await create({ trigger: '!story', response: 'Eins.' }).expect(201);
      await create({ trigger: '!STORY', response: 'Zwei.' }).expect(409);
    });

    it('lets a Text Command keep its own trigger when edited', async () => {
      const { body } = await create({ trigger: '!story', response: 'Eins.' }).expect(201);
      await request(app).patch(`/api/text-commands/${body.id}`).set(auth()).send({ trigger: '!story', response: 'Zwei.' }).expect(200);
    });

    it('refuses a trigger that is not a single word', async () => {
      await create({ trigger: '!die story', response: 'Text.' }).expect(400);
    });

    it('refuses an empty reply', async () => {
      await create({ trigger: '!story', response: '   ' }).expect(400);
    });

    it('refuses a reply that needs more than three chat messages', async () => {
      const res = await create({ trigger: '!story', response: SENTENCE.repeat(20) }).expect(400);
      expect(res.body.error).toBe('too_long');
    });
  });

  describe('fitting into chat', () => {
    const preview = (response: string) =>
      request(app).post('/api/text-commands/preview').set(auth()).send({ response });

    it('keeps a short reply in one message', async () => {
      const res = await preview('Kurz und bündig.').expect(200);
      expect(res.body.messages).toEqual(['Kurz und bündig.']);
    });

    it('splits a long reply after whole sentences, never beyond 500 characters', async () => {
      const res = await preview(SENTENCE.repeat(8)).expect(200);
      const messages = res.body.messages as string[];

      expect(messages).toHaveLength(2);
      for (const message of messages) {
        expect(message.length).toBeLessThanOrEqual(500);
        expect(message.endsWith('existiert.')).toBe(true);
      }
    });

    it('cuts between words when there is no sentence to end at', async () => {
      const res = await preview('Wort '.repeat(150)).expect(200);
      const messages = res.body.messages as string[];

      expect(messages.length).toBeGreaterThan(1);
      for (const message of messages) {
        expect(message.length).toBeLessThanOrEqual(500);
        expect(message.split(' ').every((word) => word === 'Wort')).toBe(true);
      }
    });
  });

  describe('answering chat', () => {
    it('answers a viewer with the written text', async () => {
      await create({ trigger: '!story', response: 'Es geht um eine Stadt unter dem Meer.' }).expect(201);

      const res = await tryInChat('!story', 'viewer').expect(200);
      expect(res.body.replies).toEqual(['Es geht um eine Stadt unter dem Meer.']);
    });

    it('holds back a repeat within the cooldown, but not for mods', async () => {
      await create({ trigger: '!story', response: 'Text.', cooldown_seconds: 60 }).expect(201);

      await tryInChat('!story', 'viewer').expect(200);
      const repeat = await tryInChat('!story', 'viewer').expect(200);
      expect(repeat.body).toEqual({ replies: null, reason: 'cooldown' });

      const mod = await tryInChat('!story', 'moderator').expect(200);
      expect(mod.body.replies).toEqual(['Text.']);
    });

    it('answers every time with a cooldown of 0', async () => {
      await create({ trigger: '!story', response: 'Text.', cooldown_seconds: 0 }).expect(201);

      await tryInChat('!story', 'viewer').expect(200);
      const again = await tryInChat('!story', 'viewer').expect(200);
      expect(again.body.replies).toEqual(['Text.']);
    });

    it('tries as the streamer by default, so trying out never starts the cooldown', async () => {
      await create({ trigger: '!story', response: 'Text.', cooldown_seconds: 60 }).expect(201);

      await tryInChat('!story').expect(200);
      const viewer = await tryInChat('!story', 'viewer').expect(200);
      expect(viewer.body.replies).toEqual(['Text.']);
    });

    it('stays silent when switched off', async () => {
      await create({ trigger: '!story', response: 'Text.', enabled: false }).expect(201);

      const res = await tryInChat('!story', 'viewer').expect(200);
      expect(res.body).toEqual({ replies: null, reason: 'disabled' });
    });

    it('leaves computed built-ins to the real chat', async () => {
      const res = await tryInChat('!figur').expect(200);
      expect(res.body).toEqual({ replies: null, reason: 'builtin' });
    });
  });

  describe('!befehle', () => {
    it('lists Text Commands first, then the built-ins a viewer can use', async () => {
      await create({ trigger: '!welt', response: 'Welt.' }).expect(201);
      await create({ trigger: '!story', response: 'Story.' }).expect(201);
      await create({ trigger: '!geheim', response: 'Aus.', enabled: false }).expect(201);

      const res = await tryInChat('!befehle', 'viewer').expect(200);
      const reply = (res.body.replies as string[]).join(' ');

      expect(reply).toMatch(/^📜 Befehle: !story !welt · /);
      expect(reply).toContain('!figur');
      expect(reply).not.toContain('!geheim');
      expect(reply).not.toContain('!scene');
    });

    it('follows a renamed built-in', async () => {
      await request(app).post('/api/settings/commands').set(auth()).send({ character: '!wer' }).expect(200);

      const res = await tryInChat('!befehle').expect(200);
      expect(res.body.replies[0]).toContain('!wer');
      expect(res.body.replies[0]).not.toContain('!figur');
    });
  });

  it('offers every built-in command for renaming in Settings', async () => {
    const res = await request(app).get('/api/settings/commands').set(auth()).expect(200);
    expect(Object.keys(res.body)).toEqual(
      expect.arrayContaining(['sr', 'queue', 'rewardstats', 'character', 'commands']),
    );
  });
});

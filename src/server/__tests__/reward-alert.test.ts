import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';
import { alertText } from '../reward-actions';

let events: Array<{ event: string; data: Record<string, unknown> }> = [];
vi.mock('../websocket/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../websocket/index')>()),
  broadcast: (event: string, data: Record<string, unknown>) => { events.push({ event, data }); },
}));

describe('what a reward\'s alert shows', () => {
  it('cuts the viewer\'s text to 100 characters and hides links', () => {
    expect(alertText('Schau mal https://evil.example/x und www.spam.de oder kauf.shop/jetzt')).toBe('Schau mal [Link] und [Link] oder [Link]');
    // Bare domains and spaced-out ones too (security review 15.10.); a sentence end stays.
    expect(alertText('Geh auf scam.gg oder free-vbucks.com, bit . ly/abc')).toBe('Geh auf [Link] oder [Link], [Link]');
    expect(alertText('Das war gut.Danke! z.B. so')).toBe('Das war gut.Danke! z.B. so');
    expect(alertText('a'.repeat(120))).toBe(`${'a'.repeat(99)}…`);
    expect(alertText('  Zeile\n\nzwei  ')).toBe('Zeile zwei');
    expect(alertText('   ')).toBeUndefined();
  });

  describe('own points', () => {
    let app: Express;
    let token: string;
    const auth = () => ({ Authorization: `Bearer ${token}` });
    const SOUND = `test-${process.pid}-glas.mp3`;

    beforeEach(async () => {
      initDatabase(':memory:');
      token = generateApiToken();
      app = createApp();
      await request(app).post('/api/alerts/sounds').query({ name: SOUND }).set(auth()).set('Content-Type', 'audio/mpeg')
        .send(Buffer.concat([Buffer.from('ID3'), Buffer.alloc(24)])).expect(200);
      await request(app).post('/api/points/viewers/mila/adjust').set(auth()).send({ amount: 100 }).expect(200);
      events = [];
    });
    afterEach(async () => { await request(app).delete(`/api/alerts/sounds/${SOUND}`).set(auth()); });

    const redeemed = () => JSON.parse(events.find((e) => e.event === 'reward-redeemed')!.data.data as string);

    it('plays a sound reward\'s sound with its alert', async () => {
      await request(app).post('/api/points/rewards').set(auth()).send({ name: 'Trink was', cost: 10, action: 'sound', sound: SOUND }).expect(201);
      await request(app).post('/api/points/viewers/mila/redeem').set(auth()).send({ reward: 'Trink was' }).expect(200);
      expect(redeemed()).toMatchObject({ reward_title: 'Trink was', sound: { url: `/public/alert-sound/${SOUND}`, volume: 0.8 } });
    });

    it('still alerts, silently, when the sound was deleted', async () => {
      await request(app).post('/api/points/rewards').set(auth()).send({ name: 'Trink was', cost: 10, action: 'sound', sound: SOUND }).expect(201);
      await request(app).delete(`/api/alerts/sounds/${SOUND}`).set(auth()).expect(200);
      await request(app).post('/api/points/viewers/mila/redeem').set(auth()).send({ reward: 'Trink was' }).expect(200);
      expect(redeemed().sound).toBeUndefined();
    });

    it('carries the cleaned text', async () => {
      await request(app).post('/api/points/rewards').set(auth()).send({ name: 'Frage', cost: 10, action: 'alert', needs_input: true }).expect(201);
      await request(app).post('/api/points/viewers/mila/redeem').set(auth()).send({ reward: 'Frage', input: 'Siehe https://x.y/z' }).expect(200);
      expect(redeemed().message).toBe('Siehe [Link]');
    });
  });

  describe('channel points', () => {
    it('carries what the viewer wrote, cleaned', async () => {
      initDatabase(':memory:');
      generateApiToken();
      createApp();
      events = [];
      const { handleRedemption } = await import('../bot/eventsub');
      await handleRedemption({ id: 'r1', user_name: 'Mila', user_login: 'mila', reward: { id: 'x', title: 'Frage an mich' }, user_input: 'Wie geht das? www.spam.de' });
      expect(JSON.parse(events.find((e) => e.event === 'reward-redeemed')!.data.data as string)).toMatchObject({ reward_title: 'Frage an mich', message: 'Wie geht das? [Link]' });
    });
  });
});

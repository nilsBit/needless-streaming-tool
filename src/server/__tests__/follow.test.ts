import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';

/**
 * Follow Mode: the Entry Card follows the entry open in Worldbuilder, unless a
 * card is held.
 *
 * The server looks once a second; the tests take the same look over
 * `/api/entries/follow/check`, against a stub Schaufenster whose `/fokus` they
 * set. `seit` decides the settle time, so no clock is faked.
 */

const TOKEN = 'follow-token';
const CONNECTION = path.join(os.tmpdir(), `wb-follow-${process.pid}.json`);

const WORLD = [
  { id: 'e-mila', titel: 'Mila', art: 'Figur', reifegrad: 'Entwurf', zweitnamen: [], text: '', werte: { Kurzbeschreibung: 'Kartografin.' }, hatBild: false },
  { id: 'e-saldor', titel: 'Saldor', art: 'Region', reifegrad: 'Idee', zweitnamen: [], text: 'Eine Wüste.', werte: {}, hatBild: false },
  { id: 'e-thoral', titel: 'Thoral', art: 'Figur', reifegrad: 'Verworfen', zweitnamen: [], text: 'Gestrichen.', werte: {}, hatBild: false },
];

type Focus = { id: string; titel: string; art: string; seit: string } | null;
let focus: Focus = null;

const openFor = (id: string, secondsAgo: number): Focus => {
  const entry = WORLD.find((e) => e.id === id)!;
  return { id, titel: entry.titel, art: entry.art, seit: new Date(Date.now() - secondsAgo * 1000).toISOString() };
};

let stub: http.Server;

function startStub(): Promise<number> {
  stub = http.createServer((req, res) => {
    const json = (body: unknown, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return json({ fehler: 'token_falsch' }, 401);

    const [first, second] = new URL(req.url || '/', 'http://127.0.0.1').pathname.split('/').filter(Boolean);
    if (first === 'fokus') return json(focus);
    if (first === 'welt') return json({ name: 'Testwelt', schemaVersion: 17 });
    if (first === 'arten') return json([{ name: 'Figur', farbe: '#6f8fb0' }, { name: 'Region', farbe: '#7f9c6b' }]);
    if (first === 'eintrag') {
      const found = WORLD.find((e) => e.id === second);
      return found ? json(found) : json({ fehler: 'unbekannter_eintrag' }, 404);
    }
    if (first === 'eintraege') return json(WORLD.map(({ id, titel, art, reifegrad }) => ({ id, titel, art, reifegrad })));
    return json({ fehler: 'unbekannter_weg' }, 404);
  });
  return new Promise((resolve) => stub.listen(0, '127.0.0.1', () => resolve((stub.address() as { port: number }).port)));
}

describe('follow mode', () => {
  let app: Express;
  let token: string;

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const check = async () => (await request(app).post('/api/entries/follow/check').set(auth()).expect(200)).body;
  const shownTitle = async () => (await request(app).get('/public/entry').expect(200)).body.card?.title ?? null;
  const setFollow = (change: Record<string, unknown>) => request(app).post('/api/entries/follow').set(auth()).send(change);

  beforeAll(async () => {
    const port = await startStub();
    fs.writeFileSync(CONNECTION, JSON.stringify({ version: 1, port, token: TOKEN, pid: process.pid }));
    initDatabase(':memory:');
    token = generateApiToken();
    app = createApp();
  });

  afterAll(async () => {
    await new Promise<void>((done) => stub.close(() => done()));
    fs.rmSync(CONNECTION, { force: true });
    delete process.env.WORLDBUILDER_ANSCHLUSS;
  });

  beforeEach(async () => {
    initDatabase(':memory:');
    process.env.WORLDBUILDER_ANSCHLUSS = CONNECTION;
    focus = null;
    await request(app).post('/api/characters/source').set(auth()).send({ source: 'worldbuilder' }).expect(200);
  });

  it('is on by default once Worldbuilder is the source', async () => {
    const res = await request(app).get('/api/entries/follow').set(auth()).expect(200);
    expect(res.body).toEqual({ enabled: true, held: false, settleSeconds: 3, available: true });
  });

  it('puts what is open on the Overlay once it has stayed open for the settle time', async () => {
    focus = openFor('e-saldor', 10);

    expect((await check()).outcome).toBe('switched');
    expect(await shownTitle()).toBe('Saldor');
  });

  it('waits while an entry has only just been opened — clicking through a list does not flicker', async () => {
    focus = openFor('e-saldor', 0.5);

    const step = await check();
    expect(step.outcome).toBe('settling');
    expect(step.waitMs).toBeGreaterThan(0);
    expect(await shownTitle()).toBeNull();
  });

  it('leaves the card alone when what is open is already shown', async () => {
    focus = openFor('e-mila', 10);
    await check();

    expect((await check()).outcome).toBe('showing');
  });

  it('keeps the last card when nothing is open any more', async () => {
    focus = openFor('e-mila', 10);
    await check();
    focus = null;

    expect((await check()).outcome).toBe('nothing-open');
    expect(await shownTitle()).toBe('Mila');
  });

  it('never follows onto a discarded entry — the last card stays', async () => {
    focus = openFor('e-mila', 10);
    await check();
    focus = openFor('e-thoral', 10);

    expect((await check()).outcome).toBe('discarded');
    expect(await shownTitle()).toBe('Mila');
  });

  it('keeps the card as it is while Worldbuilder is closed', async () => {
    focus = openFor('e-mila', 10);
    await check();
    process.env.WORLDBUILDER_ANSCHLUSS = path.join(os.tmpdir(), 'nothing-here.json');

    expect((await check()).outcome).toBe('unreachable');
    expect(await shownTitle()).toBe('Mila');
  });

  describe('holding a card', () => {
    it('holds a card picked by hand, whatever Worldbuilder has open', async () => {
      const [, saldor] = (await request(app).get('/api/entries?art=Region').set(auth()).expect(200)).body;
      await request(app).post('/api/entries/active').set(auth()).send(saldor ?? { id: 'e-saldor', title: 'Saldor', art: 'Region' }).expect(200);
      focus = openFor('e-mila', 10);

      expect((await request(app).get('/api/entries/follow').set(auth())).body.held).toBe(true);
      expect((await check()).outcome).toBe('held');
      expect(await shownTitle()).toBe('Saldor');
    });

    it('holds an Overlay cleared by hand, so the card does not come straight back', async () => {
      focus = openFor('e-mila', 10);
      await check();
      await request(app).delete('/api/entries/active').set(auth()).expect(200);

      expect((await check()).outcome).toBe('held');
      expect(await shownTitle()).toBeNull();
    });

    it('jumps to what is open once released', async () => {
      await request(app).post('/api/entries/active').set(auth()).send({ id: 'e-saldor', title: 'Saldor', art: 'Region' }).expect(200);
      focus = openFor('e-mila', 10);

      await setFollow({ held: false }).expect(200);

      expect((await check()).outcome).toBe('switched');
      expect(await shownTitle()).toBe('Mila');
    });

    it('lets the Stream Deck toggle the hold with one button', async () => {
      const first = await request(app).post('/api/entries/follow/toggle-hold').set(auth()).expect(200);
      const second = await request(app).post('/api/entries/follow/toggle-hold').set(auth()).expect(200);

      expect([first.body.held, second.body.held]).toEqual([true, false]);
    });
  });

  describe('settings', () => {
    it('does nothing when switched off', async () => {
      await setFollow({ enabled: false }).expect(200);
      focus = openFor('e-mila', 10);

      expect((await check()).outcome).toBe('off');
      expect(await shownTitle()).toBeNull();
    });

    it('does nothing with Notion as the source', async () => {
      await request(app).post('/api/characters/source').set(auth()).send({ source: 'notion' }).expect(200);
      focus = openFor('e-mila', 10);

      expect((await check()).outcome).toBe('off');
    });

    it('releases a leftover hold when following is switched back on', async () => {
      await setFollow({ held: true }).expect(200);
      await setFollow({ enabled: false }).expect(200);

      const res = await setFollow({ enabled: true }).expect(200);
      expect(res.body.held).toBe(false);
    });

    it('takes an adjustable settle time', async () => {
      await setFollow({ settleSeconds: 0 }).expect(200);
      focus = openFor('e-mila', 0);

      expect((await check()).outcome).toBe('switched');
    });

    it('refuses a settle time that makes no sense', async () => {
      await setFollow({ settleSeconds: -1 }).expect(400);
      await setFollow({ settleSeconds: 999 }).expect(400);
      await setFollow({ enabled: 'ja' }).expect(400);
    });
  });
});

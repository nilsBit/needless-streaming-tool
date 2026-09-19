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
 * Entries on the Overlay: anything in the world as an Entry Card, and the
 * per-field switch that keeps spoilers off stream.
 *
 * Worldbuilder is a stub speaking the Schaufenster's routes, as in
 * `worldbuilder.test.ts`. What the Overlay gets is read over `/public/entry`,
 * the route the browser source reads.
 */

const TOKEN = 'entries-token';
const CONNECTION = path.join(os.tmpdir(), `wb-entries-${process.pid}.json`);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02]);
const SPOILER = 'in Wahrheit der verschollene König';

const ARTEN = [
  { name: 'Figur', farbe: '#6f8fb0' },
  { name: 'Region', farbe: '#7f9c6b' },
];

const WORLD = [
  {
    id: 'e-aldric', titel: 'Aldric', art: 'Figur', reifegrad: 'Kanon', zweitnamen: ['Sturmklinge'], text: 'Lange Vorgeschichte.',
    werte: { Rolle: 'Protagonist', Alter: '31', Kurzbeschreibung: `Wanderer ohne Erinnerung — ${SPOILER}.`, 'Stärken': 'Zäh', 'Schwächen': 'Vergesslich' },
    hatBild: true,
    beziehungen: [
      { bezeichnung: 'gehört zu', gruppe: 'Bindung', text: '', zu: { id: 'e-orden', titel: 'Der Orden', art: 'Fraktion', reifegrad: 'Entwurf' } },
      { bezeichnung: 'gehört zu', gruppe: 'Bindung', text: '', zu: { id: 'e-alt', titel: 'Alte Gilde', art: 'Fraktion', reifegrad: 'Verworfen' } },
      { bezeichnung: 'Freund von', gruppe: 'Bindung', text: '', zu: { id: 'e-mila', titel: 'Mila', art: 'Figur', reifegrad: 'Entwurf' } },
    ],
  },
  { id: 'e-mila', titel: 'Mila', art: 'Figur', reifegrad: 'Entwurf', zweitnamen: [], text: '', werte: { Kurzbeschreibung: 'Kartografin.' }, hatBild: false },
  { id: 'e-thoral', titel: 'Thoral', art: 'Figur', reifegrad: 'Verworfen', zweitnamen: [], text: 'Gestrichen.', werte: {}, hatBild: false },
  { id: 'e-saldor', titel: 'Saldor', art: 'Region', reifegrad: 'Idee', zweitnamen: [], text: 'Eine Wüste voller gerader Straßen.', werte: {}, hatBild: false },
];

type Json = Record<string, unknown>;

let stub: http.Server;

function startStub(): Promise<number> {
  stub = http.createServer((req, res) => {
    const json = (body: unknown, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return json({ fehler: 'token_falsch' }, 401);

    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const [first, second] = url.pathname.split('/').filter(Boolean);

    if (first === 'welt') return json({ name: 'Testwelt', schemaVersion: 17 });
    if (first === 'arten') return json(ARTEN);
    if (first === 'eintraege') {
      const art = url.searchParams.get('art');
      return json(WORLD.filter((e) => !art || e.art === art).map(({ id, titel, art: a, reifegrad }) => ({ id, titel, art: a, reifegrad })));
    }
    if (first === 'eintrag') {
      const found = WORLD.find((e) => e.id === second);
      return found ? json(found) : json({ fehler: 'unbekannter_eintrag' }, 404);
    }
    if (first === 'bild' && second === 'e-aldric') {
      res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': PNG.length });
      return res.end(PNG);
    }
    return json({ fehler: 'unbekannter_weg' }, 404);
  });
  return new Promise((resolve) => stub.listen(0, '127.0.0.1', () => resolve((stub.address() as { port: number }).port)));
}

describe('entries', () => {
  let app: Express;
  let token: string;

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const list = async (art: string): Promise<Json[]> =>
    (await request(app).get(`/api/entries?art=${encodeURIComponent(art)}`).set(auth()).expect(200)).body;
  const find = async (art: string, id: string): Promise<Json> => (await list(art)).find((entry) => entry.id === id)!;
  const pin = async (art: string, id: string) =>
    request(app).post('/api/entries/active').set(auth()).send(await find(art, id)).expect(200);
  const hide = (id: string, fields: string[]) =>
    request(app).post(`/api/entries/${id}/hidden`).set(auth()).send({ fields }).expect(200);
  const card = async (): Promise<Json | null> => (await request(app).get('/public/entry').expect(200)).body.card;

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
    await request(app).post('/api/characters/source').set(auth()).send({ source: 'worldbuilder' }).expect(200);
  });

  describe('listing', () => {
    it('offers the Arten of the world with their colors', async () => {
      const res = await request(app).get('/api/entries/arten').set(auth()).expect(200);
      expect(res.body).toEqual([
        { name: 'Figur', color: '#6f8fb0' },
        { name: 'Region', color: '#7f9c6b' },
      ]);
    });

    it('lists the entries of any Art, fields in the world’s order', async () => {
      const [saldor] = await list('Region');
      expect(saldor).toMatchObject({ title: 'Saldor', art: 'Region', artColor: '#7f9c6b', world: 'Testwelt', hidden: [] });

      const aldric = await find('Figur', 'e-aldric');
      expect((aldric.fields as Array<{ name: string }>).map((field) => field.name)).toEqual([
        'Rolle', 'Alter', 'Kurzbeschreibung', 'Stärken', 'Schwächen',
      ]);
    });

    it('leaves out discarded entries, so they cannot be put on stream', async () => {
      expect((await list('Figur')).map((entry) => entry.title)).toEqual(['Aldric', 'Mila']);
    });

    it('still reports a Notion source that is not set up', async () => {
      await request(app).post('/api/characters/source').set(auth()).send({ source: 'notion' }).expect(200);
      const res = await request(app).get('/api/entries').set(auth()).expect(400);
      expect(res.body.error).toBe('no_database');
    });
  });

  describe('the Entry Card', () => {
    it('puts a place on the Overlay', async () => {
      await pin('Region', 'e-saldor');

      expect(await card()).toMatchObject({
        title: 'Saldor',
        art: 'Region',
        artColor: '#7f9c6b',
        maturity: 'Idee',
        body: 'Eine Wüste voller gerader Straßen.',
        world: 'Testwelt',
        facts: [],
      });
    });

    it('builds a character from its fields: role and short description apart, the rest as facts', async () => {
      await pin('Figur', 'e-aldric');

      const shown = await card();
      expect(shown).toMatchObject({
        alias: 'Sturmklinge',
        role: 'Protagonist',
        aliasLine: 'genannt Sturmklinge · Protagonist',
        body: `Wanderer ohne Erinnerung — ${SPOILER}.`,
        facts: [
          { name: 'Alter', value: '31' },
          { name: 'Stärken', value: 'Zäh' },
          { name: 'Schwächen', value: 'Vergesslich' },
        ],
      });
      // An overlay in OBS can follow neither the token nor the CORS rule on the far side.
      expect(shown?.image).toMatch(/^\/public\/character-image\//);
    });

    it('refuses an entry without id or title', async () => {
      await request(app).post('/api/entries/active').set(auth()).send({ title: 'Ohne Id' }).expect(400);
      await request(app).post('/api/entries/active').set(auth()).send({ id: 'x' }).expect(400);
    });

    it('clears the Overlay', async () => {
      await pin('Region', 'e-saldor');
      await request(app).delete('/api/entries/active').set(auth()).expect(200);

      expect(await card()).toBeNull();
      expect((await request(app).get('/public/character').expect(200)).body.character).toBeNull();
    });
  });

  describe('keeping spoilers off stream', () => {
    it('never sends a hidden field to the Overlay, and lets the text step in', async () => {
      await pin('Figur', 'e-aldric');
      await hide('e-aldric', ['Kurzbeschreibung']);

      const shown = await card();
      expect(JSON.stringify(shown)).not.toContain(SPOILER);
      expect(shown?.body).toBe('Lange Vorgeschichte.');

      // The older character route reads the same card.
      const legacy = await request(app).get('/public/character').expect(200);
      expect(JSON.stringify(legacy.body)).not.toContain(SPOILER);
    });

    it('remembers hidden fields per entry, not per Art', async () => {
      await hide('e-aldric', ['Kurzbeschreibung']);

      expect((await find('Figur', 'e-aldric')).hidden).toEqual(['Kurzbeschreibung']);
      expect((await find('Figur', 'e-mila')).hidden).toEqual([]);

      await pin('Figur', 'e-mila');
      expect((await card())?.body).toBe('Kartografin.');
    });

    it('hides text, aliases and the portrait just like fields', async () => {
      await hide('e-aldric', ['Kurzbeschreibung', '@text', '@aliases', '@image']);
      await pin('Figur', 'e-aldric');

      expect(await card()).toMatchObject({ body: null, alias: null, aliasLine: 'Protagonist', image: null });
    });

    it('shows a field again once it is switched back on', async () => {
      await pin('Figur', 'e-aldric');
      await hide('e-aldric', ['Kurzbeschreibung']);
      await hide('e-aldric', []);

      expect((await card())?.body).toContain(SPOILER);
    });

    it('keeps a hidden field out of chat lookups too', async () => {
      await hide('e-aldric', ['Kurzbeschreibung']);

      const res = await request(app).post('/api/chat/try').set(auth()).send({ message: '!figur aldric' }).expect(200);
      expect(res.body.replies[0]).toContain('Aldric');
      expect(res.body.replies[0]).not.toContain(SPOILER);
    });
  });

  describe('relationships', () => {
    it('shows them grouped by how they read, leaving out discarded entries', async () => {
      await pin('Figur', 'e-aldric');

      expect((await card())?.relations).toEqual([
        { name: 'gehört zu', value: 'Der Orden' },
        { name: 'Freund von', value: 'Mila' },
      ]);
    });

    it('hides a relationship just like a field', async () => {
      await hide('e-aldric', ['@rel:Freund von']);
      await pin('Figur', 'e-aldric');

      expect((await card())?.relations).toEqual([{ name: 'gehört zu', value: 'Der Orden' }]);
    });
  });

  describe('what came before', () => {
    it('still shows a character pinned before Entries existed', async () => {
      const character = { id: 'old', name: 'Mila', role: 'Protagonistin', status: 'In Arbeit', summary: 'Von früher.', image: null };
      await request(app).post('/api/settings/set').set(auth()).send({ key: 'active_character', value: JSON.stringify(character) }).expect(200);

      expect(await card()).toMatchObject({ title: 'Mila', role: 'Protagonistin', body: 'Von früher.' });
      expect((await request(app).get('/public/character').expect(200)).body.character).toMatchObject({ name: 'Mila' });
    });

    it('lets the Stream Deck cycle through the characters', async () => {
      const first = await request(app).post('/api/characters/cycle').set(auth()).expect(200);
      const second = await request(app).post('/api/characters/cycle').set(auth()).expect(200);
      const third = await request(app).post('/api/characters/cycle').set(auth()).expect(200);

      // Thoral is discarded: the cycle goes round without him.
      expect([first, second, third].map((res) => res.body.character.name)).toEqual(['Aldric', 'Mila', 'Aldric']);
      expect((await card())?.title).toBe('Aldric');
    });
  });
});

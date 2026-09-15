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
 * Lookup Commands: viewers look up entries of the world by name.
 *
 * Worldbuilder is stood in for by a stub speaking the Schaufenster's routes,
 * as in `worldbuilder.test.ts`. What chat would get is read over
 * `/api/chat/try` — the path the bot takes.
 */

const TOKEN = 'lookup-token';
const CONNECTION = path.join(os.tmpdir(), `wb-lookup-${process.pid}.json`);

interface Entry {
  id: string;
  titel: string;
  art: string;
  reifegrad: string;
  zweitnamen: string[];
  text: string;
  werte: Record<string, string>;
  hatBild: boolean;
}

const entry = (id: string, titel: string, art: string, more: Partial<Entry> = {}): Entry => ({
  id,
  titel,
  art,
  reifegrad: 'Entwurf',
  zweitnamen: [],
  text: '',
  werte: {},
  hatBild: false,
  ...more,
});

const WORLD: Entry[] = [
  entry('f1', 'Selma „Silberzunge" Farrow', 'Figur', {
    werte: { Rolle: 'Protagonistin', Kurzbeschreibung: 'Handelt mit Geheimnissen.' },
  }),
  entry('f2', 'Mila', 'Figur', { zweitnamen: ['Die Graue'], text: 'Kartografin der Unterstadt.' }),
  entry('f3', 'Milana', 'Figur'),
  entry('f4', 'Samael', 'Figur'),
  entry('f5', 'Samira', 'Figur'),
  entry('f6', 'Thoral', 'Figur', { reifegrad: 'Verworfen', text: 'Gestrichen.' }),
  entry('r1', 'Saldor', 'Region', { text: 'Eine Wüstenstadt am Rand der Portale.' }),
  entry('r2', 'Jörm', 'Region'),
  entry('b1', 'Die Arche', 'Begriff', { text: 'Sie trägt, was die Flut nicht nehmen darf. '.repeat(20) }),
];

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

    if (first === 'welt') return json({ name: 'Die Verborgene Stadt', schemaVersion: 17 });
    if (first === 'arten') return json([...new Set(WORLD.map((e) => e.art))].map((name) => ({ name, farbe: '#888' })));
    if (first === 'eintraege') {
      const art = url.searchParams.get('art');
      return json(WORLD.filter((e) => !art || e.art === art).map(({ id, titel, art: a, reifegrad }) => ({ id, titel, art: a, reifegrad })));
    }
    if (first === 'eintrag') {
      const found = WORLD.find((e) => e.id === second);
      return found ? json(found) : json({ fehler: 'unbekannter_eintrag' }, 404);
    }
    return json({ fehler: 'unbekannter_weg' }, 404);
  });
  return new Promise((resolve) => stub.listen(0, '127.0.0.1', () => resolve((stub.address() as { port: number }).port)));
}

describe('lookup commands', () => {
  let app: Express;
  let token: string;

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const tryInChat = (message: string, as?: 'viewer') =>
    request(app).post('/api/chat/try').set(auth()).send({ message, as });
  const reply = async (message: string): Promise<string> => {
    const res = await tryInChat(message).expect(200);
    return (res.body.replies ?? []).join(' ');
  };
  const lookups = async (): Promise<Array<{ id: number; trigger: string; art: string }>> =>
    (await request(app).get('/api/lookup-commands').set(auth()).expect(200)).body;
  const mapTo = async (trigger: string, art: string) => {
    const lookup = (await lookups()).find((l) => l.trigger === trigger)!;
    await request(app).patch(`/api/lookup-commands/${lookup.id}`).set(auth()).send({ art }).expect(200);
  };

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

  beforeEach(() => {
    // A fresh database per test: starter set, no Text Commands, no renames.
    initDatabase(':memory:');
    process.env.WORLDBUILDER_ANSCHLUSS = CONNECTION;
  });

  it('start with Worldbuilder’s starter Arten', async () => {
    expect((await lookups()).map((l) => [l.trigger, l.art])).toEqual([
      ['!begriff', 'Konzept'],
      ['!figur', 'Figur'],
      ['!gilde', 'Fraktion'],
      ['!ort', 'Ort'],
    ]);
  });

  it('offer the Arten of the open world to pick from', async () => {
    const res = await request(app).get('/api/lookup-commands/arten').set(auth()).expect(200);
    expect(res.body).toEqual(['Figur', 'Region', 'Begriff']);
  });

  describe('finding', () => {
    it('finds an entry by part of its name, with role and short description', async () => {
      const text = await reply('!figur silberzunge');

      expect(text).toContain('Selma „Silberzunge" Farrow');
      expect(text).toContain('Protagonistin');
      expect(text).toContain('Handelt mit Geheimnissen.');
    });

    it('follows a changed Art at once, and ignores case and accents', async () => {
      await mapTo('!ort', 'Region');

      expect(await reply('!ort JORM')).toContain('Jörm');
    });

    it('prefers an exact name over names that merely contain it', async () => {
      const text = await reply('!figur mila');

      expect(text).toContain('Kartografin der Unterstadt.');
      expect(text).not.toContain('Milana');
    });

    it('finds an entry by an alias and shows the alias', async () => {
      expect(await reply('!figur die graue')).toContain('Mila („Die Graue“)');
    });

    it('names the candidates when a name is ambiguous', async () => {
      const text = await reply('!figur sam');

      expect(text).toContain('Samael');
      expect(text).toContain('Samira');
    });

    it('never finds what was discarded', async () => {
      const text = await reply('!figur thoral');

      expect(text).toContain('Kenne ich');
      expect(text).not.toContain('Gestrichen');
    });

    it('does not repeat what a viewer typed when nothing matches', async () => {
      const text = await reply('!figur Zyxwvut');

      expect(text).toContain('Kenne ich');
      expect(text).not.toContain('Zyxwvut');
    });
  });

  describe('answering', () => {
    it('answers in a single message, cut between words', async () => {
      await mapTo('!begriff', 'Begriff');

      const res = await tryInChat('!begriff arche').expect(200);
      expect(res.body.replies).toHaveLength(1);
      expect(res.body.replies[0].length).toBeLessThanOrEqual(500);
      expect(res.body.replies[0].endsWith('…')).toBe(true);
    });

    it('lists the entries of an Art when no name is given', async () => {
      await mapTo('!ort', 'Region');
      const text = await reply('!ort');

      expect(text).toContain('Saldor');
      expect(text).toContain('Jörm');
    });

    it('shows the character on the overlay for !figur without a name', async () => {
      await request(app)
        .post('/api/characters/active')
        .set(auth())
        .send({ id: 'f2', name: 'Mila', role: 'Kartografin' })
        .expect(200);

      const text = await reply('!figur');
      expect(text).toContain('Mila');
      expect(text).not.toContain('Samael');
    });

    it('tells chat kindly when the world is closed', async () => {
      process.env.WORLDBUILDER_ANSCHLUSS = path.join(os.tmpdir(), 'no-world-here.json');

      expect(await reply('!figur mila')).toContain('nicht geöffnet');
    });

    it('holds back the same name within the cooldown, but not a different one', async () => {
      await tryInChat('!figur selma', 'viewer').expect(200);

      const again = await tryInChat('!figur selma', 'viewer').expect(200);
      expect(again.body).toEqual({ replies: null, reason: 'cooldown' });

      const other = await tryInChat('!figur samael', 'viewer').expect(200);
      expect(other.body.replies[0]).toContain('Samael');
    });

    it('stays silent when switched off', async () => {
      const figur = (await lookups()).find((l) => l.trigger === '!figur')!;
      await request(app).patch(`/api/lookup-commands/${figur.id}`).set(auth()).send({ enabled: false }).expect(200);

      const res = await tryInChat('!figur mila').expect(200);
      expect(res.body).toEqual({ replies: null, reason: 'disabled' });
    });

    it('can be added for another Art', async () => {
      await request(app).post('/api/lookup-commands').set(auth()).send({ trigger: 'region', art: 'Region' }).expect(201);

      expect(await reply('!region saldor')).toContain('Wüstenstadt');
    });
  });

  describe('sharing triggers', () => {
    it('refuses a Lookup Command on a Text Command’s trigger', async () => {
      await request(app).post('/api/text-commands').set(auth()).send({ trigger: '!story', response: 'Text.' }).expect(201);

      const res = await request(app).post('/api/lookup-commands').set(auth()).send({ trigger: '!story', art: 'Figur' }).expect(409);
      expect(res.body.message).toContain('Erklär-Command');
    });

    it('refuses a Text Command on a Lookup Command’s trigger', async () => {
      const res = await request(app).post('/api/text-commands').set(auth()).send({ trigger: '!figur', response: 'Text.' }).expect(409);
      expect(res.body.message).toContain('Nachschlage-Command');
    });

    it('refuses renaming a built-in onto a Lookup Command', async () => {
      await request(app).post('/api/settings/commands').set(auth()).send({ challenge: '!ort' }).expect(409);
    });

    it('refuses a trigger a built-in already uses', async () => {
      await request(app).post('/api/lookup-commands').set(auth()).send({ trigger: '!song', art: 'Figur' }).expect(409);
    });
  });

  it('are listed in !befehle between the Text Commands and the built-ins', async () => {
    await request(app).post('/api/text-commands').set(auth()).send({ trigger: '!story', response: 'Text.' }).expect(201);

    expect(await reply('!befehle')).toMatch(/^📜 Befehle: !story · !begriff !figur !gilde !ort · !challenge/);
  });
});

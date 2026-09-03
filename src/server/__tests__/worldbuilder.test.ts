import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { initDatabase, getDb } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';

/**
 * Reading characters out of Worldbuilder instead of Notion.
 *
 * The far side is stood in for here by a stub speaking the same routes. That
 * makes this a test of *this* half — the mapping, the failure modes, the source
 * switch — and deliberately not proof that both halves agree on the protocol.
 * Only running the two real programs against each other shows that, and the
 * shapes below were copied from a run that did.
 */

const TOKEN = 'test-token-abc';
const CONNECTION = path.join(os.tmpdir(), `wb-anschluss-${process.pid}.json`);

const ALDRIC = {
  id: 'e-1',
  titel: 'Aldric',
  art: 'Figur',
  reifegrad: 'Kanon',
  zweitnamen: ['Sturmklinge'],
  text: 'Trägt die Sturmklinge.',
  werte: { Rolle: 'Protagonist' },
  hatBild: true,
};

const MILA = {
  id: 'e-2',
  titel: 'Mila',
  art: 'Figur',
  reifegrad: 'Entwurf',
  zweitnamen: [],
  text: '',
  werte: {},
  hatBild: false,
};

const ENTRIES = [ALDRIC, MILA];

/** A one-pixel PNG, so the portrait path carries real bytes with a real header. */
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02]);

let stub: http.Server;
let app: Express;
let token: string;

/** Stands in for Worldbuilder's Schaufenster: same routes, same token rule. */
function startStub(): Promise<number> {
  stub = http.createServer((req, res) => {
    if (req.headers.authorization !== `Bearer ${TOKEN}`) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ fehler: 'token_falsch' }));
      return;
    }
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const [first, second] = url.pathname.split('/').filter(Boolean);

    if (first === 'welt') return json(res, { name: 'Solmora', schemaVersion: 12 });
    if (first === 'eintraege') {
      const kind = url.searchParams.get('art');
      const list = ENTRIES.filter((e) => !kind || e.art === kind);
      return json(res, list.map(({ id, titel, art, reifegrad }) => ({ id, titel, art, reifegrad })));
    }
    if (first === 'eintrag') {
      const found = ENTRIES.find((e) => e.id === second);
      return found ? json(res, found) : json(res, { fehler: 'unbekannter_eintrag' }, 404);
    }
    if (first === 'bild' && second === ALDRIC.id) {
      res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': PNG.length });
      return res.end(PNG);
    }
    return json(res, { fehler: 'kein_bild' }, 404);
  });

  return new Promise((resolve) => {
    stub.listen(0, '127.0.0.1', () => resolve((stub.address() as { port: number }).port));
  });
}

function json(res: http.ServerResponse, body: unknown, status = 200): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text) });
  res.end(text);
}

function useWorldbuilder(): Promise<unknown> {
  return request(app).post('/api/characters/source').set(auth()).send({ source: 'worldbuilder' });
}

const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  const port = await startStub();
  fs.writeFileSync(CONNECTION, JSON.stringify({ version: 1, port, token: TOKEN, pid: process.pid }));
  process.env.WORLDBUILDER_ANSCHLUSS = CONNECTION;

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
  getDb().prepare('DELETE FROM settings WHERE key IN (?, ?)').run('character_source', 'worldbuilder_art');
  process.env.WORLDBUILDER_ANSCHLUSS = CONNECTION;
});

describe('characters from Worldbuilder', () => {
  it('stays on Notion until the source is switched', async () => {
    // An existing setup must not change behaviour because this code shipped.
    const res = await request(app).get('/api/characters/source').set(auth()).expect(200);
    expect(res.body.source).toBe('notion');
  });

  it('reads the world once switched over', async () => {
    await useWorldbuilder();

    const res = await request(app).get('/api/characters').set(auth()).expect(200);
    expect(res.body.map((c: { name: string }) => c.name)).toEqual(['Aldric', 'Mila']);
  });

  it('maps Reifegrad to status and the Rolle field to role', async () => {
    await useWorldbuilder();

    const res = await request(app).get('/api/characters').set(auth()).expect(200);
    expect(res.body[0]).toMatchObject({
      name: 'Aldric',
      role: 'Protagonist',
      status: 'Kanon',
      summary: 'Trägt die Sturmklinge.',
    });
  });

  it('falls back to the kind when the world has no Rolle field', async () => {
    await useWorldbuilder();

    const res = await request(app).get('/api/characters').set(auth()).expect(200);
    // Mila carries no fields — "Figur" is a truer answer than an empty line.
    expect(res.body[1]).toMatchObject({ name: 'Mila', role: 'Figur', summary: null });
  });

  it('names the connected world, so nobody streams the wrong one', async () => {
    await useWorldbuilder();

    const res = await request(app).get('/api/characters/source').set(auth()).expect(200);
    expect(res.body).toMatchObject({ source: 'worldbuilder', world: 'Solmora', kind: 'Figur' });
  });

  it('copies the portrait locally instead of pointing the overlay at Worldbuilder', async () => {
    await useWorldbuilder();
    const list = await request(app).get('/api/characters').set(auth()).expect(200);
    const aldric = list.body.find((c: { name: string }) => c.name === 'Aldric');

    const res = await request(app).post('/api/characters/active').set(auth()).send(aldric).expect(200);

    // An overlay in OBS can follow neither the token nor the CORS rule on the
    // far side. Whatever it ends up with has to be served by this app.
    expect(res.body.character.image).toMatch(/^\/public\/character-image\//);
  });

  it('reads a closed Worldbuilder as "not running", not as a fault', async () => {
    await useWorldbuilder();
    process.env.WORLDBUILDER_ANSCHLUSS = path.join(os.tmpdir(), 'nothing-here.json');

    const res = await request(app).get('/api/characters').set(auth()).expect(503);
    expect(res.body.error).toBe('worldbuilder_not_running');
  });

  it('refuses a source it does not have', async () => {
    await request(app)
      .post('/api/characters/source')
      .set(auth())
      .send({ source: 'obsidian' })
      .expect(400);
  });

  it('takes the kind of entry to read along with the source', async () => {
    await request(app)
      .post('/api/characters/source')
      .set(auth())
      .send({ source: 'worldbuilder', kind: 'Fraktion' })
      .expect(200);

    const res = await request(app).get('/api/characters/source').set(auth()).expect(200);
    expect(res.body.kind).toBe('Fraktion');
  });
});

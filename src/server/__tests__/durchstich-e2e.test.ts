import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';

/**
 * The only test that shows both halves agree on the protocol.
 *
 * Everything in `worldbuilder.test.ts` runs against a stub this repo wrote, so
 * it can only ever confirm this side's idea of it. This one talks to a
 * Worldbuilder that is really running — the thing to run after changing either
 * side.
 *
 * Skipped unless asked for, because it needs that second program:
 *
 *   # over in the worldbuilder repo, with a world open
 *   WORLDBUILDER_SCHAUFENSTER=1 pnpm dev
 *   # here
 *   WORLDBUILDER_E2E=1 npm test -- durchstich
 *
 * It expects a world holding a Figur "Aldric" (Kanon, a "Rolle" of
 * Protagonist, one image) and a Figur "Mila".
 */
describe.skipIf(!process.env.WORLDBUILDER_E2E)('Durchstich gegen das echte Schaufenster', () => {
  let app: Express;
  let token: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    initDatabase(':memory:');
    token = generateApiToken();
    app = createApp();
    await request(app).post('/api/characters/source').set(auth()).send({ source: 'worldbuilder' });
  });

  it('ist mit einer offenen Welt verbunden und nennt sie', async () => {
    const res = await request(app).get('/api/characters/source').set(auth()).expect(200);
    console.log('  QUELLE:', JSON.stringify(res.body));
    expect(res.body.source).toBe('worldbuilder');
    // Der Name bleibt offen: Es zählt, dass eine Welt drübersteht, nicht welche.
    expect(res.body.world).toBeTruthy();
  });

  it('liest die Figuren — und nur die Figuren', async () => {
    const res = await request(app).get('/api/characters').set(auth()).expect(200);
    console.log('  FIGUREN:', JSON.stringify(res.body, null, 2));
    const namen = res.body.map((c: { name: string }) => c.name);
    expect(namen).toContain('Aldric');
    expect(namen).toContain('Mila');
  });

  it('bringt Aldric samt Porträt auf das Overlay', async () => {
    const list = await request(app).get('/api/characters').set(auth()).expect(200);
    const aldric = list.body.find((c: { name: string }) => c.name === 'Aldric');

    await request(app).post('/api/characters/active').set(auth()).send(aldric).expect(200);

    const overlay = await request(app).get('/public/character').expect(200);
    console.log('  OVERLAY:', JSON.stringify(overlay.body.character, null, 2));
    expect(overlay.body.character).toMatchObject({
      name: 'Aldric',
      role: 'Protagonist',
      status: 'Kanon',
    });

    // Das Bild muss aus dieser Anwendung kommen, nicht aus Worldbuilder.
    const bildWeg = overlay.body.character.image as string;
    expect(bildWeg).toMatch(/^\/public\/character-image\//);

    const bild = await request(app).get(bildWeg).expect(200);
    // PNG-Kennung: Die Bytes sind wirklich durch die Weltdatei gegangen.
    expect(bild.body.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    console.log(`  BILD: ${bild.body.length} Bytes, PNG erkannt`);
  });
});

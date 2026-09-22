import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';

/**
 * `showcase` is a folder under src/overlays like any real overlay, but it is
 * the design-workflow's own preview harness, not something a stream scene
 * should ever point a browser source at. It must not appear as a 13th
 * built-in overlay in the app.
 */
describe('GET /api/overlays/builtin', () => {
  let app: Express;
  let token: string;

  beforeAll(() => {
    initDatabase(':memory:');
    token = generateApiToken();
    app = createApp();
  });

  it('excludes the showcase harness but lists real overlays', async () => {
    const res = await request(app)
      .get('/api/overlays/builtin')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const names = (res.body as Array<{ name: string }>).map((o) => o.name);
    expect(names).not.toContain('showcase');
    expect(names).toContain('character');
  });
});

/**
 * Express decodes `%2e%2e` in a route parameter into `..`. Before names were
 * checked against the built-in list, a reset of `..` removed the folder above
 * the overrides — the app's data, database included.
 */
describe('built-in overlay names from a request', () => {
  let app: Express;
  let token: string;

  beforeAll(() => {
    initDatabase(':memory:');
    token = generateApiToken();
    app = createApp();
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  it('refuses anything that is not a built-in overlay', async () => {
    for (const name of ['%2e%2e', '%2e%2e%2f%2e%2e', 'showcase', '_template', 'constructor']) {
      await request(app).delete(`/api/overlays/builtin/${name}/override`).set(auth()).expect(404);
      await request(app).put(`/api/overlays/builtin/${name}`).set(auth()).send({ html: '<p>x</p>' }).expect(404);
      await request(app).get(`/api/overlays/builtin/${name}/source`).set(auth()).expect(404);
      await request(app).get(`/api/overlays/builtin/${name}/default`).set(auth()).expect(404);
    }
  });

  it('still serves a real one', async () => {
    const res = await request(app).get('/api/overlays/builtin/character/default').set(auth()).expect(200);
    expect(res.body.html).toContain('data-overlay="character"');
  });
});


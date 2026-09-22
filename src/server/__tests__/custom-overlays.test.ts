import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';

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
    for (const name of ['%2e%2e', '%2e%2e%2f%2e%2e', '_template', 'constructor']) {
      await request(app).delete(`/api/overlays/builtin/${name}/override`).set(auth()).expect(404);
      await request(app).put(`/api/overlays/builtin/${name}`).set(auth()).send({ html: '<p>x</p>' }).expect(404);
      await request(app).get(`/api/overlays/builtin/${name}/source`).set(auth()).expect(404);
      await request(app).get(`/api/overlays/builtin/${name}/default`).set(auth()).expect(404);
    }
  });

  it('still serves a real one', async () => {
    const res = await request(app).get('/api/overlays/builtin/character/default').set(auth()).expect(200);
    expect(res.body.html).toContain('character');
  });
});

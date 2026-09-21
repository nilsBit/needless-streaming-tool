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

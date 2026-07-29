import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';

/**
 * Reference test for the HTTP seam — the single seam this project tests at.
 *
 * The setup below is the whole pattern: an in-memory database, a real API token,
 * and the real Express app from createApp(). Requests go through the actual
 * middleware chain, routers, and SQLite. Nothing is mocked, no port is bound.
 *
 * Copy this shape when testing a new endpoint. Assert on what a caller can
 * observe over HTTP — status codes and response bodies — never on internal
 * function calls or by querying the database directly.
 */
describe('HTTP seam', () => {
  let app: Express;
  let token: string;

  beforeAll(() => {
    initDatabase(':memory:');
    token = generateApiToken();
    app = createApp();
  });

  it('rejects API requests that carry no token', async () => {
    await request(app).get('/api/health').expect(401);
  });

  it('accepts API requests authenticated with a bearer token', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.status).toBe('ok');
  });

  it('serves a newly created issue to overlays without requiring a token', async () => {
    // The path a Stream Deck bug button takes: authenticated write, then the
    // overlay reads it back over the public endpoint.
    const created = await request(app)
      .post('/api/issues')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Overlay flickers on scene switch' })
      .expect(201);

    expect(created.body.status).toBe('open');

    const overlayView = await request(app).get('/public/issues').expect(200);
    const titles = (overlayView.body as Array<{ title: string }>).map((issue) => issue.title);

    expect(titles).toContain('Overlay flickers on scene switch');
  });

  it('refuses to create an issue with no title', async () => {
    await request(app)
      .post('/api/issues')
      .set('Authorization', `Bearer ${token}`)
      .send({ description: 'no title given' })
      .expect(400);
  });
});

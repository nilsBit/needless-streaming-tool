import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';

describe('overlay config after the Lexikon migration', () => {
  let app: Express;
  let token: string;

  beforeAll(() => {
    initDatabase(':memory:');
    token = generateApiToken();
    app = createApp();
  });

  it('serves the Lexikon palette to overlays without a token', async () => {
    const res = await request(app).get('/public/overlay-config').expect(200);

    expect(res.body.global['--color-bg']).toBe('#0e0c0a');
    expect(res.body.global['--color-text']).toBe('#e1d6c2');
    expect(res.body.global['--color-accent']).toBe('#c9a45c');
    expect(res.body.global['--font-body']).toBe("'Source Serif 4', Georgia, serif");
  });

  it('keeps per-overlay overrides that were set by hand', async () => {
    await request(app)
      .post('/api/overlay-config')
      .set('Authorization', `Bearer ${token}`)
      .send({ global: { '--color-accent': '#c9a45c' }, overrides: { song: { '--color-accent': '#ff0000' } } })
      .expect(200);

    const res = await request(app).get('/public/overlay-config').expect(200);
    expect(res.body.overrides.song['--color-accent']).toBe('#ff0000');
  });
});

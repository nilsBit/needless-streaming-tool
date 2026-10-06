import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';

// The API token travels in the Authorization header and nowhere else.
describe('API token', () => {
  let app: Express;
  let token: string;

  beforeAll(() => {
    initDatabase(':memory:');
    token = generateApiToken();
    app = createApp();
  });

  it('is accepted in the header and refused in the query string', async () => {
    await request(app).get('/api/health').set('Authorization', `Bearer ${token}`).expect(200);
    await request(app).get(`/api/health?token=${token}`).expect(401);
    await request(app).get('/api/health').set('Authorization', `Bearer ${token.slice(0, -1)}x`).expect(401);
    await request(app).get('/api/health').set('Authorization', `Bearer ${token.slice(0, 10)}`).expect(401);
  });
});

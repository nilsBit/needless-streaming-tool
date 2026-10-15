import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';

// Security review 15.10.: an unexpected error answers without a stack trace
// (it carried paths with the Windows user name), and the public top list
// takes only one plain type.
describe('error answers', () => {
  let app: Express;

  beforeAll(() => {
    initDatabase(':memory:');
    generateApiToken();
    app = createApp();
  });

  it('refuses a list of types on the public top list instead of throwing', async () => {
    const res = await request(app).get('/public/reward-stats/top?type=a&type=b');
    expect(res.status).toBe(400);
    expect(res.text).not.toMatch(/at |\\|stream-toolkit/);
  });

  it('answers a thrown error with a plain sentence, no stack', async () => {
    const res = await request(app).get('/public/reward-stats/top?type[x]=1');
    expect(res.status).toBeLessThan(500);
    expect(res.text).not.toContain('RangeError');
  });
});

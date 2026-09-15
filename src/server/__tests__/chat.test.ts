import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';

/**
 * Built-in answers that have no side effects, read the way chat would get
 * them — over `/api/chat/try`.
 *
 * OBS is never connected here, so these cover the offline path; the live
 * path reads OBS's own stream timecode.
 */
describe('chat', () => {
  let app: Express;
  let token: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const tryInChat = (message: string) => request(app).post('/api/chat/try').set(auth()).send({ message });

  beforeAll(() => {
    initDatabase(':memory:');
    token = generateApiToken();
    app = createApp();
  });

  it('!uptime says the stream is offline instead of counting from when the app started', async () => {
    const res = await tryInChat('!uptime').expect(200);
    expect(res.body.replies).toEqual(['⏱️ Gerade wird nicht gestreamt.']);
  });

  it('!uptime follows a rename', async () => {
    await request(app).post('/api/settings/commands').set(auth()).send({ uptime: '!live' }).expect(200);

    const res = await tryInChat('!live').expect(200);
    expect(res.body.replies).toEqual(['⏱️ Gerade wird nicht gestreamt.']);
  });
});

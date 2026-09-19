import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';

/**
 * The song overlay only hears about a song when it changes. A browser source
 * loaded or refreshed mid-song has to ask what is playing, or it stays empty
 * until the next track.
 */
describe('song overlay', () => {
  let app: Express;
  let token: string;

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const setSong = (song: Record<string, string>) => request(app).post('/api/actions/song').set(auth()).send(song).expect(200);

  beforeAll(() => {
    initDatabase(':memory:');
    token = generateApiToken();
    app = createApp();
  });

  beforeEach(() => {
    initDatabase(':memory:');
  });

  it('tells a freshly loaded overlay what is playing, without a token', async () => {
    await setSong({ title: 'Fallout', artist: 'Sleep Theory' });

    const res = await request(app).get('/public/song').expect(200);
    expect(res.body.song).toMatchObject({ title: 'Fallout', artist: 'Sleep Theory' });
  });

  it('says nothing is playing once the song is cleared', async () => {
    await setSong({ title: 'Fallout' });
    await setSong({});

    const res = await request(app).get('/public/song').expect(200);
    expect(res.body.song).toBeNull();
  });
});

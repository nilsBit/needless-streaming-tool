import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { initDatabase } from '../db/index';
import { createApp } from '../index';
import { keepSongArt } from '../integrations/smtc';

/**
 * The cover of the song playing now (Windows media session) is served at an
 * address the song carries, instead of travelling base64 to every window and
 * overlay (08.10.). A new cover is a new address.
 */
describe('the song cover', () => {
  let app: Express;
  beforeAll(() => {
    initDatabase(':memory:');
    app = createApp();
  });

  it('is served at the address the song carries, and a new cover gets a new one', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    const url = keepSongArt(png);
    expect(url).toMatch(/^\/public\/song-art\?v=[0-9a-f]{12}$/);
    const res = await request(app).get(url).expect(200);
    expect(res.headers['content-type']).toMatch(/image\/png/);
    expect(Buffer.from(res.body).equals(Buffer.from(png))).toBe(true);
    expect(keepSongArt(new Uint8Array([0xff, 0xd8, 9]))).not.toBe(url);
  });
});

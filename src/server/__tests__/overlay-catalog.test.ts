import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';

// The overlay list the app shows: German names, groups, sizes from the
// showcase, the state that stands in as preview — and whether an overlay still
// has its default layout, because only then the preview shows sample data.

describe('overlay catalog', () => {
  let app: Express;
  let token: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(() => {
    initDatabase(':memory:');
    token = generateApiToken();
    app = createApp();
  });

  it('lists the built-in overlays with names, groups, sizes and a preview state', async () => {
    const res = await request(app).get('/api/overlays/catalog').set(auth()).expect(200);
    const byName = Object.fromEntries(res.body.map((e: { name: string }) => [e.name, e]));

    expect(byName.character.label).toBe('Eintragskarte');
    expect(byName.character.group).toBe('always');
    expect(byName.character.size).toEqual({ width: 800, height: 700 });
    expect(byName.character.previewState).toBe('with-portrait');
    expect(byName.character.url).toMatch(/\/overlay\/character\/index\.html$/);
    expect(byName.song.label).toBe('Musik');
    expect(byName.start.group).toBe('screens');
    // The song queue overlay was dropped on 2026-10-06; !sr and !queue stay.
    expect(byName['song-queue']).toBeUndefined();
    for (const entry of res.body) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.builtin).toBe(true);
    }
  });

  it('keeps the groups in the order the page shows them', async () => {
    const res = await request(app).get('/api/overlays/catalog').set(auth()).expect(200);
    const groups = res.body.map((e: { group: string }) => e.group);
    const firstIndex = (g: string) => groups.indexOf(g);
    expect(firstIndex('always')).toBeLessThan(firstIndex('join'));
    expect(firstIndex('join')).toBeLessThan(firstIndex('today'));
    expect(firstIndex('today')).toBeLessThan(firstIndex('screens'));
    expect(firstIndex('screens')).toBeLessThan(firstIndex('alerts'));
  });

  it('calls an overlay customized once it carries its own palette values', async () => {
    const before = await request(app).get('/api/overlays/catalog').set(auth()).expect(200);
    expect(before.body.find((e: { name: string }) => e.name === 'song').customized).toBe(false);

    await request(app)
      .post('/api/overlay-config')
      .set(auth())
      .send({ global: {}, overrides: { song: { '--color-accent': '#ff0000' } } })
      .expect(200);

    const after = await request(app).get('/api/overlays/catalog').set(auth()).expect(200);
    const song = after.body.find((e: { name: string }) => e.name === 'song');
    expect(song.customized).toBe(true);
    expect(song.customizedBy).toEqual(['palette']);
    expect(after.body.find((e: { name: string }) => e.name === 'chat').customized).toBe(false);
  });
});

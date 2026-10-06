import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';
import { visibleOverlays, overlaysByScene, overlayNameFromUrl } from '../obs/visible-overlays';

// "in der Szene / nicht in der Szene": which overlays the current OBS scene shows.
// The walk over scene items runs against a stand-in for OBS, the way the
// overlay refresh is tested; the route is checked over HTTP while nothing
// is connected.

const PORT = 4000;

function fakeObs() {
  const scenes: Record<string, Array<{ sourceName: string; sceneItemEnabled: boolean; isGroup?: boolean; sourceType?: string }>> = {
    main: [
      { sourceName: 'kamera', sceneItemEnabled: true, sourceType: 'OBS_SOURCE_TYPE_INPUT' },
      { sourceName: 'roulette', sceneItemEnabled: true, sourceType: 'OBS_SOURCE_TYPE_INPUT' },
      { sourceName: 'poll', sceneItemEnabled: false, sourceType: 'OBS_SOURCE_TYPE_INPUT' },
      { sourceName: 'Einblendungen', sceneItemEnabled: true, isGroup: true },
      { sourceName: 'Musikgruppe', sceneItemEnabled: false, isGroup: true },
      { sourceName: 'Unterszene', sceneItemEnabled: true, sourceType: 'OBS_SOURCE_TYPE_SCENE' },
      { sourceName: 'streamelements', sceneItemEnabled: true, sourceType: 'OBS_SOURCE_TYPE_INPUT' },
      { sourceName: 'bestenliste', sceneItemEnabled: true, sourceType: 'OBS_SOURCE_TYPE_INPUT' },
    ],
    Unterszene: [
      { sourceName: 'karteKompakt', sceneItemEnabled: true, sourceType: 'OBS_SOURCE_TYPE_INPUT' },
      { sourceName: 'main', sceneItemEnabled: true, sourceType: 'OBS_SOURCE_TYPE_SCENE' }, // a loop
    ],
  };
  const groups: Record<string, Array<{ sourceName: string; sceneItemEnabled: boolean }>> = {
    Einblendungen: [
      { sourceName: 'alerts', sceneItemEnabled: true },
      { sourceName: 'milestone', sceneItemEnabled: false },
    ],
    Musikgruppe: [{ sourceName: 'song', sceneItemEnabled: true }],
  };
  const urls: Record<string, string | undefined> = {
    roulette: `http://localhost:${PORT}/overlay/roulette/index.html`,
    poll: `http://localhost:${PORT}/overlay/poll/index.html`,
    alerts: `http://127.0.0.1:${PORT}/overlay/alerts/index.html?x=1`,
    milestone: `http://localhost:${PORT}/overlay/milestone/index.html`,
    song: `http://localhost:${PORT}/overlay/song/index.html`,
    karteKompakt: `http://localhost:${PORT}/overlay/character/index.html?compact=1`,
    streamelements: 'https://streamelements.com/overlay/abc',
    kamera: undefined,
    bestenliste: `http://localhost:${PORT}/overlay/reward-leaderboard/index.html?type=flex`,
  };
  return {
    async call(request: string, data?: Record<string, unknown>) {
      const name = String(data?.sceneName ?? data?.inputName ?? '');
      if (request === 'GetSceneList') return { scenes: Object.keys(scenes).map((sceneName) => ({ sceneName })) };
      if (request === 'GetSceneItemList') return { sceneItems: scenes[name] ?? [] };
      if (request === 'GetGroupSceneItemList') return { sceneItems: groups[name] ?? [] };
      if (request === 'GetInputSettings') {
        if (!(name in urls)) throw new Error('not an input');
        return { inputSettings: { url: urls[name] } };
      }
      throw new Error('unexpected ' + request);
    },
  };
}

describe('visible overlays', () => {
  it('names the enabled own browser sources of a scene, through groups and nested scenes', async () => {
    const names = await visibleOverlays(fakeObs(), PORT, 'main');
    expect(names).toEqual(['alerts', 'character', 'reward-leaderboard:flex', 'roulette']);
  });

  it('tells for every overlay in which scenes it sits, enabled or not', async () => {
    const placed = await overlaysByScene(fakeObs(), PORT);
    // "Unterszene" nests "main" as a source, so everything in main counts as placed there too.
    expect(placed.roulette).toEqual(['main', 'Unterszene']);
    expect(placed.poll).toEqual(['main', 'Unterszene']);     // placed, just switched off
    expect(placed.song).toEqual(['main', 'Unterszene']);     // inside a disabled group
    expect(placed.character).toEqual(['main', 'Unterszene']);
    expect(placed['reward-leaderboard:flex']).toEqual(['main', 'Unterszene']);
    expect(placed.kamera).toBeUndefined();
    expect(placed.streamelements).toBeUndefined();
  });

  it('reads the overlay name from the url and ignores foreign sources', () => {
    expect(overlayNameFromUrl(`http://localhost:${PORT}/overlay/todos/index.html`, PORT)).toBe('todos');
    expect(overlayNameFromUrl(`http://localhost:${PORT}/overlay/custom/mein-overlay/index.html`, PORT)).toBe('custom/mein-overlay');
    // A Bestenliste overlay is one source per list: the key rides in ?type=.
    expect(overlayNameFromUrl(`http://localhost:${PORT}/overlay/reward-rankchange/index.html?type=angeben`, PORT)).toBe('reward-rankchange:angeben');
    expect(overlayNameFromUrl(`http://localhost:${PORT}/public/song`, PORT)).toBeNull();
    expect(overlayNameFromUrl('https://streamelements.com/overlay/abc', PORT)).toBeNull();
    expect(overlayNameFromUrl(undefined, PORT)).toBeNull();
  });

  describe('over HTTP', () => {
    let app: Express;
    let token: string;

    beforeAll(() => {
      initDatabase(':memory:');
      token = generateApiToken();
      app = createApp();
    });

    it('answers with no placement while OBS is out of reach', async () => {
      const res = await request(app).get('/api/obs/overlay-scenes').set('Authorization', `Bearer ${token}`).expect(200);
      expect(res.body).toEqual({ connected: false, byOverlay: {} });
    });

    it('answers with no scene and no overlays while OBS is out of reach', async () => {
      const res = await request(app).get('/api/obs/visible-overlays').set('Authorization', `Bearer ${token}`).expect(200);
      expect(res.body).toEqual({ scene: null, overlays: [] });
    });
  });
});

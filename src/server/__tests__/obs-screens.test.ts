import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';
import { createScreenScenes } from '../obs/screens';

/**
 * The start, pause and end screens each want a scene of their own. Building
 * three scenes by hand — and the same chat and music into each — is the kind
 * of setup that keeps a stream from starting, so the app does it.
 */
describe('creating the screen scenes in OBS', () => {
  type Transform = Record<string, unknown>;
  type Item = { sceneItemId: number; sourceName: string; sceneItemTransform: Transform };
  type Input = { kind: string; settings: Record<string, unknown> };

  const AT_ORIGIN: Transform = {
    positionX: 0, positionY: 0, scaleX: 1, scaleY: 1, rotation: 0, alignment: 5,
    cropLeft: 0, cropRight: 0, cropTop: 0, cropBottom: 0,
    boundsType: 'OBS_BOUNDS_NONE', boundsAlignment: 0, boundsWidth: 0, boundsHeight: 0,
    // What OBS reports and refuses to take back.
    sourceWidth: 1920, sourceHeight: 1080, width: 1920, height: 1080,
  };

  /** OBS as far as these requests go: scenes hold items, items point at inputs. */
  function fakeObs(scenes: Record<string, { source: string; at?: Transform }[]>, inputs: Record<string, Input>) {
    let nextId = 1;
    const state = new Map<string, Item[]>();
    for (const [scene, items] of Object.entries(scenes)) {
      state.set(scene, items.map((i) => ({ sceneItemId: nextId++, sourceName: i.source, sceneItemTransform: { ...AT_ORIGIN, ...i.at } })));
    }
    const add = (scene: string, sourceName: string, transform: Transform = AT_ORIGIN): number => {
      const item = { sceneItemId: nextId++, sourceName, sceneItemTransform: { ...transform } };
      state.get(scene)!.push(item);
      return item.sceneItemId;
    };

    return {
      /** Bottom to top, with where each one sits. */
      layout(scene: string) {
        return (state.get(scene) ?? []).map((i) => ({
          source: i.sourceName,
          x: i.sceneItemTransform.positionX,
          y: i.sceneItemTransform.positionY,
          scale: i.sceneItemTransform.scaleX,
        }));
      },
      scenes: () => [...state.keys()],
      input: (name: string) => inputs[name],
      async call(req: string, data: Record<string, unknown> = {}) {
        const scene = data.sceneName as string;
        switch (req) {
          case 'GetSceneList':
            return { scenes: [...state.keys()].map((sceneName) => ({ sceneName })) };
          case 'GetSceneItemList':
            return {
              sceneItems: state.get(scene)!.map((item, sceneItemIndex) => ({
                ...item,
                sceneItemIndex,
                inputKind: inputs[item.sourceName]?.kind ?? null,
              })),
            };
          case 'GetInputList':
            return { inputs: Object.entries(inputs).map(([inputName, i]) => ({ inputName, inputKind: i.kind })) };
          case 'GetInputSettings':
            return { inputSettings: inputs[data.inputName as string]?.settings ?? {} };
          case 'GetVideoSettings':
            return { baseWidth: 1920, baseHeight: 1080 };
          case 'CreateScene':
            if (state.has(scene)) throw new Error('A source already exists by that scene name.');
            state.set(scene, []);
            return {};
          case 'CreateInput': {
            const name = data.inputName as string;
            if (inputs[name] || state.has(name)) throw new Error('A source already exists by that input name.');
            inputs[name] = { kind: data.inputKind as string, settings: data.inputSettings as Record<string, unknown> };
            return { sceneItemId: add(scene, name) };
          }
          case 'CreateSceneItem':
            return { sceneItemId: add(scene, data.sourceName as string) };
          case 'DuplicateSceneItem': {
            const original = state.get(scene)!.find((i) => i.sceneItemId === data.sceneItemId)!;
            return { sceneItemId: add(data.destinationSceneName as string, original.sourceName, original.sceneItemTransform) };
          }
          case 'SetSceneItemTransform': {
            const transform = data.sceneItemTransform as Transform;
            // The real thing rejects both: its own read-only fields, and bounds of 0.
            for (const key of ['sourceWidth', 'sourceHeight', 'width', 'height']) {
              if (key in transform) throw new Error(`${key} is read-only`);
            }
            if ('boundsWidth' in transform && (transform.boundsWidth as number) < 1) throw new Error('boundsWidth is below the minimum of 1');
            const item = state.get(scene)!.find((i) => i.sceneItemId === data.sceneItemId)!;
            Object.assign(item.sceneItemTransform, transform);
            return {};
          }
          default:
            throw new Error(`unexpected request: ${req}`);
        }
      },
    };
  }

  const browser = (url: string, width = 1920, height = 1080): Input => ({ kind: 'browser_source', settings: { url, width, height } });

  /** The scenes as they stood before there was a start or an end screen. */
  function obsWithPauseScene() {
    return fakeObs(
      {
        main: [{ source: 'screen' }, { source: 'chat', at: { positionX: 540, positionY: 777 } }],
        brb: [
          { source: 'pause' },
          { source: 'chat', at: { positionX: 1400, positionY: 300 } },
          { source: 'music', at: { positionX: 1400, positionY: 820, scaleX: 0.875, scaleY: 0.875 } },
        ],
      },
      {
        screen: { kind: 'monitor_capture', settings: {} },
        pause: browser('http://localhost:4000/overlay/pause/index.html'),
        chat: browser('http://localhost:4000/overlay/chat/index.html', 480, 304),
        music: browser('http://localhost:4000/overlay/song/index.html', 350, 110),
      },
    );
  }

  it('gives an OBS without any of them a scene for each screen, filling the picture', async () => {
    const obs = fakeObs({ Szene: [] }, {});

    const result = await createScreenScenes(obs, 4000);

    expect(result).toEqual([
      { overlay: 'start', scene: 'start', status: 'created' },
      { overlay: 'pause', scene: 'brb', status: 'created' },
      { overlay: 'end', scene: 'end', status: 'created' },
    ]);
    expect(obs.layout('start')).toEqual([{ source: 'startScreen', x: 0, y: 0, scale: 1 }]);
    expect(obs.input('startScreen')).toEqual({
      kind: 'browser_source',
      settings: { url: 'http://localhost:4000/overlay/start/index.html', width: 1920, height: 1080 },
    });
    expect(obs.input('endScreen').settings.url).toBe('http://localhost:4000/overlay/end/index.html');
  });

  it('builds start and end like the pause scene that is already there: same chat, same music, same places', async () => {
    const obs = obsWithPauseScene();

    const result = await createScreenScenes(obs, 4000);

    expect(result).toEqual([
      { overlay: 'start', scene: 'start', status: 'created' },
      { overlay: 'pause', scene: 'brb', status: 'exists' },
      { overlay: 'end', scene: 'end', status: 'created' },
    ]);
    for (const [scene, page] of [['start', 'startScreen'], ['end', 'endScreen']]) {
      expect(obs.layout(scene), scene).toEqual([
        { source: page, x: 0, y: 0, scale: 1 },
        { source: 'chat', x: 1400, y: 300, scale: 1 },
        { source: 'music', x: 1400, y: 820, scale: 0.875 },
      ]);
    }
    expect(obs.input('startScreen').settings).toEqual({ url: 'http://localhost:4000/overlay/start/index.html', width: 1920, height: 1080 });
  });

  it('puts the new page where the pause page sits, even when that is not the corner', async () => {
    const obs = fakeObs(
      { brb: [{ source: 'pause', at: { positionX: 100, positionY: 50, scaleX: 0.5, scaleY: 0.5 } }] },
      { pause: browser('http://127.0.0.1:4000/overlay/pause/index.html', 1280, 720) },
    );

    await createScreenScenes(obs, 4000);

    expect(obs.layout('end')).toEqual([{ source: 'endScreen', x: 100, y: 50, scale: 0.5 }]);
    expect(obs.input('endScreen').settings).toEqual({ url: 'http://127.0.0.1:4000/overlay/end/index.html', width: 1280, height: 720 });
  });

  it('leaves everything as it is when asked a second time', async () => {
    const obs = obsWithPauseScene();
    await createScreenScenes(obs, 4000);
    const before = obs.scenes().map((s) => obs.layout(s));

    const result = await createScreenScenes(obs, 4000);

    expect(result.map((r) => r.status)).toEqual(['exists', 'exists', 'exists']);
    expect(obs.scenes().map((s) => obs.layout(s))).toEqual(before);
  });

  it('finds a screen under whatever name its scene has', async () => {
    const obs = fakeObs(
      { 'Gleich da': [{ source: 'intro' }] },
      { intro: browser('http://localhost:4000/overlay/start') },
    );

    const result = await createScreenScenes(obs, 4000);

    expect(result[0]).toEqual({ overlay: 'start', scene: 'Gleich da', status: 'exists' });
    expect(obs.scenes()).not.toContain('start');
  });

  it('does not touch a scene that has the name but shows something else', async () => {
    const obs = fakeObs({ start: [{ source: 'screen' }] }, { screen: { kind: 'monitor_capture', settings: {} } });

    const result = await createScreenScenes(obs, 4000);

    expect(result[0]).toEqual({ overlay: 'start', scene: 'start', status: 'taken' });
    expect(obs.layout('start')).toEqual([{ source: 'screen', x: 0, y: 0, scale: 1 }]);
  });

  it('does not mistake another service on a different port for one of the screens', async () => {
    const obs = fakeObs(
      { brb: [{ source: 'other' }] },
      { other: browser('http://localhost:9000/overlay/pause/index.html') },
    );

    const result = await createScreenScenes(obs, 4000);

    expect(result[1]).toEqual({ overlay: 'pause', scene: 'brb', status: 'taken' });
  });
});

describe('POST /api/obs/screens', () => {
  let app: Express;
  let token: string;

  beforeAll(() => {
    initDatabase(':memory:');
    token = generateApiToken();
    app = createApp();
  });

  it('says so when OBS is not connected, instead of pretending', async () => {
    const res = await request(app).post('/api/obs/screens').set('Authorization', `Bearer ${token}`).expect(503);

    expect(res.body.error).toMatch(/OBS/);
  });

  it('is not for anyone without the token', async () => {
    await request(app).post('/api/obs/screens').expect(401);
  });
});

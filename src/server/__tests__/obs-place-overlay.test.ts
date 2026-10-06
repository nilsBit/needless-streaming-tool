import { describe, it, expect } from 'vitest';
import { placeOverlay } from '../obs/place-overlay';

// "In OBS anlegen": the overlay becomes a browser source in the chosen scene,
// sized as the catalog says, named so it does not collide with the streamer's
// own sources. What already lies somewhere is left alone. OBS is a stand-in.

type Item = { sourceName: string; sceneItemEnabled: boolean; isGroup: boolean; sourceType: string };

function fakeObs(scenes: Record<string, Item[]>, urls: Record<string, string>, inputs: string[] = []) {
  const created: Record<string, unknown>[] = [];
  const added: Record<string, unknown>[] = [];
  return {
    created,
    added,
    async call(request: string, data?: Record<string, unknown>) {
      switch (request) {
        case 'GetSceneList': return { scenes: Object.keys(scenes).map((sceneName) => ({ sceneName })) };
        case 'GetSceneItemList': return { sceneItems: scenes[data!.sceneName as string] ?? [] };
        case 'GetInputSettings': {
          const url = urls[data!.inputName as string];
          if (!url) throw new Error('not an input');
          return { inputSettings: { url } };
        }
        case 'GetInputList': return { inputs: inputs.map((inputName) => ({ inputName })) };
        case 'GetVideoSettings': return { baseWidth: 1920, baseHeight: 1080 };
        case 'CreateInput': created.push(data!); return { sceneItemId: 7 };
        case 'CreateSceneItem': added.push(data!); return { sceneItemId: 8 };
        default: throw new Error(`unexpected request: ${request}`);
      }
    },
  };
}

const item = (sourceName: string): Item => ({ sourceName, sceneItemEnabled: true, isGroup: false, sourceType: 'OBS_SOURCE_TYPE_INPUT' });

describe('placing an overlay in OBS', () => {
  it('creates a browser source with the catalog size in the chosen scene', async () => {
    const obs = fakeObs({ main: [item('Camera')], brb: [] }, { Camera: 'rtsp://cam' });
    const result = await placeOverlay(obs, 4000, { name: 'chat', label: 'Chat', size: { width: 420, height: 620 } }, 'main');
    expect(result).toEqual({ overlay: 'chat', scene: 'main', status: 'created', inputName: 'NST Chat' });
    expect(obs.created).toEqual([{
      sceneName: 'main',
      inputName: 'NST Chat',
      inputKind: 'browser_source',
      inputSettings: { url: 'http://localhost:4000/overlay/chat/index.html', width: 420, height: 620 },
    }]);
  });

  it('takes the canvas size when the catalog knows none', async () => {
    const obs = fakeObs({ main: [] }, {});
    await placeOverlay(obs, 4000, { name: 'alerts', label: 'Alerts', size: null }, 'main');
    expect(obs.created[0]).toMatchObject({ inputSettings: { width: 1920, height: 1080 } });
  });

  it('reports where the overlay already sits instead of placing it twice', async () => {
    const obs = fakeObs({ main: [item('music')], Camera: [] }, { music: 'http://localhost:4000/overlay/song/index.html' });
    const result = await placeOverlay(obs, 4000, { name: 'song', label: 'Musik', size: { width: 350, height: 110 } }, 'Camera');
    expect(result).toEqual({ overlay: 'song', scene: 'main', status: 'exists' });
    expect(obs.created).toEqual([]);
  });

  it('adds an existing source of ours to the scene rather than a second input', async () => {
    const obs = fakeObs({ main: [], brb: [] }, {}, ['NST Chat']);
    const result = await placeOverlay(obs, 4000, { name: 'chat', label: 'Chat', size: { width: 420, height: 620 } }, 'brb');
    expect(result.status).toBe('created');
    expect(obs.created).toEqual([]);
    expect(obs.added).toEqual([{ sceneName: 'brb', sourceName: 'NST Chat' }]);
  });

  it('refuses a scene OBS does not have', async () => {
    const obs = fakeObs({ main: [] }, {});
    const result = await placeOverlay(obs, 4000, { name: 'chat', label: 'Chat', size: null }, 'Studio');
    expect(result.status).toBe('no-scene');
    expect(obs.created).toEqual([]);
  });
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import { refreshOwnBrowserSources } from '../obs/refresh-overlays';

/**
 * A browser source that was loaded while our server was down stays blank
 * forever: the page never loaded, so none of its own reconnect code runs.
 * OBS does not retry on its own either. So once we reach OBS, we reload every
 * browser source that points at us — and only those.
 */
describe('reloading our own browser sources', () => {
  afterEach(() => vi.restoreAllMocks());

  type Input = { inputName: string; inputKind: string };

  function fakeObs(inputs: Input[], settings: Record<string, { url?: string }>, failOn: string[] = []) {
    const reloaded: { inputName: string; propertyName: string }[] = [];
    return {
      reloaded,
      async call(request: string, data?: Record<string, string>) {
        if (request === 'GetInputList') return { inputs };
        if (request === 'GetInputSettings') return { inputSettings: settings[data!.inputName] ?? {} };
        if (request === 'PressInputPropertiesButton') {
          if (failOn.includes(data!.inputName)) throw new Error('source is gone');
          reloaded.push({ inputName: data!.inputName, propertyName: data!.propertyName });
          return {};
        }
        throw new Error(`unexpected request: ${request}`);
      },
    };
  }

  it('reloads a browser source that points at our overlay server', async () => {
    const obs = fakeObs(
      [{ inputName: 'music', inputKind: 'browser_source' }],
      { music: { url: 'http://localhost:4000/overlay/song/index.html' } }
    );

    await refreshOwnBrowserSources(obs, 4000);

    expect(obs.reloaded).toEqual([{ inputName: 'music', propertyName: 'refreshnocache' }]);
  });

  it('leaves browser sources of other services alone', async () => {
    const obs = fakeObs(
      [
        { inputName: 'music', inputKind: 'browser_source' },
        { inputName: 'pauseChat', inputKind: 'browser_source' },
      ],
      {
        music: { url: 'http://localhost:4000/overlay/song/index.html' },
        pauseChat: { url: 'https://streamelements.com/overlay/67db0b6f/rvzAQZEO' },
      }
    );

    await refreshOwnBrowserSources(obs, 4000);

    expect(obs.reloaded.map((r) => r.inputName)).toEqual(['music']);
  });

  it('keeps reloading the rest when one source refuses', async () => {
    const obs = fakeObs(
      [
        { inputName: 'activeElementInStory', inputKind: 'browser_source' },
        { inputName: 'music', inputKind: 'browser_source' },
      ],
      {
        activeElementInStory: { url: 'http://localhost:4000/overlay/character/index.html' },
        music: { url: 'http://localhost:4000/overlay/song/index.html' },
      },
      ['activeElementInStory']
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await refreshOwnBrowserSources(obs, 4000);

    expect(obs.reloaded.map((r) => r.inputName)).toEqual(['music']);
  });
});

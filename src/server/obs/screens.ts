import { isOwnOverlayUrl, type ObsCaller } from './refresh-overlays';

/**
 * The whole-picture overlays and the scene each one gets. The pause scene has
 * been "brb" since the first layout; `!scene start` and `!scene end` follow it.
 */
export const SCREENS = [
  { overlay: 'start', scene: 'start' },
  { overlay: 'pause', scene: 'brb' },
  { overlay: 'end', scene: 'end' },
];

export interface ScreenResult {
  overlay: string;
  /** The scene that shows it — which may carry another name than ours. */
  scene: string;
  /**
   * `exists`: a scene shows this screen already. `taken`: a scene has our name
   * but shows something else, and is left alone.
   */
  status: 'created' | 'exists' | 'taken';
  /** Sources of the model scene that could not be taken along. */
  missing?: string[];
}

interface SceneItem {
  sceneItemId: number;
  sceneItemIndex: number;
  sourceName: string;
  inputKind: string | null;
  sceneItemTransform: Record<string, unknown>;
}

interface ShownScreen {
  scene: string;
  items: SceneItem[];
  page: SceneItem;
  settings: Record<string, unknown>;
}

// What SetSceneItemTransform takes back. OBS also reports the source's size
// and the item's resulting size, and rejects the request if they come along.
const PLACEMENT = ['positionX', 'positionY', 'scaleX', 'scaleY', 'rotation', 'alignment', 'cropLeft', 'cropRight', 'cropTop', 'cropBottom'];
const BOUNDS = ['boundsType', 'boundsAlignment', 'boundsWidth', 'boundsHeight'];

function placement(transform: Record<string, unknown>): Record<string, unknown> {
  // Without bounds OBS reports them as 0 wide, and refuses anything below 1.
  const keys = transform.boundsType && transform.boundsType !== 'OBS_BOUNDS_NONE' ? [...PLACEMENT, ...BOUNDS] : PLACEMENT;
  return Object.fromEntries(keys.filter((k) => k in transform).map((k) => [k, transform[k]]));
}

/** Which of our screens a browser source shows, if any. */
function screenOf(url: unknown, port: number): string | null {
  if (typeof url !== 'string' || !isOwnOverlayUrl(url, port)) return null;
  const folder = /^\/overlay\/([^/]+)(?:\/|$)/.exec(new URL(url).pathname)?.[1];
  return SCREENS.some((s) => s.overlay === folder) ? folder! : null;
}

/** Bottom to top — the order they have to be added in to end up the same. */
async function itemsOf(obs: ObsCaller, sceneName: string): Promise<SceneItem[]> {
  const { sceneItems } = (await obs.call('GetSceneItemList', { sceneName })) as { sceneItems: SceneItem[] };
  return [...sceneItems].sort((a, b) => a.sceneItemIndex - b.sceneItemIndex);
}

/**
 * Creates a scene for every screen OBS does not show yet. Where one of them
 * is already set up — "brb" with its chat and music — the new scenes are built
 * like it: the same sources at the same places, only the page swapped. Scenes
 * that exist are never changed.
 */
export async function createScreenScenes(obs: ObsCaller, port: number): Promise<ScreenResult[]> {
  const { scenes } = (await obs.call('GetSceneList')) as { scenes: { sceneName: string }[] };
  const sceneNames = scenes.map((s) => s.sceneName);

  const shown = new Map<string, ShownScreen>();
  for (const scene of sceneNames) {
    const items = await itemsOf(obs, scene);
    for (const page of items) {
      if (page.inputKind !== 'browser_source') continue;
      const { inputSettings } = (await obs.call('GetInputSettings', { inputName: page.sourceName })) as {
        inputSettings: Record<string, unknown>;
      };
      const overlay = screenOf(inputSettings.url, port);
      if (overlay && !shown.has(overlay)) shown.set(overlay, { scene, items, page, settings: inputSettings });
    }
  }

  // Settled before anything is created, so every new scene copies the one the
  // streamer arranged — never one that was itself just copied.
  const model = SCREENS.map((s) => shown.get(s.overlay)).find((s) => s !== undefined);
  const results: ScreenResult[] = [];

  for (const { overlay, scene } of SCREENS) {
    const existing = shown.get(overlay);
    if (existing) {
      results.push({ overlay, scene: existing.scene, status: 'exists' });
      continue;
    }
    if (sceneNames.includes(scene)) {
      results.push({ overlay, scene, status: 'taken' });
      continue;
    }

    await obs.call('CreateScene', { sceneName: scene });
    const missing: string[] = [];

    if (!model) {
      const { baseWidth, baseHeight } = (await obs.call('GetVideoSettings')) as { baseWidth: number; baseHeight: number };
      const url = `http://localhost:${port}/overlay/${overlay}/index.html`;
      await addPage(obs, scene, overlay, { url, width: baseWidth, height: baseHeight });
    } else {
      for (const item of model.items) {
        if (item !== model.page) {
          try {
            await obs.call('DuplicateSceneItem', { sceneName: model.scene, sceneItemId: item.sceneItemId, destinationSceneName: scene });
          } catch (err) {
            console.error(`[OBS] Could not take "${item.sourceName}" along into "${scene}":`, err);
            missing.push(item.sourceName);
          }
          continue;
        }
        const modelUrl = new URL(model.settings.url as string);
        modelUrl.pathname = `/overlay/${overlay}/index.html`;
        const sceneItemId = await addPage(obs, scene, overlay, { ...model.settings, url: modelUrl.toString() });
        await obs.call('SetSceneItemTransform', { sceneName: scene, sceneItemId, sceneItemTransform: placement(item.sceneItemTransform) });
      }
    }

    results.push({ overlay, scene, status: 'created', ...(missing.length ? { missing } : {}) });
  }

  return results;
}

/** The screen's own browser source, on top of what the scene holds so far. */
async function addPage(obs: ObsCaller, sceneName: string, overlay: string, inputSettings: Record<string, unknown>): Promise<number> {
  // Not the scene's name: scenes and inputs share one namespace in OBS.
  const inputName = `${overlay}Screen`;
  const { inputs } = (await obs.call('GetInputList')) as { inputs: { inputName: string }[] };
  const { sceneItemId } = (
    inputs.some((i) => i.inputName === inputName)
      ? await obs.call('CreateSceneItem', { sceneName, sourceName: inputName })
      : await obs.call('CreateInput', { sceneName, inputName, inputKind: 'browser_source', inputSettings })
  ) as { sceneItemId: number };
  return sceneItemId;
}

import { isOwnOverlayUrl, type ObsCaller } from './refresh-overlays';

/**
 * Which of our overlays are on screen right now: the browser sources in the
 * current scene that point at this server and are enabled — groups and nested
 * scenes included. The result names overlays the way their URL does:
 * `/overlay/roulette/index.html` → `roulette`, `/overlay/custom/x/` → `custom/x`.
 */

interface SceneItem {
  sourceName: string;
  sceneItemEnabled: boolean;
  isGroup?: boolean | null;
  sourceType?: string;
}

export function overlayNameFromUrl(url: string | undefined, port: number): string | null {
  if (!isOwnOverlayUrl(url, port)) return null;
  const path = new URL(url!).pathname;
  const match = path.match(/^\/overlay\/(custom\/[^/]+|[^/]+)/);
  return match ? match[1] : null;
}

export async function visibleOverlays(obs: ObsCaller, port: number, scene: string): Promise<string[]> {
  const found = new Set<string>();
  const seenScenes = new Set<string>();

  async function walk(sceneName: string, depth: number): Promise<void> {
    if (depth > 3 || seenScenes.has(sceneName)) return;
    seenScenes.add(sceneName);
    const { sceneItems } = (await obs.call('GetSceneItemList', { sceneName })) as { sceneItems: SceneItem[] };
    for (const item of sceneItems) {
      if (!item.sceneItemEnabled) continue;
      if (item.isGroup) {
        const { sceneItems: inner } = (await obs.call('GetGroupSceneItemList', { sceneName: item.sourceName })) as { sceneItems: SceneItem[] };
        for (const child of inner) if (child.sceneItemEnabled) await input(child);
        continue;
      }
      if (item.sourceType === 'OBS_SOURCE_TYPE_SCENE') {
        await walk(item.sourceName, depth + 1);
        continue;
      }
      await input(item);
    }
  }

  async function input(item: SceneItem): Promise<void> {
    try {
      const { inputSettings } = (await obs.call('GetInputSettings', { inputName: item.sourceName })) as { inputSettings: { url?: string } };
      const name = overlayNameFromUrl(inputSettings.url, port);
      if (name) found.add(name);
    } catch {
      // Not an input (a scene used as a source, a filter) — nothing to read.
    }
  }

  await walk(scene, 0);
  return [...found].sort();
}

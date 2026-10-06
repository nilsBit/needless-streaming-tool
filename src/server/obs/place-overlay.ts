import type { ObsCaller } from './refresh-overlays';
import { overlaysByScene } from './visible-overlays';

/**
 * Puts one of our overlays into an OBS scene as a browser source, the way the
 * setup's step "In OBS einrichten" does it. An overlay that already sits in
 * some scene is left alone and reported with that scene. Pure in the OBS
 * caller, so a stand-in can play OBS in a test.
 */

export interface PlaceableOverlay {
  name: string;
  /** The overlay folder; the address is built from it. */
  base: string;
  /** The Bestenliste key, carried as ?type= — null for every other overlay. */
  variant: string | null;
  label: string;
  size: { width: number; height: number } | null;
}

export interface PlaceResult {
  overlay: string;
  scene: string;
  status: 'created' | 'exists' | 'no-scene';
  inputName?: string;
}

export async function placeOverlay(obs: ObsCaller, port: number, overlay: PlaceableOverlay, scene: string): Promise<PlaceResult> {
  const { scenes } = (await obs.call('GetSceneList')) as { scenes: Array<{ sceneName: string }> };
  if (!scenes.some((s) => s.sceneName === scene)) return { overlay: overlay.name, scene, status: 'no-scene' };

  const placed = await overlaysByScene(obs, port);
  const already = placed[overlay.name];
  if (already && already.length > 0) return { overlay: overlay.name, scene: already[0], status: 'exists' };

  // Not the overlay's bare name: a streamer may well have a source called "chat".
  const inputName = `NST ${overlay.label}`;
  const url = `http://localhost:${port}/overlay/${overlay.base}/index.html${overlay.variant ? `?type=${encodeURIComponent(overlay.variant)}` : ''}`;
  let size = overlay.size;
  if (!size) {
    const video = (await obs.call('GetVideoSettings')) as { baseWidth: number; baseHeight: number };
    size = { width: video.baseWidth, height: video.baseHeight };
  }

  const { inputs } = (await obs.call('GetInputList')) as { inputs: { inputName: string }[] };
  if (inputs.some((i) => i.inputName === inputName)) {
    await obs.call('CreateSceneItem', { sceneName: scene, sourceName: inputName });
  } else {
    await obs.call('CreateInput', {
      sceneName: scene,
      inputName,
      inputKind: 'browser_source',
      inputSettings: { url, width: size.width, height: size.height },
    });
  }
  return { overlay: overlay.name, scene, status: 'created', inputName };
}

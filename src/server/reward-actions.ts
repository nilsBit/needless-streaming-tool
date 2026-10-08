import { triggerRoulette } from './api/actions';
import { changeScene, getCurrentScene, getSceneMappings, type SceneMapping } from './obs/index';

/**
 * What a reward does once it is paid for — with Twitch channel points or with
 * the tool's own points (spec 2026-10-08-eigene-punkte). A Twitch reward finds
 * its action by name (eventsub.ts), a Punkte-Belohnung carries it; #24 will
 * bind Twitch rewards by id to the same keys.
 *
 * `feature_request` and `change_music` do nothing beyond the alert and the
 * queue row the caller writes — the streamer acts on them.
 */
export const ACTION_KEYS = ['roulette', 'feature_request', 'change_music', 'scene', 'alert'] as const;
export type ActionKey = (typeof ACTION_KEYS)[number];

export const isActionKey = (value: unknown): value is ActionKey =>
  typeof value === 'string' && (ACTION_KEYS as readonly string[]).includes(value);

/** The type a queue row and the alert carry, as the Twitch path writes it. */
export function rewardTypeOf(action: ActionKey): string {
  return action === 'scene' ? 'scene_change' : action;
}

let sceneRevertTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Switches to a mapped scene and, if the mapping says so, back after its
 * duration — to its revert scene, or to the one that was on before.
 */
export async function switchMappedScene(mapping: SceneMapping): Promise<{ ok: true } | { ok: false; reason: string }> {
  const previousScene = await getCurrentScene();
  const result = await changeScene(mapping.scene_name);
  if (!result.success) return { ok: false, reason: result.error ?? 'OBS hat die Szene nicht gewechselt' };
  if (mapping.duration_seconds && mapping.duration_seconds > 0) {
    const revertTo = mapping.revert_scene || previousScene;
    if (revertTo) {
      if (sceneRevertTimer) clearTimeout(sceneRevertTimer);
      sceneRevertTimer = setTimeout(async () => {
        sceneRevertTimer = null;
        const revert = await changeScene(revertTo);
        if (revert.success) console.log(`[Rewards] Reverted to "${revertTo}" after ${mapping.duration_seconds}s`);
      }, mapping.duration_seconds * 1000);
    }
  }
  return { ok: true };
}

/** A scene a reward may switch to: only one the streamer mapped, never one a viewer typed. */
export function mappedScene(sceneName: string | null | undefined): SceneMapping | null {
  if (!sceneName) return null;
  return getSceneMappings().find((m) => m.scene_name === sceneName) ?? null;
}

/** Runs one action. A reason comes back when it did not happen, so the caller can refund. */
export async function runAction(action: ActionKey, opts: { sceneName?: string | null } = {}): Promise<{ ok: true } | { ok: false; reason: string }> {
  switch (action) {
    case 'roulette': {
      const result = triggerRoulette();
      return 'error' in result ? { ok: false, reason: result.error } : { ok: true };
    }
    case 'scene': {
      const mapping = mappedScene(opts.sceneName);
      if (!mapping) return { ok: false, reason: 'die Szene ist nicht mehr freigegeben' };
      return switchMappedScene(mapping);
    }
    default:
      return { ok: true };
  }
}

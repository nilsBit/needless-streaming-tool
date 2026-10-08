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

/**
 * What a reward made in the Twitch dashboard does, told apart by its title —
 * the convention from before rewards carried an action. eventsub.ts acts on
 * it; the app shows it next to the reward.
 */
export function actionFromTitle(title: string): ActionKey | null {
  const t = title.toLowerCase();
  if (t.includes('roulette')) return 'roulette';
  if (t.includes('feature')) return 'feature_request';
  if (t.includes('musik') || t.includes('song')) return 'change_music';
  if (t.includes('scene') || t.includes('szene')) return 'scene';
  return null;
}

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

/** How long a reward's scene change may last: up to ten minutes. */
export const SCENE_SECONDS_MAX = 600;

/**
 * The scene a reward switches to is the one the streamer chose for it when
 * creating it (08.10.) — the viewer only redeems and never names a scene.
 * A scene released the old way under "Szenen in OBS" still brings its way
 * back when the reward itself does not say how long.
 */
function rewardScene(sceneName: string, seconds: number | null | undefined): SceneMapping {
  const mapped = mappedScene(sceneName);
  return {
    reward_title: '',
    scene_name: sceneName,
    duration_seconds: seconds ?? mapped?.duration_seconds,
    revert_scene: mapped?.revert_scene,
  };
}

/**
 * The scene fields of a reward as the app sends them: a scene name and how
 * long it stays (default 30 s) for a scene change, nothing for any other action.
 */
export function sceneOfReward(action: ActionKey | undefined, sceneName: unknown, seconds: unknown): { scene_name: string | null; scene_seconds: number | null } | { error: string } {
  if (action !== 'scene') return { scene_name: null, scene_seconds: null };
  const name = typeof sceneName === 'string' ? sceneName.trim() : '';
  if (!name || name.length > 100) return { error: 'scene_name is required for a scene change' };
  if (seconds === undefined || seconds === null) return { scene_name: name, scene_seconds: 30 };
  if (!Number.isInteger(seconds) || (seconds as number) < 0 || (seconds as number) > SCENE_SECONDS_MAX) return { error: `scene_seconds must be from 0 to ${SCENE_SECONDS_MAX}` };
  return { scene_name: name, scene_seconds: seconds as number };
}

/** Runs one action. A reason comes back when it did not happen, so the caller can refund. */
export async function runAction(action: ActionKey, opts: { sceneName?: string | null; sceneSeconds?: number | null } = {}): Promise<{ ok: true } | { ok: false; reason: string }> {
  switch (action) {
    case 'roulette': {
      const result = triggerRoulette();
      return 'error' in result ? { ok: false, reason: result.error } : { ok: true };
    }
    case 'scene': {
      if (!opts.sceneName) return { ok: false, reason: 'die Belohnung nennt keine Szene' };
      return switchMappedScene(rewardScene(opts.sceneName, opts.sceneSeconds));
    }
    default:
      return { ok: true };
  }
}

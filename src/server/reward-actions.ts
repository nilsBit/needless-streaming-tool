import { triggerRoulette } from './api/actions';
import { listSounds } from './bot/alerts';
import { startRewardTimer } from './reward-timer';
import { changeScene, getCurrentScene, getSceneMappings, type SceneMapping } from './obs/index';

/**
 * What a reward does once it is paid for — with Twitch channel points or with
 * the tool's own points (spec 2026-10-08-eigene-punkte). A Twitch reward finds
 * its action by name (eventsub.ts), a Punkte-Belohnung carries it; #24 will
 * bind Twitch rewards by id to the same keys.
 *
 * Five building blocks (spec 2026-10-14-belohnungen-bausteine): an alert, the
 * wheel, a scene for a while, a timer over the goal, a sound with the alert.
 */
export const ACTION_KEYS = ['alert', 'roulette', 'scene', 'timer', 'sound'] as const;
export type ActionKey = (typeof ACTION_KEYS)[number];

export const ALERT_TEXT_MAX = 100;
const LINK = /\b(?:https?:\/\/\S+|www\.\S+|[a-z0-9-]+\.[a-z]{2,}\/\S*)/gi;

/**
 * What a viewer wrote, as it may stand in the alert on stream: one line, links
 * as "[Link]", at most 100 characters. Nothing for an empty text.
 */
export function alertText(input: string | null | undefined): string | undefined {
  const text = (input ?? '').replace(/\s+/g, ' ').trim().replace(LINK, '[Link]');
  if (!text) return undefined;
  return text.length > ALERT_TEXT_MAX ? `${text.slice(0, ALERT_TEXT_MAX - 1)}…` : text;
}

/** A sound reward's sound for the alert overlay, if the file is still there. */
export function soundOf(name: string | null | undefined): { url: string; volume: number } | undefined {
  if (!name || !listSounds().includes(name)) return undefined;
  return { url: `/public/alert-sound/${encodeURIComponent(name)}`, volume: 0.8 };
}

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

export const TASK_MAX = 60;
export const TIMER_MINUTES_MAX = 60;
export const TIMER_MINUTES_DEFAULT = 5;

/**
 * The fields of a timer or a sound reward as the app sends them; null for any
 * other block. A timer without a task takes the reward's name (the caller
 * passes it as `fallbackTask`); a sound must be one of the alert sounds.
 */
export function extrasOfReward(action: ActionKey | undefined, task: unknown, minutes: unknown, sound: unknown, fallbackTask = ''):
  { task: string | null; minutes: number | null; sound: string | null } | { error: string } {
  if (action === 'timer') {
    const t = typeof task === 'string' && task.trim() ? task.trim() : fallbackTask.trim();
    if (!t || t.length > TASK_MAX) return { error: `task must be 1 to ${TASK_MAX} characters` };
    const m = minutes === undefined || minutes === null ? TIMER_MINUTES_DEFAULT : minutes;
    if (!Number.isInteger(m) || (m as number) < 1 || (m as number) > TIMER_MINUTES_MAX) return { error: `minutes must be from 1 to ${TIMER_MINUTES_MAX}` };
    return { task: t, minutes: m as number, sound: null };
  }
  if (action === 'sound') {
    if (typeof sound !== 'string' || !listSounds().includes(sound)) return { error: 'sound must be one of the alert sounds' };
    return { task: null, minutes: null, sound };
  }
  return { task: null, minutes: null, sound: null };
}

export interface RunOptions { sceneName?: string | null; sceneSeconds?: number | null; task?: string | null; minutes?: number | null; who?: string }

/** Runs one action. A reason comes back when it did not happen, so the caller can refund. */
export async function runAction(action: ActionKey, opts: RunOptions = {}): Promise<{ ok: true } | { ok: false; reason: string }> {
  switch (action) {
    case 'roulette': {
      const result = triggerRoulette();
      return 'error' in result ? { ok: false, reason: result.error } : { ok: true };
    }
    case 'scene': {
      if (!opts.sceneName) return { ok: false, reason: 'die Belohnung nennt keine Szene' };
      return switchMappedScene(rewardScene(opts.sceneName, opts.sceneSeconds));
    }
    case 'timer': {
      if (!opts.task || !opts.minutes) return { ok: false, reason: 'die Belohnung nennt keine Aufgabe' };
      return startRewardTimer({ task: opts.task, minutes: opts.minutes, who: opts.who || 'jemand' });
    }
    default:
      // alert and sound: the alert the caller sends is all there is.
      return { ok: true };
  }
}

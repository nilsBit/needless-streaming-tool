import type { SceneMapping } from './index';

/**
 * Which scene a channel-point redemption may switch to. A reward the
 * streamer mapped under "Szene per Kanalpunkt" switches to its scene. A
 * "Szene" reward without a mapping lets the viewer name a scene — but only
 * one that appears in the streamer's mappings; never an arbitrary scene by
 * name (a desktop scene with private content, say). Pure, so it is testable.
 */
export function resolveSceneMapping(
  mappings: readonly SceneMapping[],
  rewardTitle: string,
  rewardType: string,
  userInput: string | null | undefined,
): SceneMapping | null {
  const titleLower = rewardTitle.toLowerCase();
  const byReward = mappings.find((m) => m.reward_title && titleLower.includes(m.reward_title.toLowerCase()));
  if (byReward) return byReward;

  if (rewardType !== 'scene_change') return null;
  const wanted = (userInput ?? '').trim().toLowerCase();
  if (!wanted) return null;
  return mappings.find((m) => m.scene_name.toLowerCase() === wanted) ?? null;
}

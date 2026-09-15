import { getActiveEntry, pinEntry } from './active-entry';
import { followState } from './follow-state';
import { loadFocusFromWorld, loadWorldEntry } from './worldbuilder';

/**
 * Follow Mode: the Entry Card follows the entry open in Worldbuilder.
 *
 * The Schaufenster has no push, by design, so this looks once a second. An
 * entry has to stay open for the settle time before the card switches —
 * clicking through a list must not flicker on stream. Worldbuilder says when
 * the entry was opened, so the wait is measured there, not between two looks.
 */

export type FollowOutcome =
  | 'off'
  | 'held'
  | 'unreachable'
  | 'nothing-open'
  | 'showing'
  | 'settling'
  | 'switched';

export interface FollowStep {
  outcome: FollowOutcome;
  focus?: { id: string; titel: string; art: string };
  /** How much longer the open entry has to stay open, while settling. */
  waitMs?: number;
}

/** One look at Worldbuilder, and the card switched if it should be. */
export async function followStep(now = Date.now()): Promise<FollowStep> {
  const state = followState();
  if (!state.enabled || !state.available) return { outcome: 'off' };
  if (state.held) return { outcome: 'held' };

  const focus = await loadFocusFromWorld();
  // Closed, or no world open: the card stays as it is. Nothing is logged —
  // this runs every second.
  if (focus !== null && 'error' in focus) return { outcome: 'unreachable' };
  // Nothing open any more: the last card stays.
  if (focus === null) return { outcome: 'nothing-open' };

  const open = { id: focus.id, titel: focus.titel, art: focus.art };
  if (getActiveEntry()?.id === focus.id) return { outcome: 'showing', focus: open };

  const openedAt = Date.parse(focus.seit);
  const waitMs = Number.isFinite(openedAt) ? state.settleSeconds * 1000 - (now - openedAt) : 0;
  if (waitMs > 0) return { outcome: 'settling', focus: open, waitMs };

  const entry = await loadWorldEntry(focus.id);
  if ('error' in entry) return { outcome: 'unreachable', focus: open };

  // Picked by hand while Worldbuilder was being asked: the hand wins.
  if (followState().held) return { outcome: 'held' };

  await pinEntry(entry, 'follow');
  return { outcome: 'switched', focus: open };
}

const LOOK_EVERY_MS = 1000;
let timer: ReturnType<typeof setInterval> | null = null;

/** Starts looking once a second. Belongs in startServer(), never in createApp(). */
export function startFollowing(): void {
  if (timer) return;
  let busy = false;
  timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      await followStep();
    } catch (err) {
      console.warn('[Follow]', err instanceof Error ? err.message : err);
    } finally {
      busy = false;
    }
  }, LOOK_EVERY_MS);
}

import { getDb } from '../db/index';
import { getOverlayScenes } from '../obs/index';
import { overlaySetup } from './catalog';

/**
 * The three steps that make an overlay "einsatzbereit" (2026-10-08): set up,
 * in OBS, tested. Set up and tested are remembered here; in OBS is read from
 * OBS, and `null` while OBS cannot be asked. An overlay with nothing to set up
 * (live-driven or showing by itself) has the first step done from the start.
 * Once all three are done the overlay is ready, stays ready, and brings
 * READY_XP towards the stage.
 */

export const READY_XP = 20;

export type OverlayStep = 'tuned' | 'tested';

export interface OverlaySteps {
  tuned: boolean;
  placed: boolean | null;
  tested: boolean;
  ready: boolean;
}

interface Row { name: string; tuned: number; tested: number; ready_at: string | null }

function row(name: string): Row | undefined {
  return getDb().prepare('SELECT name, tuned, tested, ready_at FROM overlay_steps WHERE name = ?').get(name) as Row | undefined;
}

/** How many overlays have become ready — for the EP. */
export function readyCount(): number {
  return (getDb().prepare('SELECT COUNT(*) AS n FROM overlay_steps WHERE ready_at IS NOT NULL').get() as { n: number }).n;
}

function stepsOf(name: string, placedIn: Record<string, string[]> | null): { steps: OverlaySteps; becameReady: boolean } {
  const r = row(name);
  const tuned = overlaySetup(name) !== 'settings' || r?.tuned === 1;
  const tested = r?.tested === 1;
  const placed = placedIn ? (placedIn[name]?.length ?? 0) > 0 : null;
  if (r?.ready_at) return { steps: { tuned, placed, tested, ready: true }, becameReady: false };
  if (!(tuned && tested && placed === true)) return { steps: { tuned, placed, tested, ready: false }, becameReady: false };
  getDb().prepare(`INSERT INTO overlay_steps (name, ready_at) VALUES (?, CURRENT_TIMESTAMP)
    ON CONFLICT(name) DO UPDATE SET ready_at = COALESCE(ready_at, CURRENT_TIMESTAMP)`).run(name);
  return { steps: { tuned, placed, tested, ready: true }, becameReady: true };
}

async function placement(): Promise<Record<string, string[]> | null> {
  const { connected, byOverlay } = await getOverlayScenes();
  return connected ? byOverlay : null;
}

/** The steps of each named overlay. An overlay whose three steps came together elsewhere becomes ready here. */
export async function overlaySteps(names: string[]): Promise<{ steps: Record<string, OverlaySteps>; becameReady: string[] }> {
  const placedIn = await placement();
  const steps: Record<string, OverlaySteps> = {};
  const becameReady: string[] = [];
  for (const name of names) {
    const s = stepsOf(name, placedIn);
    steps[name] = s.steps;
    if (s.becameReady) becameReady.push(name);
  }
  return { steps, becameReady };
}

/** One step done. Says whether the overlay became ready with it. */
export async function markOverlayStep(name: string, step: OverlayStep): Promise<{ steps: OverlaySteps; becameReady: boolean }> {
  const column = step === 'tuned' ? 'tuned' : 'tested';
  getDb().prepare(`INSERT INTO overlay_steps (name, ${column}) VALUES (?, 1) ON CONFLICT(name) DO UPDATE SET ${column} = 1`).run(name);
  return stepsOf(name, await placement());
}

import fs from 'fs';
import path from 'path';

export interface ShowcaseState {
  events?: { afterMs: number; event: string; data: unknown }[];
  public?: Record<string, unknown>;
  freezeAfterMs: number;
}

/** Something to try on a live overlay in the showcase: new test data, then events. */
export interface ShowcaseAction {
  label: string;
  public?: Record<string, unknown>;
  events?: { afterMs?: number; event: string; data: unknown }[];
}

export interface ShowcaseStates {
  overlays: Record<string, {
    size: { width: number; height: number };
    actions?: ShowcaseAction[];
    states: Record<string, ShowcaseState>;
  }>;
}

/** Tests point it at a copy. */
export function overlaysDir(): string {
  return process.env.NST_OVERLAYS_DIR ?? path.join(process.cwd(), 'src', 'overlays');
}

/** Read fresh each time — the file is edited while the tool runs. */
export function readStates(): ShowcaseStates {
  return JSON.parse(fs.readFileSync(path.join(overlaysDir(), 'showcase', 'states.json'), 'utf8'));
}

const SAFE_NAME = /^[a-z0-9][a-z0-9-]*$/;

/** The only way a name from a request may become part of a path. */
export function isKnownState(overlay: string, state: string): boolean {
  // The file lies under src/overlays and could be edited to name anything —
  // a name that becomes a path must also look like one, never like `..`.
  if (!SAFE_NAME.test(overlay) || !SAFE_NAME.test(state)) return false;
  const { overlays } = readStates();
  // A plain property lookup on a request-supplied name (e.g. "constructor")
  // returns an inherited Object.prototype value instead of undefined, which
  // would then throw trying to read `.states` off it. hasOwnProperty rules
  // that out before the value is ever touched.
  if (!Object.prototype.hasOwnProperty.call(overlays, overlay)) return false;
  const entry = overlays[overlay];
  return Object.prototype.hasOwnProperty.call(entry.states, state);
}

/** Every overlay/state pair of the showcase whose names are safe to use in a path. */
export function stateNames(): { overlay: string; state: string }[] {
  return Object.entries(readStates().overlays)
    .flatMap(([overlay, entry]) => Object.keys(entry.states).map((state) => ({ overlay, state })))
    .filter(({ overlay, state }) => SAFE_NAME.test(overlay) && SAFE_NAME.test(state));
}

/** Where captures and drafts live. Tests point it at a temp dir. */
export function designDir(): string {
  return process.env.NST_DESIGN_DIR ?? path.join(process.cwd(), 'design');
}

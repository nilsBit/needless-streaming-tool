import fs from 'fs';
import path from 'path';

export interface ShowcaseState {
  events?: { afterMs: number; event: string; data: unknown }[];
  public?: Record<string, unknown>;
  freezeAfterMs: number;
}

export interface ShowcaseStates {
  overlays: Record<string, { size: { width: number; height: number }; states: Record<string, ShowcaseState> }>;
}

export function overlaysDir(): string {
  return path.join(process.cwd(), 'src', 'overlays');
}

/** Read fresh each time — the file is edited while the tool runs. */
export function readStates(): ShowcaseStates {
  return JSON.parse(fs.readFileSync(path.join(overlaysDir(), 'showcase', 'states.json'), 'utf8'));
}

/** The only way a name from a request may become part of a path. */
export function isKnownState(overlay: string, state: string): boolean {
  const entry = readStates().overlays[overlay];
  return entry !== undefined && Object.prototype.hasOwnProperty.call(entry.states, state);
}

/** Where captures and drafts live. Tests point it at a temp dir. */
export function designDir(): string {
  return process.env.NST_DESIGN_DIR ?? path.join(process.cwd(), 'design');
}

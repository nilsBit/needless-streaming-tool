import { getDb } from './db/index';
import { broadcast } from './websocket/index';
import { currentStreamId, onStreamStart } from './stream-report/log';
import type { Project, ProjectKind, ProjectsState } from '../shared/types';

/**
 * Projekt (2026-10-12): what a creative stream works on over many streams — a
 * picture in steps, 30 figures, 10.000 words. Several can be open; one is
 * current, and the card, the overlay and !projekt speak of that one. Each
 * keeps its own stand, and counts the streams it was worked on.
 */

interface Row {
  id: number;
  name: string;
  kind: ProjectKind;
  steps: string | null;
  position: number;
  total: number | null;
  unit: string | null;
  step_by: number;
  weekly: number;
  week: string | null;
  streams: number;
  last_stream_id: number | null;
  created_at: string;
  last_worked_at: string;
  finished_at: string | null;
}

export const PROJECT_KINDS: readonly ProjectKind[] = ['steps', 'count', 'goal'];
const MAX_NUMBER = 10_000_000;
const CURRENT_KEY = 'current_project_id';

const number = new Intl.NumberFormat('de-DE');

/** The Monday of a week, in local time, as YYYY-MM-DD. */
function mondayOf(now: Date): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function stepsOf(row: Row): string[] {
  try {
    const list = JSON.parse(row.steps ?? '[]');
    return Array.isArray(list) ? list.map(String) : [];
  } catch {
    return [];
  }
}

/** A goal that begins anew each Monday starts at 0 in a new week. */
function freshen(row: Row): Row {
  if (!row.weekly) return row;
  const week = mondayOf(new Date());
  if (row.week === week) return row;
  getDb().prepare('UPDATE projects SET position = 0, week = ? WHERE id = ?').run(week, row.id);
  return { ...row, position: 0, week };
}

function rowOf(id: number): Row | null {
  const row = getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id) as Row | undefined;
  return row ? freshen(row) : null;
}

function finishedAt(row: Row, steps: string[]): boolean {
  if (row.kind === 'steps') return row.position >= steps.length;
  if (row.kind === 'goal' && row.weekly) return false;
  return row.position >= (row.total ?? 1);
}

function toView(row: Row): Project {
  const steps = stepsOf(row);
  const finished = finishedAt(row, steps);
  const sid = currentStreamId();
  let stand: string;
  let pct: number;
  if (row.kind === 'steps') {
    stand = finished ? 'Alle Schritte geschafft' : `${steps[row.position]} · Schritt ${row.position + 1} von ${steps.length}`;
    pct = steps.length ? Math.round((Math.min(row.position, steps.length) / steps.length) * 100) : 0;
  } else {
    const total = row.total ?? 1;
    stand = `${number.format(row.position)} von ${number.format(total)} ${row.unit ?? ''}${row.weekly ? ' diese Woche' : ''}`.replace(/\s+/g, ' ').trim();
    pct = Math.min(100, Math.round((row.position / total) * 100));
  }
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    steps,
    position: row.position,
    total: row.total,
    unit: row.unit,
    step_by: row.step_by,
    weekly: !!row.weekly,
    streams: row.streams,
    live: sid !== null && row.last_stream_id === sid,
    created_at: row.created_at,
    last_worked_at: row.last_worked_at,
    finished_at: row.finished_at,
    step: row.kind === 'steps' && !finished ? steps[row.position] : null,
    stand,
    pct,
    finished,
  };
}

export function currentProjectId(): number | null {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(CURRENT_KEY) as { value: string } | undefined;
  const id = Number(row?.value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function setCurrent(id: number | null): void {
  if (id === null) getDb().prepare('DELETE FROM settings WHERE key = ?').run(CURRENT_KEY);
  else getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(CURRENT_KEY, String(id));
}

function currentRow(): Row | null {
  const id = currentProjectId();
  if (id === null) return null;
  const row = rowOf(id);
  return row && !row.finished_at ? row : null;
}

export function currentProject(): Project | null {
  const row = currentRow();
  return row ? toView(row) : null;
}

/** The current project and the other open ones, last worked on first. */
export function projectsState(): ProjectsState {
  const current = currentRow();
  const open = (getDb().prepare('SELECT * FROM projects WHERE finished_at IS NULL AND id IS NOT ? ORDER BY last_worked_at DESC, id DESC').all(current?.id ?? null) as Row[])
    .map((row) => toView(freshen(row)));
  return { current: current ? toView(current) : null, open };
}

/** What the overlay shows: only the current project. */
export function publicProject(): { current: Project | null } {
  return { current: currentProject() };
}

function announce(): void {
  broadcast('project-update', publicProject());
}

function touch(id: number): void {
  getDb().prepare('UPDATE projects SET last_worked_at = ? WHERE id = ?').run(new Date().toISOString(), id);
}

/** The stream on air counts once for the project worked on in it. */
function countStream(id: number): void {
  const sid = currentStreamId();
  if (sid === null) return;
  getDb().prepare('UPDATE projects SET streams = streams + 1, last_stream_id = ? WHERE id = ? AND last_stream_id IS NOT ?').run(sid, id, sid);
}

/** A stream that goes live (or is picked up again) counts for the current project. */
onStreamStart(() => {
  const row = currentRow();
  if (!row) return;
  countStream(row.id);
  announce();
});

export interface ProjectRefusal { status: number; message: string }

interface Fields {
  name?: string;
  kind?: ProjectKind;
  steps?: string[];
  total?: number;
  unit?: string;
  step_by?: number;
  weekly?: boolean;
  position?: number;
}

const isWhole = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/** Reads what the panel sent. On an edit, `kind` is the project's own and only what is sent changes. */
function readFields(body: Record<string, unknown>, kind: ProjectKind, creating: boolean): Fields | ProjectRefusal {
  const out: Fields = {};
  if (creating || body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || name.length > 80) return { status: 400, message: 'Der Name ist leer oder länger als 80 Zeichen.' };
    out.name = name;
  }
  if (kind === 'steps') {
    if (creating || body.steps !== undefined) {
      if (!Array.isArray(body.steps)) return { status: 400, message: 'Die Schritte fehlen.' };
      const steps = body.steps.map((s) => (typeof s === 'string' ? s.trim() : '')).filter(Boolean);
      if (steps.length < 1 || steps.length > 30 || steps.some((s) => s.length > 60)) {
        return { status: 400, message: 'Ein Projekt hat 1 bis 30 Schritte, jeder bis 60 Zeichen.' };
      }
      out.steps = steps;
    }
  } else {
    if (creating || body.unit !== undefined) {
      const unit = typeof body.unit === 'string' ? body.unit.trim() : '';
      if (!unit || unit.length > 30) return { status: 400, message: kind === 'goal' ? 'Die Einheit ist leer oder länger als 30 Zeichen.' : 'Was gezählt wird, ist leer oder länger als 30 Zeichen.' };
      out.unit = unit;
    }
    if (creating || body.total !== undefined) {
      if (!isWhole(body.total, 1, MAX_NUMBER)) return { status: 400, message: 'Das Ziel ist eine ganze Zahl über 0.' };
      out.total = body.total;
    }
    if (kind === 'goal') {
      if (body.step_by !== undefined) {
        if (!isWhole(body.step_by, 1, MAX_NUMBER)) return { status: 400, message: 'Pro Klick kommt eine ganze Zahl über 0 dazu.' };
        out.step_by = body.step_by;
      }
      if (body.weekly !== undefined) out.weekly = body.weekly === true;
    }
  }
  if (body.position !== undefined) {
    if (!isWhole(body.position, 0, MAX_NUMBER)) return { status: 400, message: 'Der Stand ist eine ganze Zahl ab 0.' };
    out.position = body.position;
  }
  return out;
}

/** The highest stand a project can have. */
function maxPosition(kind: ProjectKind, steps: string[], total: number | null, weekly: boolean): number {
  if (kind === 'steps') return steps.length;
  if (kind === 'goal' && weekly) return MAX_NUMBER;
  return total ?? 1;
}

export function createProject(body: Record<string, unknown>): Project | ProjectRefusal {
  const kind = body.kind as ProjectKind;
  if (!PROJECT_KINDS.includes(kind)) return { status: 400, message: 'Die Art ist Schritte, Zähler oder Zahl mit Ziel.' };
  const f = readFields(body, kind, true);
  if ('status' in f) return f;
  if (kind === 'steps' && (f.steps?.length ?? 0) < 2) return { status: 400, message: 'Ein Projekt in Schritten hat mindestens zwei Schritte.' };
  const weekly = kind === 'goal' && !!f.weekly;
  const steps = f.steps ?? [];
  const position = Math.min(f.position ?? 0, maxPosition(kind, steps, f.total ?? null, weekly));
  const now = new Date().toISOString();
  const id = Number(getDb().prepare(`INSERT INTO projects (name, kind, steps, position, total, unit, step_by, weekly, week, created_at, last_worked_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    f.name, kind, kind === 'steps' ? JSON.stringify(steps) : null, position,
    kind === 'steps' ? null : f.total, kind === 'steps' ? null : f.unit,
    kind === 'goal' ? (f.step_by ?? 1) : 1, weekly ? 1 : 0, weekly ? mondayOf(new Date()) : null, now, now,
  ).lastInsertRowid);
  // A new project is the one being worked on.
  const before = currentProjectId();
  if (before !== null) touch(before);
  setCurrent(id);
  countStream(id);
  announce();
  return toView(rowOf(id)!);
}

export function updateProject(id: number, body: Record<string, unknown>): Project | ProjectRefusal {
  const row = rowOf(id);
  if (!row) return { status: 404, message: 'Das Projekt gibt es nicht.' };
  if (body.kind !== undefined && body.kind !== row.kind) return { status: 400, message: 'Die Art eines Projekts bleibt, wie sie angelegt wurde.' };
  const f = readFields(body, row.kind, false);
  if ('status' in f) return f;
  const steps = f.steps ?? stepsOf(row);
  const total = f.total ?? row.total;
  const weekly = row.kind === 'goal' && (f.weekly ?? !!row.weekly);
  const position = Math.min(f.position ?? row.position, maxPosition(row.kind, steps, total, weekly));
  getDb().prepare(`UPDATE projects SET name = ?, steps = ?, position = ?, total = ?, unit = ?, step_by = ?, weekly = ?, week = ? WHERE id = ?`).run(
    f.name ?? row.name,
    row.kind === 'steps' ? JSON.stringify(steps) : null,
    position,
    row.kind === 'steps' ? null : total,
    row.kind === 'steps' ? null : (f.unit ?? row.unit),
    row.kind === 'goal' ? (f.step_by ?? row.step_by) : 1,
    weekly ? 1 : 0,
    weekly ? (row.week ?? mondayOf(new Date())) : null,
    id,
  );
  announce();
  return toView(rowOf(id)!);
}

/** Work on another open project now. */
export function makeCurrent(id: number): Project | ProjectRefusal {
  const row = rowOf(id);
  if (!row) return { status: 404, message: 'Das Projekt gibt es nicht.' };
  if (row.finished_at) return { status: 409, message: 'Das Projekt ist schon abgeschlossen.' };
  const before = currentProjectId();
  if (before !== null && before !== id) touch(before);
  touch(id);
  setCurrent(id);
  countStream(id);
  announce();
  return toView(rowOf(id)!);
}

/** One step, one piece or one jump on the current project; back undoes one. */
export function moveCurrent(direction: 1 | -1): Project | ProjectRefusal {
  const row = currentRow();
  if (!row) return { status: 409, message: 'Gerade ist kein Projekt dran.' };
  const steps = stepsOf(row);
  const by = row.kind === 'goal' ? row.step_by : 1;
  const max = maxPosition(row.kind, steps, row.total, !!row.weekly);
  const position = Math.max(0, Math.min(max, row.position + direction * by));
  getDb().prepare('UPDATE projects SET position = ?, last_worked_at = ? WHERE id = ?').run(position, new Date().toISOString(), row.id);
  countStream(row.id);
  announce();
  return toView(rowOf(row.id)!);
}

/** Done for good: it leaves the list, nothing is deleted. */
export function finishProject(id: number): Project | ProjectRefusal {
  const row = rowOf(id);
  if (!row) return { status: 404, message: 'Das Projekt gibt es nicht.' };
  if (row.finished_at) return { status: 409, message: 'Das Projekt ist schon abgeschlossen.' };
  getDb().prepare('UPDATE projects SET finished_at = ? WHERE id = ?').run(new Date().toISOString(), id);
  if (currentProjectId() === id) setCurrent(null);
  const view = toView(rowOf(id)!);
  broadcast('project-finished', { name: view.name, streams: view.streams });
  announce();
  return view;
}

export function deleteProject(id: number): boolean {
  const gone = getDb().prepare('DELETE FROM projects WHERE id = ?').run(id).changes > 0;
  if (!gone) return false;
  if (currentProjectId() === id) setCurrent(null);
  announce();
  return true;
}

/** The bot's answer to !projekt. */
export function projectAnswer(): string {
  const p = currentProject();
  if (!p) return 'Gerade läuft kein Projekt.';
  const stand = p.kind === 'steps'
    ? (p.finished ? 'alle Schritte geschafft' : `${p.step} (Schritt ${p.position + 1} von ${p.steps.length})`)
    : p.stand;
  const streams = p.live
    ? ` Der ${p.streams}. Stream an diesem Projekt.`
    : p.streams > 0 ? ` Bisher ${p.streams} ${p.streams === 1 ? 'Stream' : 'Streams'} daran.` : '';
  return `Gerade dran: ${p.name} – ${stand}.${streams}`;
}

/** The chat line when a project is done. */
export function finishedLine(p: Project): string {
  return p.streams > 1 ? `🎉 ${p.name} ist fertig – nach ${p.streams} Streams!` : `🎉 ${p.name} ist fertig!`;
}

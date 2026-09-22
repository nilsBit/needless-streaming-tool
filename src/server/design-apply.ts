import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getDb } from './db/index';
import { getOverlayConfig, isOverlayVar, saveOverlayConfig } from './api/overlay-config';
import { designDir, readStates } from './showcase';

/**
 * What happens to a draft that comes back from Figma.
 *
 * The plugin compares every layer with what its import built and sends only
 * what the designer changed. What has a plain CSS equivalent — colours,
 * type, borders, corners, opacity, the NST palette — is applied here at
 * once, as an override the overlays pick up live. Everything else (moving,
 * resizing, new or removed layers, wishes in the note) needs someone to
 * understand it; it waits in the draft's status.json until a Claude session
 * implements it.
 *
 * Overrides are provisional: whoever implements the pending part also moves
 * them into the overlay's own CSS and takes them out of here.
 */

/** A paint as the plugin reports it; a bound NST variable wins over the hex. */
export interface PaintValue {
  hex: string;
  alpha: number;
  variable?: string;
}

/** One property of one layer that differs from what the import built. */
export interface NodeChange {
  selector?: string;
  role?: 'outline';
  name: string;
  type: string;
  property: string;
  before: unknown;
  after: unknown;
}

export interface DraftChanges {
  variables?: Record<string, { before: string; after: string }>;
  nodes?: NodeChange[];
  added?: string[];
  removed?: string[];
}

export interface AppliedChange {
  id: string;
  overlay: string;
  state: string;
  at: string;
  label: string;
  kind: 'style' | 'variable';
  /** style: the CSS selector; variable: the palette key. */
  target: string;
  property: string;
  value: string;
  /** variable only: what to restore on undo. */
  before?: string;
}

export interface DraftStatus {
  overlay: string;
  state: string;
  receivedAt: string;
  applied: string[];
  pending: string[];
  wishes: string;
  done: boolean;
}

const LOG_KEY = 'design_applied';

function readLog(): AppliedChange[] {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(LOG_KEY) as { value: string } | undefined;
  if (!row) return [];
  try {
    return JSON.parse(row.value);
  } catch {
    return [];
  }
}

function writeLog(log: AppliedChange[]): void {
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(LOG_KEY, JSON.stringify(log));
}

export function appliedChanges(): AppliedChange[] {
  return readLog();
}

/** The applied style changes as one stylesheet per overlay; later ones win. */
export function designStyles(): Record<string, string> {
  const rules: Record<string, Map<string, Map<string, string>>> = {};
  for (const change of readLog()) {
    if (change.kind !== 'style') continue;
    const bySelector = (rules[change.overlay] ??= new Map());
    const props = bySelector.get(change.target) ?? new Map<string, string>();
    props.set(change.property, change.value);
    bySelector.set(change.target, props);
  }
  const css: Record<string, string> = {};
  for (const [overlay, bySelector] of Object.entries(rules)) {
    css[overlay] = [...bySelector]
      .map(([selector, props]) => `${selector} { ${[...props].map(([p, v]) => `${p}: ${v} !important;`).join(' ')} }`)
      .join('\n');
  }
  return css;
}

/** What overlays load and what every change broadcasts: the palette plus the Figma overrides. */
export function publicOverlayConfig() {
  return { ...getOverlayConfig(), styles: designStyles() };
}

function isPaint(value: unknown): value is PaintValue {
  return typeof value === 'object' && value !== null && typeof (value as PaintValue).hex === 'string';
}

function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return alpha >= 1 ? hex : `rgba(${r}, ${g}, ${b}, ${Number(alpha.toFixed(3))})`;
}

function cssColor(paint: unknown): string {
  if (!isPaint(paint)) return 'transparent';
  if (paint.variable) {
    return paint.alpha >= 1 ? `var(${paint.variable})` : `color-mix(in srgb, var(${paint.variable}) ${Math.round(paint.alpha * 100)}%, transparent)`;
  }
  return rgba(paint.hex, paint.alpha);
}

const WEIGHTS: Record<string, number> = {
  thin: 100, extralight: 200, light: 300, regular: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800, black: 900,
};

function px(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Number(value.toFixed(2)) : null;
}

type Unit = { unit: string; value: number };
function isUnit(value: unknown): value is Unit {
  return typeof value === 'object' && value !== null && typeof (value as Unit).unit === 'string';
}

/**
 * The CSS for one changed property, or null when it has none that can be
 * applied without understanding the layout.
 */
function toCss(change: NodeChange, tokens: Record<string, string>): [string, string][] | null {
  if (!change.selector) return null;
  const text = change.type === 'TEXT';
  const outline = change.role === 'outline';
  const { after } = change;
  switch (change.property) {
    case 'fill':
      return [[text ? 'color' : 'background', cssColor(after)]];
    case 'stroke':
      if (outline) return [['outline-color', cssColor(after)]];
      // A frame without a border that gets a stroke in Figma needs a border style too.
      return isPaint(after) && !isPaint(change.before)
        ? [['border-style', 'solid'], ['border-color', cssColor(after)]]
        : [['border-color', cssColor(after)]];
    case 'strokeWeights': {
      if (!Array.isArray(after) || after.some((w) => px(w) === null)) return null;
      return outline ? [['outline-width', `${px(after[0])}px`]] : [['border-width', after.map((w) => `${px(w)}px`).join(' ')]];
    }
    case 'radii':
      if (!Array.isArray(after) || after.some((r) => px(r) === null)) return null;
      return [['border-radius', after.map((r) => `${px(r)}px`).join(' ')]];
    case 'opacity':
      return px(after) === null ? null : [['opacity', String(after)]];
    case 'fontSize': {
      const size = px(after);
      if (size === null) return null;
      // In rem, so the font size slider in the Design panel keeps working.
      const base = parseFloat(tokens['--font-size-base'] ?? '') || 18;
      return [['font-size', `${Number((size / base).toFixed(4))}rem`]];
    }
    case 'fontStyle': {
      if (typeof after !== 'string') return null;
      const key = after.toLowerCase().replace(/italic|\s/g, '');
      return [['font-weight', String(WEIGHTS[key || 'regular'] ?? 400)], ['font-style', /italic/i.test(after) ? 'italic' : 'normal']];
    }
    case 'fontFamily': {
      // Overlays load the palette's two families; another one wouldn't arrive.
      const family = (token: string) => (tokens[token] ?? '').split(',')[0].replace(/['"]/g, '').trim();
      if (after === family('--font-display')) return [['font-family', 'var(--font-display)']];
      if (after === family('--font-body')) return [['font-family', 'var(--font-body)']];
      return null;
    }
    case 'letterSpacing':
      if (!isUnit(after)) return null;
      return [['letter-spacing', after.unit === 'PERCENT' ? `${Number((after.value / 100).toFixed(4))}em` : `${px(after.value)}px`]];
    case 'lineHeight':
      if (!isUnit(after)) return null;
      if (after.unit === 'AUTO') return [['line-height', 'normal']];
      return [['line-height', after.unit === 'PERCENT' ? String(Number((after.value / 100).toFixed(4))) : `${px(after.value)}px`]];
    case 'textCase': {
      const map: Record<string, string> = { UPPER: 'uppercase', LOWER: 'lowercase', TITLE: 'capitalize', ORIGINAL: 'none' };
      return typeof after === 'string' && map[after] ? [['text-transform', map[after]]] : null;
    }
    default:
      return null;
  }
}

const PROPERTY_LABEL: Record<string, string> = {
  fill: 'Füllung', stroke: 'Rahmenfarbe', strokeWeights: 'Rahmenstärke', radii: 'Ecken', opacity: 'Deckkraft',
  fontSize: 'Schriftgröße', fontStyle: 'Schriftschnitt', fontFamily: 'Schrift', letterSpacing: 'Laufweite',
  lineHeight: 'Zeilenhöhe', textCase: 'Groß-/Kleinschreibung', x: 'Position x', y: 'Position y',
  width: 'Breite', height: 'Höhe', visible: 'Sichtbarkeit', effects: 'Schatten/Effekte', characters: 'Text',
};

function show(value: unknown): string {
  if (isPaint(value)) return (value.variable ?? value.hex) + (value.alpha < 1 ? ` ${Math.round(value.alpha * 100)} %` : '');
  if (value === null || value === undefined) return 'keine';
  if (typeof value === 'number') return String(Number(value.toFixed(2)));
  if (typeof value === 'boolean') return value ? 'sichtbar' : 'ausgeblendet';
  if (isUnit(value)) return value.unit === 'AUTO' ? 'auto' : `${Number(value.value.toFixed(2))}${value.unit === 'PERCENT' ? ' %' : ' px'}`;
  if (Array.isArray(value)) return value.map(show).join('/');
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  return s.length > 60 ? `„${s.slice(0, 57)}…“` : `„${s}“`;
}

function label(change: NodeChange): string {
  const who = change.selector ? `${change.selector}${change.role === 'outline' ? ' (Innenrahmen)' : ''}` : change.name;
  const what = change.property === 'fill' && change.type === 'TEXT' ? 'Textfarbe' : PROPERTY_LABEL[change.property] ?? change.property;
  return `${who}: ${what} ${show(change.before)} → ${show(change.after)}`;
}

/** Takes one applied change back: a style override disappears, a palette key gets its old value. */
function revert(change: AppliedChange): void {
  if (change.kind !== 'variable') return;
  const config = getOverlayConfig();
  if (config.global[change.target] !== change.value) return; // changed again since — leave it
  if (change.before === undefined) delete config.global[change.target];
  else config.global[change.target] = change.before;
  saveOverlayConfig(config);
}

export function undoApplied(id: string): boolean {
  const log = readLog();
  const change = log.find((c) => c.id === id);
  if (!change) return false;
  revert(change);
  writeLog(log.filter((c) => c.id !== id));
  return true;
}

function wishesOf(note: unknown): string {
  if (typeof note !== 'string') return '';
  const at = note.indexOf('Wünsche:');
  return at === -1 ? '' : note.slice(at + 'Wünsche:'.length).trim();
}

/**
 * Applies what can be applied and records the rest. Sending the same frame
 * again replaces what its previous send applied — the plugin always compares
 * against the import, so the new send already contains everything still meant.
 */
export function applyDraft(overlay: string, state: string, draft: { changes?: DraftChanges; note?: unknown }): DraftStatus {
  const at = new Date().toISOString();
  let log = readLog();
  for (const previous of log.filter((c) => c.overlay === overlay && c.state === state).reverse()) revert(previous);
  log = log.filter((c) => !(c.overlay === overlay && c.state === state));

  const changes = draft.changes ?? {};
  const applied: AppliedChange[] = [];
  const pending: string[] = [];

  const config = getOverlayConfig();
  for (const [key, { before, after }] of Object.entries(changes.variables ?? {})) {
    if (!isOverlayVar(key) || typeof after !== 'string') {
      pending.push(`Variable ${key}: ${show(before)} → ${show(after)}`);
      continue;
    }
    applied.push({
      id: crypto.randomUUID(), overlay, state, at, kind: 'variable', target: key, property: key, value: after,
      before: config.global[key], label: `Palette ${key}: ${show(before)} → ${show(after)}`,
    });
    config.global[key] = after;
  }
  if (applied.length) saveOverlayConfig(config);

  for (const change of changes.nodes ?? []) {
    const css = toCss(change, config.global);
    if (!css) {
      pending.push(label(change));
      continue;
    }
    for (const [property, value] of css) {
      applied.push({ id: crypto.randomUUID(), overlay, state, at, kind: 'style', target: change.selector!, property, value, label: label(change) });
    }
  }
  for (const name of changes.added ?? []) pending.push(`Neu in Figma: ${name}`);
  for (const name of changes.removed ?? []) pending.push(`In Figma entfernt: ${name}`);

  writeLog([...log, ...applied]);
  const wishes = wishesOf(draft.note);
  return {
    overlay, state, receivedAt: at,
    // One label per layer change, even where it became two declarations.
    applied: [...new Set(applied.map((c) => c.label))],
    pending, wishes,
    done: pending.length === 0 && wishes === '',
  };
}

function statusFile(overlay: string, state: string): string {
  return path.join(designDir(), 'drafts', overlay, state, 'status.json');
}

export function writeStatus(status: DraftStatus): void {
  fs.writeFileSync(statusFile(status.overlay, status.state), JSON.stringify(status, null, 2));
}

/** Every draft that has a status, newest first. */
export function draftStatuses(): DraftStatus[] {
  const found: DraftStatus[] = [];
  for (const [overlay, entry] of Object.entries(readStates().overlays)) {
    for (const state of Object.keys(entry.states)) {
      const file = statusFile(overlay, state);
      if (!fs.existsSync(file)) continue;
      try {
        found.push(JSON.parse(fs.readFileSync(file, 'utf8')));
      } catch {
        // A hand-edited file that no longer parses is skipped, not fatal.
      }
    }
  }
  return found.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}

export function markDone(overlay: string, state: string): boolean {
  const file = statusFile(overlay, state);
  if (!fs.existsSync(file)) return false;
  const status: DraftStatus = JSON.parse(fs.readFileSync(file, 'utf8'));
  writeStatus({ ...status, done: true });
  return true;
}

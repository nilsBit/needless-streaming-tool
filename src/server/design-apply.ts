import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getDb } from './db/index';
import { getOverlayConfig, isOverlayVar, saveOverlayConfig } from './api/overlay-config';
import { designDir, stateNames } from './showcase';

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
 * Each applied change is one (overlay, selector, property) — a later send
 * that changes the same thing replaces it, nothing else is touched. Imports
 * see the overrides (captures run with them), so a new import starts from
 * what is live and its sends only carry what changed since.
 *
 * Everything in a draft is untrusted input: it ends up in a stylesheet that
 * every overlay in OBS loads. Selectors must be ones the capture of that
 * state produced, values are built here from checked numbers and colours,
 * and designStyles() checks both again on the way out — the log also comes
 * back through backups and the sync folder.
 *
 * Style overrides are provisional: whoever implements the pending part also
 * moves them into the overlay's own CSS and takes them out of here.
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

/** Something that waits for a person. A later send of the frame replaces the item with the same key. */
export interface PendingItem {
  key: string;
  label: string;
}

export interface DraftStatus {
  overlay: string;
  state: string;
  receivedAt: string;
  applied: string[];
  pending: PendingItem[];
  wishes: string;
  done: boolean;
  /** Only on a fresh result, never stored: keys of earlier pending items this send settled. */
  resolved?: string[];
}

// A draft is a few dozen changes; these only stop a flood.
const MAX_NODES = 2000;
const MAX_LIST = 500;
const MAX_TEXT = 300;
// Selectors carry the path from the nearest id or from body.
const MAX_SELECTOR = 600;
const MAX_NOTE = 20_000;
const MAX_LOG = 5000;

const LOG_KEY = 'design_applied';

/** Text from a draft, safe to store and show: no control characters but line breaks, and bounded. */
function clean(value: unknown, max: number): string {
  return String(value ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '').slice(0, max);
}

function rawLog(): string {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(LOG_KEY) as { value: string } | undefined;
  return row?.value ?? '[]';
}

function parseLog(raw: string): AppliedChange[] {
  try {
    const log = JSON.parse(raw);
    return Array.isArray(log) ? log : [];
  } catch {
    return [];
  }
}

function readLog(): AppliedChange[] {
  return parseLog(rawLog());
}

function writeLog(log: AppliedChange[]): void {
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(LOG_KEY, JSON.stringify(log));
}

export function appliedChanges(): AppliedChange[] {
  return readLog();
}

// Every overlay load and every broadcast asks for the stylesheets; they only
// change when the log does. Keyed to the stored text itself — a backup import
// writes the settings table without passing through here.
let stylesCache: { raw: string; css: Record<string, string> } | null = null;

const CSS_PROPERTIES = new Set([
  'color', 'background', 'border-style', 'border-color', 'border-width', 'border-radius',
  'outline-style', 'outline-color', 'outline-width', 'opacity', 'font-size', 'font-weight', 'font-style',
  'font-family', 'letter-spacing', 'line-height', 'text-transform', 'text-align',
]);
// What the capture produces: tags, classes, ids, `>`, `:not([class])`, pseudo-elements.
const SAFE_SELECTOR = /^[a-zA-Z0-9_\-.#:>()[\]\s]+$/;
// What toCss produces: numbers with units, #hex, var(), color-mix(), rgba(), keywords.
const SAFE_VALUE = /^[a-zA-Z0-9#%.,()\s-]+$/;

function safeRule(change: AppliedChange): boolean {
  return change.kind === 'style' && typeof change.target === 'string' && typeof change.value === 'string'
    && typeof change.overlay === 'string' && /^[a-z0-9-]+$/.test(change.overlay) && CSS_PROPERTIES.has(change.property)
    && SAFE_SELECTOR.test(change.target) && !change.target.includes('/*') && change.target.length <= MAX_SELECTOR
    && SAFE_VALUE.test(change.value) && change.value.length <= MAX_TEXT;
}

/** The applied style changes as one stylesheet per overlay; later ones win. */
export function designStyles(): Record<string, string> {
  const raw = rawLog();
  if (stylesCache?.raw === raw) return stylesCache.css;
  const rules = new Map<string, Map<string, Map<string, string>>>();
  for (const change of parseLog(raw)) {
    if (!safeRule(change)) continue;
    const bySelector = rules.get(change.overlay) ?? new Map<string, Map<string, string>>();
    const props = bySelector.get(change.target) ?? new Map<string, string>();
    props.set(change.property, change.value);
    bySelector.set(change.target, props);
    rules.set(change.overlay, bySelector);
  }
  // No !important: an animation or a value the overlay's script sets inline
  // must still win. The selectors carry the whole path with its state
  // classes, about as specific as the overlay's own state rules; a rule that
  // must beat an override whatever it says is marked !important in the
  // overlay itself (see `.title.long` in the Entry Card).
  const css: Record<string, string> = {};
  for (const [overlay, bySelector] of rules) {
    css[overlay] = [...bySelector]
      .map(([selector, props]) => `${selector} { ${[...props].map(([p, v]) => `${p}: ${v};`).join(' ')} }`)
      .join('\n');
  }
  stylesCache = { raw, css };
  return css;
}

/** What overlays load and what every change broadcasts: the palette plus the Figma overrides. */
export function publicOverlayConfig() {
  return { ...getOverlayConfig(), styles: designStyles() };
}

const HEX = /^#[0-9a-f]{6}$/i;

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * A solid paint, null for "no paint at all", undefined for anything else —
 * a gradient, an image, a text coloured in parts, or something malformed.
 */
function paintOf(value: unknown): PaintValue | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'object') return undefined;
  const p = value as Record<string, unknown>;
  if (typeof p.hex !== 'string' || !HEX.test(p.hex) || !isNumber(p.alpha) || p.alpha < 0 || p.alpha > 1) return undefined;
  return { hex: p.hex, alpha: p.alpha, ...(typeof p.variable === 'string' ? { variable: p.variable } : {}) };
}

/** Only the palette's colour keys exist in the overlays; any other binding is written as its colour. */
function isColorVar(key: string | undefined): key is string {
  return key !== undefined && isOverlayVar(key) && key.startsWith('--color-') && key !== '--color-bg-opacity';
}

function cssColor(paint: PaintValue): string {
  if (isColorVar(paint.variable)) {
    return paint.alpha >= 1 ? `var(${paint.variable})` : `color-mix(in srgb, var(${paint.variable}) ${Math.round(paint.alpha * 100)}%, transparent)`;
  }
  const n = parseInt(paint.hex.slice(1), 16);
  return paint.alpha >= 1 ? paint.hex.toLowerCase() : `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Number(paint.alpha.toFixed(3))})`;
}

const WEIGHTS = new Map([
  ['thin', 100], ['extralight', 200], ['light', 300], ['regular', 400], ['medium', 500],
  ['semibold', 600], ['bold', 700], ['extrabold', 800], ['black', 900],
]);
const TEXT_CASE = new Map([['UPPER', 'uppercase'], ['LOWER', 'lowercase'], ['TITLE', 'capitalize'], ['ORIGINAL', 'none']]);
const TEXT_ALIGN = new Map([['LEFT', 'left'], ['CENTER', 'center'], ['RIGHT', 'right'], ['JUSTIFIED', 'justify']]);

const round = (n: number) => Number(n.toFixed(2));

type Unit = { unit: string; value: number };
function unitOf(value: unknown): Unit | null {
  if (typeof value !== 'object' || value === null) return null;
  const u = value as Record<string, unknown>;
  if (u.unit === 'AUTO') return { unit: 'AUTO', value: 0 };
  return (u.unit === 'PIXELS' || u.unit === 'PERCENT') && isNumber(u.value) ? { unit: u.unit, value: u.value } : null;
}

/**
 * The CSS for one changed property, or null when it has none that can be
 * applied without understanding the layout. `tokens` is the palette as this
 * overlay sees it (global plus its own overrides).
 */
function toCss(change: NodeChange, tokens: Record<string, string>): [string, string][] | null {
  const text = change.type === 'TEXT';
  const outline = change.role === 'outline';
  const { after } = change;

  // The outline layer only stands for the element's inset outline.
  if (outline && change.property !== 'stroke' && change.property !== 'strokeWeights') return null;
  switch (change.property) {
    case 'fill': {
      const paint = paintOf(after);
      if (paint === undefined) return null;
      if (text) return paint ? [['color', cssColor(paint)]] : null;
      return [['background', paint ? cssColor(paint) : 'transparent']];
    }
    case 'stroke': {
      // A text layer's selector is its element's; a stroke on the text isn't a border of the box.
      if (text) return null;
      const paint = paintOf(after);
      const before = paintOf(change.before);
      if (paint === undefined) return null;
      if (outline) return paint ? [['outline-color', cssColor(paint)]] : [['outline-style', 'none']];
      if (!paint) return [['border-style', 'none']];
      // A frame without a border that gets one in Figma needs a style too; its width comes as strokeWeights.
      return before === null ? [['border-style', 'solid'], ['border-color', cssColor(paint)]] : [['border-color', cssColor(paint)]];
    }
    case 'strokeWeights': {
      if (text || !Array.isArray(after) || after.length !== 4 || !after.every((w) => isNumber(w) && w >= 0)) return null;
      return outline ? [['outline-width', `${round(after[0])}px`]] : [['border-width', after.map((w) => `${round(w)}px`).join(' ')]];
    }
    case 'radii':
      if (text || !Array.isArray(after) || after.length !== 4 || !after.every((r) => isNumber(r) && r >= 0)) return null;
      return [['border-radius', after.map((r) => `${round(r)}px`).join(' ')]];
    case 'opacity':
      // On a text layer it would fade the whole box the text sits in.
      return !text && isNumber(after) && after >= 0 && after <= 1 ? [['opacity', String(round(after))]] : null;
    case 'fontSize': {
      if (!text || !isNumber(after) || after <= 0) return null;
      // In rem, so the font size slider in the Design panel keeps working.
      const base = parseFloat(tokens['--font-size-base'] ?? '') || 18;
      return [['font-size', `${Number((after / base).toFixed(4))}rem`]];
    }
    case 'fontStyle': {
      if (!text || typeof after !== 'string') return null;
      const key = after.toLowerCase().replace(/italic|\s|-/g, '') || 'regular';
      const weight = WEIGHTS.get(key);
      return weight ? [['font-weight', String(weight)], ['font-style', /italic/i.test(after) ? 'italic' : 'normal']] : null;
    }
    case 'fontFamily': {
      if (!text) return null;
      // Overlays load the palette's two families; another one wouldn't arrive.
      const family = (token: string) => (tokens[token] ?? '').split(',')[0].replace(/['"]/g, '').trim();
      if (after === family('--font-display')) return [['font-family', 'var(--font-display)']];
      if (after === family('--font-body')) return [['font-family', 'var(--font-body)']];
      return null;
    }
    case 'letterSpacing': {
      const u = unitOf(after);
      if (!text || !u || u.unit === 'AUTO') return null;
      return [['letter-spacing', u.unit === 'PERCENT' ? `${Number((u.value / 100).toFixed(4))}em` : `${round(u.value)}px`]];
    }
    case 'lineHeight': {
      const u = unitOf(after);
      if (!text || !u) return null;
      if (u.unit === 'AUTO') return [['line-height', 'normal']];
      return [['line-height', u.unit === 'PERCENT' ? String(Number((u.value / 100).toFixed(4))) : `${round(u.value)}px`]];
    }
    case 'textCase': {
      const value = text && typeof after === 'string' ? TEXT_CASE.get(after) : undefined;
      return value ? [['text-transform', value]] : null;
    }
    case 'textAlign': {
      const value = text && typeof after === 'string' ? TEXT_ALIGN.get(after) : undefined;
      return value ? [['text-align', value]] : null;
    }
    default:
      return null;
  }
}

const PROPERTY_LABEL: Record<string, string> = {
  fill: 'Füllung', stroke: 'Rahmenfarbe', strokeWeights: 'Rahmenstärke', radii: 'Ecken', opacity: 'Deckkraft',
  fontSize: 'Schriftgröße', fontStyle: 'Schriftschnitt', fontFamily: 'Schrift', letterSpacing: 'Laufweite',
  lineHeight: 'Zeilenhöhe', textCase: 'Groß-/Kleinschreibung', textAlign: 'Ausrichtung', x: 'Position x', y: 'Position y',
  width: 'Breite', height: 'Höhe', visible: 'Sichtbarkeit', effects: 'Schatten/Effekte', characters: 'Text',
};

function show(value: unknown): string {
  const paint = paintOf(value);
  if (paint) return (paint.variable ?? paint.hex) + (paint.alpha < 1 ? ` ${Math.round(paint.alpha * 100)} %` : '');
  if (value === null || value === undefined) return 'keine';
  if (isNumber(value)) return String(round(value));
  if (typeof value === 'boolean') return value ? 'sichtbar' : 'ausgeblendet';
  const u = unitOf(value);
  if (u) return u.unit === 'AUTO' ? 'auto' : `${round(u.value)}${u.unit === 'PERCENT' ? ' %' : ' px'}`;
  if (Array.isArray(value)) return value.map(show).join('/');
  if (typeof value === 'object' && typeof (value as { kind?: unknown }).kind === 'string') {
    const kind = (value as { kind: string }).kind;
    return kind === 'mixed' ? 'gemischt' : kind.toLowerCase().replace(/_/g, ' ');
  }
  const s = clean(typeof value === 'string' ? value : JSON.stringify(value), 200);
  return s.length > 60 ? `„${s.slice(0, 57)}…“` : `„${s}“`;
}

function nodeLabel(change: NodeChange): string {
  const who = change.selector ? `${change.selector}${change.role === 'outline' ? ' (Innenrahmen)' : ''}` : change.name;
  // An SVG's inner layers: their before/after is a wall of JSON, not worth showing.
  if (change.property === 'content') return clean(`${who}: Inhalt der Grafik geändert`, MAX_TEXT * 2);
  const what = change.property === 'fill' && change.type === 'TEXT' ? 'Textfarbe' : PROPERTY_LABEL[change.property] ?? change.property;
  return clean(`${who}: ${what} ${show(change.before)} → ${show(change.after)}`, MAX_TEXT * 2);
}

// Selector and layer name: the two text layers of a drop-cap paragraph share a selector.
const nodeKey = (change: NodeChange) => `node|${change.selector ?? ''}|${change.name}|${change.role ?? ''}|${change.property}`;

/** Accepts palette values in the notation of their key only — they end up in style.setProperty and font URLs. */
function validVariable(key: string, value: unknown): value is string {
  if (typeof value !== 'string' || !isOverlayVar(key)) return false;
  if (key === '--color-bg-opacity') return /^(0(\.\d{1,3})?|1(\.0{1,3})?)$/.test(value);
  if (key === '--font-size-base') return /^\d{1,3}(\.\d{1,2})?px$/.test(value);
  if (key === '--font-display' || key === '--font-body') return /^[\w\s'",.-]{1,200}$/.test(value);
  return HEX.test(value);
}

/** Every selector the capture of this state produced — the only ones a change may name. */
function capturedSelectors(overlay: string, state: string): Set<string> {
  const selectors = new Set<string>();
  try {
    const capture = JSON.parse(fs.readFileSync(path.join(designDir(), 'captured', overlay, `${state}.json`), 'utf8'));
    const walk = (nodes: unknown): void => {
      if (!Array.isArray(nodes)) return;
      for (const node of nodes) {
        if (typeof node?.selector === 'string') selectors.add(node.selector);
        walk(node?.children);
      }
    };
    walk(capture.nodes);
  } catch {
    // No capture on this machine: nothing can be matched, everything waits.
  }
  return selectors;
}

function asNodeChange(value: unknown): NodeChange | null {
  if (typeof value !== 'object' || value === null) return null;
  const c = value as Record<string, unknown>;
  if (typeof c.property !== 'string' || typeof c.type !== 'string') return null;
  return {
    selector: typeof c.selector === 'string' ? clean(c.selector, MAX_SELECTOR) : undefined,
    role: c.role === 'outline' ? 'outline' : undefined,
    name: clean(c.name, MAX_TEXT), type: clean(c.type, 40), property: clean(c.property, 40),
    before: c.before, after: c.after,
  };
}

const list = (value: unknown, max: number): unknown[] => (Array.isArray(value) ? value.slice(0, max) : []);

function wishesOf(draft: { note?: unknown; noteChanged?: unknown }): string {
  if (typeof draft.note !== 'string') return '';
  const note = clean(draft.note, MAX_NOTE);
  const at = note.indexOf('Wünsche:');
  const wishes = at === -1 ? '' : note.slice(at + 'Wünsche:'.length).trim();
  // The plugin says when the part above "Wünsche:" was edited too — that is a wish as well.
  if (draft.noteChanged !== true) return wishes;
  const upper = (at === -1 ? note : note.slice(0, at)).trim();
  return [wishes, `Oberer Teil der Notiz geändert:\n${upper}`].filter(Boolean).join('\n\n');
}

/** Takes one variable change back — unless the palette key was changed again since. */
function revertVariable(change: AppliedChange, config: ReturnType<typeof getOverlayConfig>): boolean {
  if (config.global[change.target] !== change.value) return false;
  if (change.before === undefined) delete config.global[change.target];
  else config.global[change.target] = change.before;
  return true;
}

/** Takes one applied change back: a style override disappears, a palette key gets its old value. */
export function undoApplied(id: string): boolean {
  const log = readLog();
  const change = log.find((c) => c.id === id);
  if (!change) return false;
  getDb().transaction(() => {
    if (change.kind === 'variable') {
      const config = getOverlayConfig();
      if (revertVariable(change, config)) saveOverlayConfig(config);
    }
    writeLog(log.filter((c) => c.id !== id));
  })();
  return true;
}

/**
 * Keeps a palette change and takes it off the list — the palette is
 * configuration, there is nothing to move into code. Style overrides live
 * only in the list, so they can't be kept this way.
 */
export function keepApplied(id: string): 'kept' | 'not-found' | 'not-palette' {
  const log = readLog();
  const change = log.find((c) => c.id === id);
  if (!change) return 'not-found';
  if (change.kind !== 'variable') return 'not-palette';
  writeLog(log.filter((c) => c.id !== id));
  return 'kept';
}

function statusFile(overlay: string, state: string): string {
  return path.join(designDir(), 'drafts', overlay, state, 'status.json');
}

function normalizeStatus(overlay: string, state: string, raw: unknown): DraftStatus | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const s = raw as Record<string, unknown>;
  const pending = list(s.pending, MAX_LIST).flatMap((p) => {
    if (typeof p === 'string') return [{ key: p, label: clean(p, MAX_TEXT * 2) }];
    const item = p as Record<string, unknown> | null;
    return item && typeof item.label === 'string' ? [{ key: clean(item.key ?? item.label, MAX_TEXT * 2), label: clean(item.label, MAX_TEXT * 2) }] : [];
  });
  return {
    // Names come from the caller, never from the file: a status names no path.
    overlay, state,
    receivedAt: typeof s.receivedAt === 'string' ? s.receivedAt : new Date(0).toISOString(),
    applied: list(s.applied, MAX_LIST).map((a) => clean(a, MAX_TEXT * 2)),
    pending,
    wishes: clean(s.wishes, MAX_NOTE),
    done: s.done === true,
  };
}

function readStatus(overlay: string, state: string): DraftStatus | null {
  try {
    return normalizeStatus(overlay, state, JSON.parse(fs.readFileSync(statusFile(overlay, state), 'utf8')));
  } catch {
    return null;
  }
}

/**
 * Writes the status of a frame's latest send. What an earlier send left
 * waiting stays, unless this send says something about the same thing — a
 * re-import shows the code again, and layout the code doesn't have yet must
 * not drop off the list because of it.
 */
export function writeStatus(overlay: string, state: string, status: DraftStatus): DraftStatus {
  const previous = readStatus(overlay, state);
  const settled = new Set(status.resolved ?? []);
  const pending = new Map<string, PendingItem>();
  if (previous && !previous.done) for (const item of previous.pending) if (!settled.has(item.key)) pending.set(item.key, item);
  for (const item of status.pending) pending.set(item.key, item);
  const merged: DraftStatus = { ...status, overlay, state, pending: [...pending.values()].slice(0, MAX_LIST) };
  delete merged.resolved;
  merged.done = merged.pending.length === 0 && merged.wishes === '';
  fs.writeFileSync(statusFile(overlay, state), JSON.stringify(merged, null, 2));
  return merged;
}

/** Every draft that has a status, newest first. */
export function draftStatuses(): DraftStatus[] {
  const found: DraftStatus[] = [];
  for (const { overlay, state } of stateNames()) {
    const status = readStatus(overlay, state);
    if (status) found.push(status);
  }
  return found.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}

/** With `receivedAt`, only that send — a draft sent again since stays open. */
export function markDone(overlay: string, state: string, receivedAt?: string): boolean {
  const status = readStatus(overlay, state);
  if (!status) return false;
  if (receivedAt !== undefined && status.receivedAt !== receivedAt) return false;
  fs.writeFileSync(statusFile(overlay, state), JSON.stringify({ ...status, done: true }, null, 2));
  return true;
}

/** A send the plugin could not compare — an older import or a copied frame. Nothing is applied. */
export function uncomparedDraft(overlay: string, state: string, draft: { note?: unknown; noteChanged?: unknown }): DraftStatus {
  return {
    overlay, state, receivedAt: new Date().toISOString(), applied: [],
    pending: [{ key: 'baseline', label: 'Ohne Vergleichsstand gesendet (älterer Import oder kopierter Frame) — nichts übernommen. Neu einlesen und dort ändern.' }],
    wishes: wishesOf(draft), done: false,
  };
}

/** Applies what can be applied and records the rest; one transaction for the palette and the log. */
export function applyDraft(overlay: string, state: string, draft: { changes?: unknown; note?: unknown; noteChanged?: unknown }): DraftStatus {
  const at = new Date().toISOString();
  const changes = (typeof draft.changes === 'object' && draft.changes !== null ? draft.changes : {}) as Record<string, unknown>;
  const allowed = capturedSelectors(overlay, state);
  const config = getOverlayConfig();
  const tokens = { ...config.global, ...(config.overrides[overlay] ?? {}) };
  let log = readLog();
  const applied: AppliedChange[] = [];
  const pending: PendingItem[] = [];
  const resolved: string[] = [];
  let paletteChanged = false;

  const variables = typeof changes.variables === 'object' && changes.variables !== null ? changes.variables as Record<string, unknown> : {};
  for (const [rawKey, entry] of Object.entries(variables).slice(0, MAX_LIST)) {
    const key = clean(rawKey, 60);
    const { before, after } = (typeof entry === 'object' && entry !== null ? entry : {}) as { before?: unknown; after?: unknown };
    const label = `Palette ${key}: ${show(before)} → ${show(after)}`;
    if (!validVariable(key, after)) {
      pending.push({ key: `var|${key}`, label });
      continue;
    }
    // One entry per palette key: sent with several frames it is still one change, undone to where it started.
    const earlier = log.find((c) => c.kind === 'variable' && c.target === key);
    // Already the palette's value and not on the list (kept, or set here since): nothing to book.
    if (!earlier && config.global[key] === after) { resolved.push(`var|${key}`); continue; }
    log = log.filter((c) => c !== earlier);
    applied.push({
      id: crypto.randomUUID(), overlay, state, at, kind: 'variable', target: key, property: key, value: after,
      before: earlier ? earlier.before : config.global[key], label,
    });
    resolved.push(`var|${key}`);
    config.global[key] = after;
    paletteChanged = true;
  }

  for (const raw of list(changes.nodes, MAX_NODES)) {
    const change = asNodeChange(raw);
    if (!change) continue;
    const css = change.selector && allowed.has(change.selector) ? toCss(change, tokens) : null;
    const entries = (css ?? []).map(([property, value]): AppliedChange => ({
      id: crypto.randomUUID(), overlay, state, at, kind: 'style', target: change.selector!, property, value, label: nodeLabel(change),
    }));
    // Booked only if it will also be served — never reported as applied and then filtered out.
    if (!css || !entries.every(safeRule) || log.length + applied.length + entries.length > MAX_LOG) {
      pending.push({ key: nodeKey(change), label: nodeLabel(change) });
      continue;
    }
    for (const entry of entries) {
      // The same property of the same element, changed again: the new value replaces the old one.
      log = log.filter((c) => !(c.kind === 'style' && c.overlay === overlay && c.target === entry.target && c.property === entry.property));
      applied.push(entry);
    }
    resolved.push(nodeKey(change));
  }
  for (const name of list(changes.added, MAX_LIST)) pending.push({ key: `added|${clean(name, MAX_TEXT)}`, label: `Neu in Figma: ${clean(name, MAX_TEXT)}` });
  for (const name of list(changes.removed, MAX_LIST)) pending.push({ key: `removed|${clean(name, MAX_TEXT)}`, label: `In Figma entfernt: ${clean(name, MAX_TEXT)}` });

  getDb().transaction(() => {
    if (paletteChanged) saveOverlayConfig(config);
    writeLog([...log, ...applied]);
  })();

  const wishes = wishesOf(draft);
  return {
    overlay, state, receivedAt: at,
    // One label per layer change, even where it became two declarations.
    applied: [...new Set(applied.map((c) => c.label))],
    pending, wishes,
    done: pending.length === 0 && wishes === '',
    // What this send settled: pending items of earlier sends with these keys go.
    resolved: [...resolved, 'baseline'],
  };
}

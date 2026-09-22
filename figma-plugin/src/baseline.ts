/**
 * What the import built, remembered on each layer — so sending can tell what
 * the designer changed from what merely looks different between Figma and
 * the browser (text widths, SVG sizes, …).
 *
 * The import stores a snapshot in each layer's plugin data; sending takes a
 * new one and reports every property that moved. What the server makes of a
 * change is its business (design-apply.ts); here it is only "before / after".
 *
 * Layers are known by a uid of their own, not by Figma's node id: duplicating
 * a whole frame or page copies the plugin data, and the copy should compare
 * like the original. A uid met twice within one frame is a duplicated layer —
 * new in Figma.
 */

/** A solid paint, null for none, or a marker for what the server must not guess at (mixed, gradient, image). */
export type PaintSnap = { hex: string; alpha: number; variable?: string } | { kind: string; imageHash?: string | null } | null;
type Unit = { unit: string; value: number };

export type Snap = {
  x: number; y: number; width?: number; height?: number; visible: boolean; opacity?: number;
  fill?: PaintSnap; stroke?: PaintSnap; strokeWeights?: number[]; radii?: number[]; effects?: string;
  fontSize?: number | string; fontFamily?: string; fontStyle?: string; textAlign?: string;
  letterSpacing?: Unit | string; lineHeight?: Unit | string; textCase?: string; characters?: string;
  /** Leaves only: what the SVG's own layers look like — a recolour inside has nothing else to show. */
  content?: string;
};

type Child = { uid: string; label: string };
type Stored = { uid: string; selector?: string; role?: 'outline'; snap: Snap; leaf?: boolean; children?: Child[] };

export type NodeChange = { selector?: string; role?: 'outline'; name: string; type: string; property: string; before: unknown; after: unknown };
export type Changes = { nodes: NodeChange[]; added: string[]; removed: string[]; variables: Record<string, { before: string; after: string }> };

const KEY = 'nst';
const VARIABLES_KEY = 'nst-variables';

function hex(c: RGB | RGBA): string {
  return '#' + [c.r, c.g, c.b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
}

async function paintSnap(paints: readonly Paint[] | typeof figma.mixed): Promise<PaintSnap> {
  if (paints === figma.mixed) return { kind: 'mixed' };
  // Figma draws the last paint on top — that one is what shows.
  const p = [...paints].reverse().find((x) => x.visible !== false);
  if (!p) return null;
  if (p.type !== 'SOLID') return { kind: p.type, ...(p.type === 'IMAGE' ? { imageHash: p.imageHash } : {}) };
  const id = p.boundVariables?.color?.id;
  const variable = id ? (await figma.variables.getVariableByIdAsync(id))?.name : undefined;
  return { hex: hex(p.color), alpha: p.opacity ?? 1, ...(variable ? { variable } : {}) };
}

const mixed = <T>(value: T | typeof figma.mixed): T | string => (value === figma.mixed ? 'mixed' : value);

/** The look of an imported SVG's layers, as one comparable string. */
function contentOf(node: SceneNode): string {
  if (!('findAll' in node)) return '';
  return JSON.stringify(node.findAll(() => true).map((n) => [
    n.name, 'fills' in n ? n.fills : null, 'strokes' in n ? n.strokes : null, Math.round(n.width), Math.round(n.height),
  ]));
}

export async function snapshot(node: SceneNode, leaf = false): Promise<Snap> {
  const snap: Snap = { x: node.x, y: node.y, visible: node.visible };
  // A text box that hugs its text resizes with it; its size says nothing the text doesn't.
  if (node.type !== 'TEXT' || node.textAutoResize !== 'WIDTH_AND_HEIGHT') snap.width = node.width;
  if (node.type !== 'TEXT' || (node.textAutoResize !== 'WIDTH_AND_HEIGHT' && node.textAutoResize !== 'HEIGHT')) snap.height = node.height;
  if ('opacity' in node) snap.opacity = node.opacity;
  if ('fills' in node) snap.fill = await paintSnap(node.fills);
  if ('strokes' in node) snap.stroke = await paintSnap(node.strokes);
  if ('strokeTopWeight' in node) snap.strokeWeights = [node.strokeTopWeight, node.strokeRightWeight, node.strokeBottomWeight, node.strokeLeftWeight];
  if ('topLeftRadius' in node) snap.radii = [node.topLeftRadius, node.topRightRadius, node.bottomRightRadius, node.bottomLeftRadius];
  if ('effects' in node) snap.effects = JSON.stringify(node.effects);
  if (node.type === 'TEXT') {
    const font = mixed(node.fontName);
    snap.fontSize = mixed(node.fontSize);
    snap.fontFamily = typeof font === 'string' ? font : font.family;
    snap.fontStyle = typeof font === 'string' ? font : font.style;
    snap.textAlign = node.textAlignHorizontal;
    snap.letterSpacing = mixed(node.letterSpacing) as Unit | string;
    snap.lineHeight = mixed(node.lineHeight) as Unit | string;
    snap.textCase = mixed(node.textCase);
    snap.characters = node.characters;
  }
  if (leaf) snap.content = contentOf(node);
  return snap;
}

function stored(node: BaseNode): Stored | null {
  try {
    const raw = node.getPluginData(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** How a layer is named in a pending item: its CSS home if it has one, its layer name otherwise. */
const labelOf = (s: Stored | null, node: BaseNode) => (s?.selector ? `${s.selector}${s.role === 'outline' ? ' (Innenrahmen)' : ''}` : node.name);

/**
 * Called by the import once a layer (and, for a frame, everything in it) is
 * built. A leaf — an imported SVG — has layers Figma made, not the import;
 * they are neither remembered nor compared.
 */
export async function remember(node: SceneNode, selector: string | undefined, role: 'outline' | undefined, leaf = false): Promise<void> {
  const own: Stored = { uid: Math.random().toString(36).slice(2) + Date.now().toString(36), selector, role, snap: await snapshot(node, leaf), ...(leaf ? { leaf } : {}) };
  if ('children' in node && !leaf) {
    own.children = [];
    for (const c of node.children) {
      const s = c.name === 'Vorlage' ? null : stored(c);
      if (s) own.children.push({ uid: s.uid, label: labelOf(s, c) });
    }
  }
  node.setPluginData(KEY, JSON.stringify(own));
}

/** The palette the NST variables were set to at import — the live one, not a capture's. */
export function rememberVariables(palette: Record<string, string>): void {
  figma.root.setPluginData(VARIABLES_KEY, JSON.stringify(palette));
}

const GEOMETRY = new Set(['x', 'y', 'width', 'height']);

function same(key: string, a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < (GEOMETRY.has(key) ? 0.5 : 0.005);
  // A layer bound to a variable follows the variable's value — only the binding counts.
  const pa = a as { variable?: string; alpha?: number } | null;
  const pb = b as { variable?: string; alpha?: number } | null;
  if (pa?.variable && pb?.variable && typeof pa.alpha === 'number' && typeof pb.alpha === 'number') {
    return pa.variable === pb.variable && Math.abs(pa.alpha - pb.alpha) < 0.005;
  }
  const round = (v: unknown): unknown => JSON.parse(JSON.stringify(v ?? null, (_k, x) => (typeof x === 'number' ? Math.round(x * 100) / 100 : x)));
  return JSON.stringify(round(a)) === JSON.stringify(round(b));
}

/** Palette values changed in the collection "NST" since the import, in the tokens' own notation. */
async function variableChanges(): Promise<Changes['variables']> {
  let baseline: Record<string, string> = {};
  try {
    baseline = JSON.parse(figma.root.getPluginData(VARIABLES_KEY) || '{}');
  } catch {
    return {};
  }
  const collection = (await figma.variables.getLocalVariableCollectionsAsync()).find((c) => c.name === 'NST');
  const changed: Changes['variables'] = {};
  if (!collection) return changed;
  const modeId = collection.modes[0].modeId;
  for (const id of collection.variableIds) {
    const v = await figma.variables.getVariableByIdAsync(id);
    const before = v ? baseline[v.name] : undefined;
    if (!v || typeof before !== 'string') continue;
    const raw = v.valuesByMode[modeId];
    if (typeof raw === 'number') {
      // Figma keeps numbers as 32-bit floats: 0.85 comes back as 0.8500000238…
      const value = Math.round(raw * 1000) / 1000;
      if (Math.abs(value - parseFloat(before)) < 0.001) continue;
      changed[v.name] = { before, after: before.endsWith('px') ? `${value}px` : String(value) };
      continue;
    }
    const after = typeof raw === 'object' && raw !== null && 'r' in raw ? hex(raw) : String(raw);
    if (after.toLowerCase() !== before.toLowerCase()) changed[v.name] = { before, after };
  }
  return changed;
}

/**
 * Everything the designer changed in this frame since the import — or null
 * for a frame that can't be compared: no snapshots, or snapshots from before
 * layers had uids.
 */
export async function changesIn(frame: FrameNode): Promise<Changes | null> {
  if (!stored(frame)?.uid) return null;
  const changes: Changes = { nodes: [], added: [], removed: [], variables: await variableChanges() };
  const seen = new Set<string>();

  // `expected`: the uids the parent was built with. A layer pasted in from
  // another frame carries its source's uid — not one of these, so it is new.
  async function walk(node: SceneNode, isRoot: boolean, expected: Set<string> | null): Promise<void> {
    const s = stored(node);
    // No snapshot, a uid this frame already had, or one its parent never had: new in Figma. Not descended — it counts once.
    if (!s?.uid || seen.has(s.uid) || (expected && !expected.has(s.uid))) {
      changes.added.push(node.name);
      return;
    }
    seen.add(s.uid);
    const now = await snapshot(node, s.leaf);
    for (const key of new Set([...Object.keys(s.snap), ...Object.keys(now)]) as Set<keyof Snap>) {
      // The frame itself sits wherever it was put on the page; only its size matters.
      if (isRoot && (key === 'x' || key === 'y')) continue;
      if (same(key, s.snap[key], now[key])) continue;
      changes.nodes.push({ selector: s.selector, role: s.role, name: node.name, type: node.type, property: key, before: s.snap[key] ?? null, after: now[key] ?? null });
      // A stroke drawn where there was none: its weights belong with it, changed or not.
      if (key === 'stroke' && s.snap.stroke === null && now.strokeWeights && same('strokeWeights', s.snap.strokeWeights, now.strokeWeights)) {
        changes.nodes.push({ selector: s.selector, role: s.role, name: node.name, type: node.type, property: 'strokeWeights', before: s.snap.strokeWeights ?? null, after: now.strokeWeights });
      }
    }
    if (!('children' in node) || s.leaf) return;
    const present = new Set(node.children.map((c) => stored(c)?.uid).filter(Boolean));
    for (const child of s.children ?? []) if (!present.has(child.uid)) changes.removed.push(child.label);
    const own = new Set((s.children ?? []).map((c) => c.uid));
    for (const child of node.children) if (!(isRoot && child.name === 'Vorlage')) await walk(child, false, own);
  }

  await walk(frame, true, null);
  return changes;
}

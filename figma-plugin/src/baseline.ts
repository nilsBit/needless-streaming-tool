/**
 * What the import built, remembered on each layer — so sending can tell what
 * the designer changed from what merely looks different between Figma and
 * the browser (text widths, SVG sizes, …).
 *
 * The import stores a snapshot in each layer's plugin data; sending takes a
 * new one and reports every property that moved. What the server makes of a
 * change is its business (design-apply.ts); here it is only "before / after".
 */

export type PaintSnap = { hex: string; alpha: number; variable?: string } | null;
type Unit = { unit: string; value: number };

export type Snap = {
  x: number; y: number; width?: number; height?: number; visible: boolean; opacity?: number;
  fill?: PaintSnap; stroke?: PaintSnap; strokeWeights?: number[]; radii?: number[]; effects?: string;
  fontSize?: number | string; fontFamily?: string; fontStyle?: string;
  letterSpacing?: Unit | string; lineHeight?: Unit | string; textCase?: string; characters?: string;
};

type Stored = { id: string; selector?: string; role?: 'outline'; snap: Snap; leaf?: boolean; children?: { id: string; name: string }[] };

export type NodeChange = { selector?: string; role?: 'outline'; name: string; type: string; property: string; before: unknown; after: unknown };
export type Changes = { nodes: NodeChange[]; added: string[]; removed: string[]; variables: Record<string, { before: string; after: string }> };

const KEY = 'nst';
const VARIABLES_KEY = 'nst-variables';

async function paintSnap(paints: readonly Paint[] | typeof figma.mixed): Promise<PaintSnap> {
  if (paints === figma.mixed) return null;
  const p = paints.find((x): x is SolidPaint => x.type === 'SOLID' && x.visible !== false);
  if (!p) return null;
  const hex = '#' + [p.color.r, p.color.g, p.color.b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
  const id = p.boundVariables?.color?.id;
  const variable = id ? (await figma.variables.getVariableByIdAsync(id))?.name : undefined;
  return { hex, alpha: p.opacity ?? 1, ...(variable ? { variable } : {}) };
}

const mixed = <T>(value: T | typeof figma.mixed): T | string => (value === figma.mixed ? 'mixed' : value);

export async function snapshot(node: SceneNode): Promise<Snap> {
  const snap: Snap = { x: node.x, y: node.y, visible: node.visible };
  // A text box resizes with its text; its size says nothing the text doesn't.
  if (node.type !== 'TEXT') { snap.width = node.width; snap.height = node.height; }
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
    snap.letterSpacing = mixed(node.letterSpacing) as Unit | string;
    snap.lineHeight = mixed(node.lineHeight) as Unit | string;
    snap.textCase = mixed(node.textCase);
    snap.characters = node.characters;
  }
  return snap;
}

/**
 * Called by the import once a layer (and, for a frame, everything in it) is
 * built. A leaf — an imported SVG — has layers Figma made, not the import;
 * they are neither remembered nor compared.
 */
export async function remember(node: SceneNode, selector: string | undefined, role: 'outline' | undefined, leaf = false): Promise<void> {
  const stored: Stored = { id: node.id, selector, role, snap: await snapshot(node), ...(leaf ? { leaf } : {}) };
  if ('children' in node && !leaf) stored.children = node.children.filter((c) => c.name !== 'Vorlage').map((c) => ({ id: c.id, name: c.name }));
  node.setPluginData(KEY, JSON.stringify(stored));
}

export function rememberVariables(tokens: Record<string, string>): void {
  figma.root.setPluginData(VARIABLES_KEY, JSON.stringify(tokens));
}

const GEOMETRY = new Set(['x', 'y', 'width', 'height']);

function same(key: string, a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < (GEOMETRY.has(key) ? 0.5 : 0.005);
  // A layer bound to a variable follows the variable's value — only the binding counts.
  const pa = a as PaintSnap; const pb = b as PaintSnap;
  if (pa && pb && typeof pa === 'object' && typeof pb === 'object' && 'hex' in pa && 'hex' in pb && pa.variable && pb.variable) {
    return pa.variable === pb.variable && Math.abs(pa.alpha - pb.alpha) < 0.005;
  }
  const round = (v: unknown): unknown => JSON.parse(JSON.stringify(v ?? null, (_k, x) => (typeof x === 'number' ? Math.round(x * 100) / 100 : x)));
  return JSON.stringify(round(a)) === JSON.stringify(round(b));
}

function hex(c: RGB | RGBA): string {
  return '#' + [c.r, c.g, c.b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
}

/** Palette values changed in the collection "NST" since the import, in the tokens' own notation. */
async function variableChanges(): Promise<Changes['variables']> {
  const baseline: Record<string, string> = JSON.parse(figma.root.getPluginData(VARIABLES_KEY) || '{}');
  const collection = (await figma.variables.getLocalVariableCollectionsAsync()).find((c) => c.name === 'NST');
  const changed: Changes['variables'] = {};
  if (!collection) return changed;
  const modeId = collection.modes[0].modeId;
  for (const id of collection.variableIds) {
    const v = await figma.variables.getVariableByIdAsync(id);
    const before = v ? baseline[v.name] : undefined;
    if (!v || before === undefined) continue;
    const raw = v.valuesByMode[modeId];
    let after: string;
    if (typeof raw === 'object' && raw !== null && 'r' in raw) after = hex(raw);
    else if (typeof raw === 'number') after = before.endsWith('px') ? `${raw}px` : String(raw);
    else after = String(raw);
    if (after.toLowerCase() !== before.toLowerCase()) changed[v.name] = { before, after };
  }
  return changed;
}

/** Everything the designer changed in this frame since the import — or null for a frame from an import that kept no snapshots. */
export async function changesIn(frame: FrameNode): Promise<Changes | null> {
  if (!frame.getPluginData(KEY)) return null;
  const changes: Changes = { nodes: [], added: [], removed: [], variables: await variableChanges() };

  async function walk(node: SceneNode, isRoot: boolean): Promise<void> {
    const raw = node.getPluginData(KEY);
    const stored: Stored | null = raw ? JSON.parse(raw) : null;
    // No snapshot, or one copied along by duplicating a layer: new in Figma.
    if (!stored || stored.id !== node.id) {
      changes.added.push(node.name);
      return;
    }
    const now = await snapshot(node);
    for (const key of new Set([...Object.keys(stored.snap), ...Object.keys(now)]) as Set<keyof Snap>) {
      // The frame itself sits wherever it was put on the page; only its size matters.
      if (isRoot && (key === 'x' || key === 'y')) continue;
      if (!same(key, stored.snap[key], now[key])) {
        changes.nodes.push({ selector: stored.selector, role: stored.role, name: node.name, type: node.type, property: key, before: stored.snap[key] ?? null, after: now[key] ?? null });
      }
    }
    if (!('children' in node) || stored.leaf) return;
    const present = new Set(node.children.map((c) => c.id));
    for (const child of stored.children ?? []) if (!present.has(child.id)) changes.removed.push(child.name);
    for (const child of node.children) if (!(isRoot && child.name === 'Vorlage')) await walk(child, false);
  }

  await walk(frame, true);
  return changes;
}

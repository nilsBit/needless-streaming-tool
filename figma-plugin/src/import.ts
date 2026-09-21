export type Color = { hex: string; alpha: number; token?: string };
type Border = { width: number; style: string; color: Color };
export type CaptureNode = {
  kind: 'box' | 'text' | 'image' | 'svg';
  name: string; x: number; y: number; width: number; height: number; opacity: number;
  fill?: Color; borders?: { top: Border; right: Border; bottom: Border; left: Border };
  radii?: [number, number, number, number];
  shadow?: { x: number; y: number; blur: number; spread: number; color: Color };
  text?: { content: string; family: string; size: number; weight: number; italic: boolean; color: Color;
           lineHeight: number; letterSpacing: number; align: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED' };
  image?: { dataUrl: string }; svg?: { source: string }; children?: CaptureNode[];
};
export type Capture = { overlay: string; state: string; width: number; height: number;
  tokens: Record<string, string>; preview: string; nodes: CaptureNode[] };

const COLLECTION = 'NST';
const FLOAT_TOKENS = ['--color-bg-opacity', '--font-size-base'];
const STRING_TOKENS = ['--font-display', '--font-body'];

function rgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

/** The ten tokens as Figma variables in the collection "NST"; existing ones get the current value. */
export async function ensureVariables(tokens: Record<string, string>): Promise<Map<string, Variable>> {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const collection = collections.find((c) => c.name === COLLECTION) ?? figma.variables.createVariableCollection(COLLECTION);
  const modeId = collection.modes[0].modeId;
  const existing = new Map<string, Variable>();
  for (const id of collection.variableIds) {
    const v = await figma.variables.getVariableByIdAsync(id);
    if (v) existing.set(v.name, v);
  }
  for (const [name, value] of Object.entries(tokens)) {
    const type: VariableResolvedDataType = FLOAT_TOKENS.includes(name) ? 'FLOAT' : STRING_TOKENS.includes(name) ? 'STRING' : 'COLOR';
    if (type === 'COLOR' && !/^#[0-9a-f]{6}$/i.test(value)) continue;
    const v = existing.get(name) ?? figma.variables.createVariable(name, collection, type);
    v.setValueForMode(modeId, type === 'COLOR' ? rgb(value) : type === 'FLOAT' ? parseFloat(value) : value);
    existing.set(name, v);
  }
  return existing;
}

function paint(color: Color, variables: Map<string, Variable>): SolidPaint {
  const solid: SolidPaint = { type: 'SOLID', color: rgb(color.hex), opacity: color.alpha };
  const v = color.token ? variables.get(color.token) : undefined;
  return v ? figma.variables.setBoundVariableForPaint(solid, 'color', v) : solid;
}

const STYLE_BY_WEIGHT: Record<number, string> = { 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold' };

async function loadFont(family: string, weight: number, italic: boolean, missing: Set<string>): Promise<FontName> {
  const base = STYLE_BY_WEIGHT[weight] ?? 'Regular';
  const style = italic ? (base === 'Regular' ? 'Italic' : `${base} Italic`) : base;
  for (const candidate of [{ family, style }, { family: 'Inter', style }, { family: 'Inter', style: 'Regular' }]) {
    try {
      await figma.loadFontAsync(candidate);
      if (candidate.family !== family) missing.add(`${family} ${style}`);
      return candidate;
    } catch { /* next */ }
  }
  throw new Error('Inter Regular fehlt — Figma-Installation prüfen.');
}

function bytesOf(dataUrl: string): Uint8Array {
  return figma.base64Decode(dataUrl.slice(dataUrl.indexOf(',') + 1));
}

async function build(node: CaptureNode, parent: FrameNode, variables: Map<string, Variable>, missing: Set<string>): Promise<void> {
  if (node.kind === 'svg' && node.svg) {
    const svg = figma.createNodeFromSvg(node.svg.source);
    svg.name = node.name; svg.x = node.x; svg.y = node.y; svg.resize(Math.max(node.width, 0.01), Math.max(node.height, 0.01));
    parent.appendChild(svg);
    return;
  }
  if (node.kind === 'image' && node.image) {
    const rect = figma.createRectangle();
    rect.name = node.name; rect.x = node.x; rect.y = node.y; rect.resize(node.width, node.height);
    rect.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: figma.createImage(bytesOf(node.image.dataUrl)).hash }];
    rect.opacity = node.opacity;
    parent.appendChild(rect);
    return;
  }
  if (node.kind === 'text' && node.text) {
    const t = figma.createText();
    t.fontName = await loadFont(node.text.family, node.text.weight, node.text.italic, missing);
    t.characters = node.text.content;
    t.fontSize = node.text.size;
    t.lineHeight = { unit: 'PIXELS', value: node.text.lineHeight };
    t.letterSpacing = { unit: 'PIXELS', value: node.text.letterSpacing };
    t.textAlignHorizontal = node.text.align;
    t.fills = [paint(node.text.color, variables)];
    t.x = node.x; t.y = node.y;
    t.resize(Math.max(node.width, 1), Math.max(node.height, 1));
    t.textAutoResize = 'HEIGHT';
    parent.appendChild(t);
    return;
  }
  const f = figma.createFrame();
  f.name = node.name; f.x = node.x; f.y = node.y; f.resize(Math.max(node.width, 0.01), Math.max(node.height, 0.01));
  f.clipsContent = false;
  f.opacity = node.opacity;
  f.fills = node.fill ? [paint(node.fill, variables)] : [];
  if (node.borders) {
    const sides = [node.borders.top, node.borders.right, node.borders.bottom, node.borders.left];
    const first = sides.find((s) => s.width > 0)!;
    f.strokes = [paint(first.color, variables)];
    f.strokeAlign = 'INSIDE';
    f.strokeTopWeight = node.borders.top.width; f.strokeRightWeight = node.borders.right.width;
    f.strokeBottomWeight = node.borders.bottom.width; f.strokeLeftWeight = node.borders.left.width;
  }
  if (node.radii) {
    [f.topLeftRadius, f.topRightRadius, f.bottomRightRadius, f.bottomLeftRadius] = node.radii;
  }
  if (node.shadow) {
    const c = rgb(node.shadow.color.hex);
    f.effects = [{ type: 'DROP_SHADOW', color: { ...c, a: node.shadow.color.alpha }, offset: { x: node.shadow.x, y: node.shadow.y },
      radius: node.shadow.blur, spread: node.shadow.spread, visible: true, blendMode: 'NORMAL' }];
  }
  parent.appendChild(f);
  for (const child of node.children ?? []) await build(child, f, variables, missing);
}

/** One new page per import — never touches frames already designed. */
export async function importCaptures(captures: Capture[], log: (text: string) => void): Promise<void> {
  if (captures.length === 0) { log('Keine Erfassungen gefunden. Erst `npm run showcase:capture` laufen lassen.'); return; }
  const variables = await ensureVariables(captures[0].tokens);
  const page = figma.createPage();
  const now = new Date();
  page.name = `Import ${now.toLocaleDateString('de-DE')} ${now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
  await figma.setCurrentPageAsync(page);

  const missing = new Set<string>();
  let x = 0; let y = 0; let rowHeight = 0; let lastOverlay = '';
  for (const capture of captures) {
    if (capture.overlay !== lastOverlay && lastOverlay !== '') { x = 0; y += rowHeight + 160; rowHeight = 0; }
    lastOverlay = capture.overlay;
    const frame = figma.createFrame();
    frame.name = `${capture.overlay} / ${capture.state}`;
    frame.resize(capture.width, capture.height);
    frame.x = x; frame.y = y; frame.fills = []; frame.clipsContent = true;
    page.appendChild(frame);

    const preview = figma.createRectangle();
    preview.name = 'Vorlage';
    preview.resize(capture.width, capture.height);
    preview.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: figma.createImage(bytesOf(capture.preview)).hash }];
    preview.visible = false; preview.locked = true;
    frame.appendChild(preview);

    for (const node of capture.nodes) await build(node, frame, variables, missing);
    log(`${frame.name} ✓`);
    x += capture.width + 120;
    rowHeight = Math.max(rowHeight, capture.height);
  }
  if (missing.size) log(`Ersetzt durch Inter (Schrift fehlt in Figma): ${[...missing].join(', ')}`);
  figma.viewport.scrollAndZoomIntoView(page.children);
  figma.notify(`${captures.length} Zustände eingelesen`);
}

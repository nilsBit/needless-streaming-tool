export type Color = { hex: string; alpha: number; token?: string };
type Border = { width: number; style: string; color: Color };
export type CaptureNode = {
  kind: 'box' | 'text' | 'image' | 'svg';
  name: string; x: number; y: number; width: number; height: number; opacity: number;
  fill?: Color; borders?: { top: Border; right: Border; bottom: Border; left: Border };
  radii?: [number, number, number, number]; clips?: boolean;
  shadow?: { x: number; y: number; blur: number; spread: number; color: Color };
  text?: { content: string; family: string; size: number; weight: number; italic: boolean; color: Color;
           lineHeight: number; letterSpacing: number; align: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED'; transform?: string };
  image?: { dataUrl: string }; svg?: { source: string }; children?: CaptureNode[];
};
export type Capture = { overlay: string; state: string; width: number; height: number;
  tokens: Record<string, string>; preview: string; nodes: CaptureNode[]; motion?: string[] };

/** The note under each frame is found again by this name when the frame is sent back. */
export const NOTE_SUFFIX = ' · Notiz';
export const WISHES = 'Wünsche:';

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

/** Replaces `var(--x)` / `var(--x, fallback)` and `currentColor` in an SVG source with literal values, since Figma's SVG importer cannot resolve CSS custom properties. */
function resolveSvgTokens(source: string, tokens: Record<string, string>): string {
  const resolveVar = (_match: string, name: string, fallback?: string): string =>
    tokens[name] ?? fallback?.trim() ?? tokens['--color-text'] ?? '';
  return source
    .replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)/g, resolveVar)
    .replace(/currentColor/g, () => tokens['--color-text'] ?? '');
}

const CASE_BY_TRANSFORM: Record<string, TextCase> = { uppercase: 'UPPER', lowercase: 'LOWER', capitalize: 'TITLE' };

const STYLE_BY_WEIGHT: Record<number, string> = { 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold' };

function normalizeFontToken(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '');
}

function findFont(fonts: Font[], family: string, style: string): FontName | undefined {
  const family_ = normalizeFontToken(family);
  const style_ = normalizeFontToken(style);
  return fonts.find((f) => normalizeFontToken(f.fontName.family) === family_ && normalizeFontToken(f.fontName.style) === style_)?.fontName;
}

/** Order: requested family+style → same family Regular/Italic → Inter with matched style → Inter Regular. */
async function loadFont(
  fonts: Font[], family: string, weight: number, italic: boolean,
  missing: Set<string>, styleFallbacks: Set<string>,
): Promise<FontName> {
  const base = STYLE_BY_WEIGHT[weight] ?? 'Regular';
  const style = italic ? (base === 'Regular' ? 'Italic' : `${base} Italic`) : base;
  const familyFallbackStyle = italic ? 'Italic' : 'Regular';

  const exact = findFont(fonts, family, style);
  if (exact) { await figma.loadFontAsync(exact); return exact; }

  const sameFamily = findFont(fonts, family, familyFallbackStyle);
  if (sameFamily) {
    styleFallbacks.add(`${family} ${style} → ${sameFamily.style}`);
    await figma.loadFontAsync(sameFamily);
    return sameFamily;
  }

  const interStyled = findFont(fonts, 'Inter', style);
  if (interStyled) {
    missing.add(`${family} ${style}`);
    await figma.loadFontAsync(interStyled);
    return interStyled;
  }

  const interRegular = findFont(fonts, 'Inter', 'Regular');
  if (interRegular) {
    missing.add(`${family} ${style}`);
    await figma.loadFontAsync(interRegular);
    return interRegular;
  }

  throw new Error('Inter Regular fehlt — Figma-Installation prüfen.');
}

function bytesOf(dataUrl: string): Uint8Array {
  return figma.base64Decode(dataUrl.slice(dataUrl.indexOf(',') + 1));
}

type BuildContext = {
  variables: Map<string, Variable>; tokens: Record<string, string>; fonts: Font[]; frameName: string;
  log: (text: string) => void; missing: Set<string>; styleFallbacks: Set<string>;
};

async function build(node: CaptureNode, parent: FrameNode, ctx: BuildContext): Promise<void> {
  try {
    if (node.kind === 'svg' && node.svg) {
      const svg = figma.createNodeFromSvg(resolveSvgTokens(node.svg.source, ctx.tokens));
      svg.name = node.name; svg.x = node.x; svg.y = node.y; svg.resize(Math.max(node.width, 0.01), Math.max(node.height, 0.01));
      svg.opacity = node.opacity;
      parent.appendChild(svg);
      return;
    }
    if (node.kind === 'image' && node.image) {
      const rect = figma.createRectangle();
      rect.name = node.name; rect.x = node.x; rect.y = node.y;
      rect.resize(Math.max(node.width, 0.01), Math.max(node.height, 0.01));
      rect.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: figma.createImage(bytesOf(node.image.dataUrl)).hash }];
      rect.opacity = node.opacity;
      parent.appendChild(rect);
      return;
    }
    if (node.kind === 'text' && node.text) {
      const t = figma.createText();
      t.fontName = await loadFont(ctx.fonts, node.text.family, node.text.weight, node.text.italic, ctx.missing, ctx.styleFallbacks);
      t.characters = node.text.content;
      t.fontSize = node.text.size;
      t.lineHeight = { unit: 'PIXELS', value: node.text.lineHeight };
      t.letterSpacing = { unit: 'PIXELS', value: node.text.letterSpacing };
      t.textAlignHorizontal = node.text.align;
      t.fills = [paint(node.text.color, ctx.variables)];
      t.opacity = node.opacity;
      // Set before any width is measured/auto-resized below — text-transform
      // changes the rendered (and therefore auto-resized) width.
      t.textCase = CASE_BY_TRANSFORM[node.text.transform ?? ''] ?? 'ORIGINAL';
      if (node.height < 1.5 * node.text.lineHeight) {
        // Single line: let the box hug the text and keep its anchored edge in place.
        t.textAutoResize = 'WIDTH_AND_HEIGHT';
        let x = node.x;
        if (node.text.align === 'CENTER') x = node.x + (node.width - t.width) / 2;
        else if (node.text.align === 'RIGHT') x = node.x + (node.width - t.width);
        t.x = x; t.y = node.y;
      } else {
        t.resize(Math.max(node.width, 1) + 2, Math.max(node.height, 1));
        t.textAutoResize = 'HEIGHT';
        t.x = node.x; t.y = node.y;
      }
      parent.appendChild(t);
      return;
    }
    const f = figma.createFrame();
    f.name = node.name; f.x = node.x; f.y = node.y; f.resize(Math.max(node.width, 0.01), Math.max(node.height, 0.01));
    f.clipsContent = node.clips ?? false;
    f.opacity = node.opacity;
    f.fills = node.fill ? [paint(node.fill, ctx.variables)] : [];
    if (node.borders) {
      const sides = [node.borders.top, node.borders.right, node.borders.bottom, node.borders.left];
      const first = sides.find((s) => s.width > 0);
      if (first) {
        f.strokes = [paint(first.color, ctx.variables)];
        f.strokeAlign = 'INSIDE';
        f.strokeTopWeight = node.borders.top.width; f.strokeRightWeight = node.borders.right.width;
        f.strokeBottomWeight = node.borders.bottom.width; f.strokeLeftWeight = node.borders.left.width;
      }
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
    for (const child of node.children ?? []) await build(child, f, ctx);
  } catch (e) {
    ctx.log(`Übersprungen: ${ctx.frameName} › ${node.name} (${e instanceof Error ? e.message : String(e)})`);
  }
}

/**
 * Figma holds still images, so the note says in words what moves — as the
 * code does it now — and leaves room for what should change. It is a frame
 * of its own so it grows while typing; sending skips it as a draft and
 * carries its text along with the frame it belongs to.
 */
async function addNote(capture: Capture, frame: FrameNode, fonts: Font[]): Promise<FrameNode> {
  const font = findFont(fonts, 'Inter', 'Regular');
  if (!font) throw new Error('Inter Regular fehlt — Figma-Installation prüfen.');
  await figma.loadFontAsync(font);
  const motion = capture.motion ?? [];
  const note = figma.createFrame();
  note.name = frame.name + NOTE_SUFFIX;
  // Width first: resizing an auto-layout frame would pin its height as well.
  note.resize(Math.min(Math.max(capture.width, 360), 800), 100);
  note.layoutMode = 'VERTICAL';
  note.primaryAxisSizingMode = 'AUTO';
  note.counterAxisSizingMode = 'FIXED';
  note.paddingTop = note.paddingBottom = note.paddingLeft = note.paddingRight = 16;
  note.cornerRadius = 6;
  note.fills = [{ type: 'SOLID', color: { r: 1, g: 0.95, b: 0.75 } }];
  const text = figma.createText();
  text.fontName = font;
  text.fontSize = 13;
  text.lineHeight = { unit: 'PERCENT', value: 140 };
  text.fills = [{ type: 'SOLID', color: { r: 0.17, g: 0.15, b: 0.12 } }];
  text.characters = [
    motion.length ? 'So bewegt es sich jetzt:' : 'Hier bewegt sich nichts.',
    ...motion,
    '',
    WISHES,
    '',
  ].join('\n');
  note.appendChild(text);
  text.layoutSizingHorizontal = 'FILL';
  text.textAutoResize = 'HEIGHT';
  note.x = frame.x;
  note.y = frame.y + frame.height + 24;
  frame.parent?.appendChild(note);
  return note;
}

/** One new page per import — never touches frames already designed. */
export async function importCaptures(captures: Capture[], log: (text: string) => void): Promise<void> {
  if (captures.length === 0) { log('Keine Erfassungen gefunden. Erst `npm run showcase:capture` laufen lassen.'); return; }
  const variables = await ensureVariables(captures[0].tokens);
  const fonts = await figma.listAvailableFontsAsync();
  const page = figma.createPage();
  const now = new Date();
  page.name = `Import ${now.toLocaleDateString('de-DE')} ${now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
  await figma.setCurrentPageAsync(page);

  const missing = new Set<string>();
  const styleFallbacks = new Set<string>();
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

    const ctx: BuildContext = { variables, tokens: capture.tokens, fonts, frameName: frame.name, log, missing, styleFallbacks };
    for (const node of capture.nodes) await build(node, frame, ctx);
    const note = await addNote(capture, frame, fonts);
    log(`${frame.name} ✓`);
    x += Math.max(capture.width, note.width) + 120;
    rowHeight = Math.max(rowHeight, capture.height + 24 + note.height);
  }
  if (missing.size) log(`Ersetzt durch Inter (Schrift fehlt in Figma): ${[...missing].join(', ')}`);
  if (styleFallbacks.size) log(`Schriftschnitt angepasst (nicht verfügbar): ${[...styleFallbacks].join(', ')}`);
  figma.viewport.scrollAndZoomIntoView(page.children);
  figma.notify(`${captures.length} Zustände eingelesen`);
}

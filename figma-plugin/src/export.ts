type Json = Record<string, unknown>;

async function variableName(id: string | undefined): Promise<string | undefined> {
  if (!id) return undefined;
  return (await figma.variables.getVariableByIdAsync(id))?.name;
}

async function paints(list: readonly Paint[] | typeof figma.mixed): Promise<Json[]> {
  if (list === figma.mixed) return [];
  const out: Json[] = [];
  for (const p of list) {
    if (p.type === 'SOLID') {
      const c = p.color;
      const hex = '#' + [c.r, c.g, c.b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
      out.push({ type: 'SOLID', hex, alpha: p.opacity ?? 1, variable: await variableName(p.boundVariables?.color?.id), visible: p.visible !== false });
    } else {
      out.push({ type: p.type, visible: p.visible !== false });
    }
  }
  return out;
}

/** `isRoot` is true only for the exported frame itself: its position is reported as 0/0 (children stay
 *  parent-relative), and only its DIRECT children named "Vorlage" are dropped from the tree. */
async function tree(node: SceneNode, isRoot = false): Promise<Json> {
  const out: Json = { name: node.name, type: node.type, x: isRoot ? 0 : node.x, y: isRoot ? 0 : node.y, width: node.width, height: node.height, visible: node.visible };
  if ('opacity' in node) out.opacity = node.opacity;
  if ('fills' in node) out.fills = await paints(node.fills);
  if ('strokes' in node) out.strokes = await paints(node.strokes);
  if ('strokeTopWeight' in node) out.strokeWeights = [node.strokeTopWeight, node.strokeRightWeight, node.strokeBottomWeight, node.strokeLeftWeight];
  if ('topLeftRadius' in node) out.radii = [node.topLeftRadius, node.topRightRadius, node.bottomRightRadius, node.bottomLeftRadius];
  if ('effects' in node) out.effects = node.effects.map((e) => ({ ...e }));
  if ('layoutMode' in node && node.layoutMode !== 'NONE') {
    out.layout = { mode: node.layoutMode, gap: node.itemSpacing, padding: [node.paddingTop, node.paddingRight, node.paddingBottom, node.paddingLeft],
      primaryAlign: node.primaryAxisAlignItems, counterAlign: node.counterAxisAlignItems };
  }
  if (node.type === 'TEXT') {
    out.text = { characters: node.characters, fontName: node.fontName === figma.mixed ? 'mixed' : node.fontName,
      fontSize: node.fontSize === figma.mixed ? 'mixed' : node.fontSize, lineHeight: node.lineHeight === figma.mixed ? 'mixed' : node.lineHeight,
      letterSpacing: node.letterSpacing === figma.mixed ? 'mixed' : node.letterSpacing, align: node.textAlignHorizontal,
      textCase: node.textCase === figma.mixed ? 'mixed' : node.textCase };
  }
  if (node.type === 'INSTANCE') out.component = (await node.getMainComponentAsync())?.name;
  if ('children' in node) {
    const children = isRoot ? node.children.filter((c) => c.name !== 'Vorlage') : node.children;
    out.children = await Promise.all(children.map((c) => tree(c)));
  }
  return out;
}

async function variableValues(): Promise<Json> {
  const collection = (await figma.variables.getLocalVariableCollectionsAsync()).find((c) => c.name === 'NST');
  if (!collection) return {};
  const modeId = collection.modes[0].modeId;
  const values: Json = {};
  for (const id of collection.variableIds) {
    const v = await figma.variables.getVariableByIdAsync(id);
    if (v) values[v.name] = v.valuesByMode[modeId];
  }
  return values;
}

export type Draft = { frameId: string; frameName: string; overlay: string | null; state: string | null; draft: Json; image: string; image2x: string };

/** Exports every FRAME in the current selection as a Draft: a JSON tree plus 1x/2x PNGs.
 *  A "Vorlage" direct child (the import side's hidden reference image, which the user may have made
 *  visible again while designing) is hidden for the PNG export and its visibility restored afterwards,
 *  whatever happens during export. */
export async function exportSelection(log: (text: string) => void): Promise<Draft[]> {
  const frames = figma.currentPage.selection.filter((n): n is FrameNode => n.type === 'FRAME');
  if (frames.length === 0) return [];
  log(`Exportiere ${frames.length} Frame${frames.length === 1 ? '' : 's'} …`);
  const variables = await variableValues();
  const drafts: Draft[] = [];
  for (const frame of frames) {
    const m = frame.name.match(/^\s*([a-z0-9-]+)\s*\/\s*([a-z0-9-]+)\s*$/);
    const templates = frame.children.filter((c) => c.name === 'Vorlage');
    const wasVisible = templates.map((c) => c.visible);
    templates.forEach((c) => { c.visible = false; });
    let image: string;
    let image2x: string;
    try {
      image = figma.base64Encode(await frame.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 1 } }));
      image2x = figma.base64Encode(await frame.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 2 } }));
    } finally {
      templates.forEach((c, i) => { c.visible = wasVisible[i]; });
    }
    const draft = { ...(await tree(frame, true)), variables };
    drafts.push({ frameId: frame.id, frameName: frame.name, overlay: m ? m[1] : null, state: m ? m[2] : null, draft, image, image2x });
  }
  return drafts;
}

/* Runs inside the overlay page. Turns the rendered DOM into the node tree
   the Figma plugin rebuilds. Only what Figma can hold is read. */
(({ tokens }) => {
  const tokenByHex = {};
  for (const [name, value] of Object.entries(tokens)) {
    if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) tokenByHex[value.toLowerCase()] = name;
  }

  function withToken(hex, alpha) {
    const out = { hex, alpha };
    if (tokenByHex[hex]) out.token = tokenByHex[hex];
    return out;
  }

  function channel(v) {
    return v.endsWith('%') ? parseFloat(v) / 100 : Number(v);
  }

  // Parses whichever color syntax occurs FIRST in the string: the rgb()/
  // rgba() form Chrome normally serializes computed colors as, or the
  // color(srgb r g b [/ a]) form it uses for color-mix() results (every
  // --lex-* tone in lexikon.css resolves through color-mix()). Both
  // alternatives live in one regex so the match is the leftmost one overall,
  // not just the leftmost of whichever pattern happens to be tried first —
  // that's what makes the gradient "first stop" approximation below actually
  // pick the first stop, not whichever stop this function's own preference
  // between the two syntaxes would otherwise have favoured.
  function color(css) {
    if (!css) return null;
    const m = css.match(
      /rgba?\(([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+%?))?\)|color\(srgb\s+([\d.]+%?)\s+([\d.]+%?)\s+([\d.]+%?)(?:\s*\/\s*([\d.]+%?))?\s*\)/,
    );
    if (!m) return null;
    if (m[1] !== undefined) {
      const hex = '#' + [m[1], m[2], m[3]].map((v) => Math.round(Number(v)).toString(16).padStart(2, '0')).join('');
      const alpha = m[4] === undefined ? 1 : channel(m[4]);
      return withToken(hex, alpha);
    }
    const hex = '#' + [m[5], m[6], m[7]].map((v) => Math.round(Math.min(1, Math.max(0, channel(v))) * 255).toString(16).padStart(2, '0')).join('');
    const alpha = m[8] === undefined ? 1 : channel(m[8]);
    return withToken(hex, alpha);
  }

  function border(style, side) {
    const width = parseFloat(style[`border${side}Width`]) || 0;
    const borderStyle = style[`border${side}Style`];
    if (width === 0 || borderStyle === 'none') return { width: 0, style: 'none', color: { hex: '#000000', alpha: 0 } };
    return { width, style: borderStyle, color: color(style[`border${side}Color`]) ?? { hex: '#000000', alpha: 0 } };
  }

  function shadow(css) {
    if (!css || css === 'none') return undefined;
    const colorPattern = /rgba?\([^)]*\)|color\([^)]*\)/;
    const c = css.match(colorPattern);
    const nums = css.replace(colorPattern, '').trim().split(/\s+/).map(parseFloat);
    if (!c || nums.length < 2) return undefined;
    return { x: nums[0] || 0, y: nums[1] || 0, blur: nums[2] || 0, spread: nums[3] || 0, color: color(c[0]) ?? { hex: '#000000', alpha: 1 } };
  }

  function align(v) {
    return v === 'center' ? 'CENTER' : v === 'right' || v === 'end' ? 'RIGHT' : v === 'justify' ? 'JUSTIFIED' : 'LEFT';
  }

  function imageData(img) {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/png');
    } catch {
      return null;
    }
  }

  function visible(el, style, rect) {
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0 && Number(style.opacity) > 0;
  }

  // Pseudo-elements have no DOM node, so getBoundingClientRect() can't tell
  // us their real box — there is nothing to call it on. Width for a text
  // pseudo is estimated with canvas measureText() (accurate enough for a
  // single run of text in the resolved font); a box pseudo's box is only
  // emitted when the author gave it an explicit width/height, which computed
  // style does report even without a node.
  let _measureCtx;
  function measureCtx() {
    if (!_measureCtx) _measureCtx = document.createElement('canvas').getContext('2d');
    return _measureCtx;
  }

  /** The literal string a `content: '…'` / `content: "…"` computed value holds, or null for anything else (none, normal, url(), counter(), attr(), …). */
  function pseudoContent(style) {
    const content = style.content;
    if (!content || content === 'none' || content === 'normal') return null;
    const m = content.match(/^["'](.*)["']$/s);
    return m ? m[1] : null;
  }

  function pseudoVisible(style) {
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0;
  }

  // ::before sits at the element's content-box top-left, like a first child.
  // ::after is approximated at the content-box right edge, top-aligned — the
  // real end of text flow around any siblings can't be read without a DOM
  // node for the pseudo box, so this can overshoot for wide ::after text or
  // one that follows other content. Both are a starting point for Figma
  // editing, not a pixel-exact placement.
  function pseudoText(el, side, rect) {
    const style = getComputedStyle(el, side);
    const text = pseudoContent(style);
    if (!text || !pseudoVisible(style)) return null;

    const paddingLeft = parseFloat(style.paddingLeft) || 0;
    const paddingRight = parseFloat(style.paddingRight) || 0;
    const paddingTop = parseFloat(style.paddingTop) || 0;
    const borderLeft = parseFloat(style.borderLeftWidth) || 0;
    const borderRight = parseFloat(style.borderRightWidth) || 0;
    const borderTop = parseFloat(style.borderTopWidth) || 0;

    const family = style.fontFamily.split(',')[0].replace(/["']/g, '').trim();
    const size = parseFloat(style.fontSize);
    const weight = Number(style.fontWeight) || 400;
    const italic = style.fontStyle === 'italic';
    const lineHeight = style.lineHeight === 'normal' ? size * 1.2 : parseFloat(style.lineHeight);
    let textColor = color(style.color);
    if (!textColor) { textColor = { hex: '#000000', alpha: 1 }; unreadable++; }

    const ctx = measureCtx();
    ctx.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${family}`;
    const width = Math.max(ctx.measureText(text).width, 1);
    const x = side === '::before' ? paddingLeft + borderLeft : Math.max(0, rect.width - paddingRight - borderRight - width);
    const y = paddingTop + borderTop;

    return {
      kind: 'text', name: side, x, y, width, height: lineHeight, opacity: Number(style.opacity),
      text: {
        content: text, family, size, weight, italic, color: textColor,
        lineHeight, letterSpacing: parseFloat(style.letterSpacing) || 0, align: align(style.textAlign),
        transform: style.textTransform,
      },
    };
  }

  /** Only emitted when the pseudo has an explicit, non-zero size and something visible to draw. */
  function pseudoBox(el, side, rect) {
    const style = getComputedStyle(el, side);
    if (pseudoContent(style) === null || !pseudoVisible(style)) return null;

    const width = parseFloat(style.width) || 0;
    const height = parseFloat(style.height) || 0;
    if (width <= 0 || height <= 0) return null;

    const fill = color(style.backgroundColor);
    const borders = { top: border(style, 'Top'), right: border(style, 'Right'), bottom: border(style, 'Bottom'), left: border(style, 'Left') };
    const hasBorder = Object.values(borders).some((b) => b.width > 0);
    const hasFill = fill && fill.alpha > 0;
    if (!hasFill && !hasBorder) return null;

    const node = {
      kind: 'box', name: side, opacity: Number(style.opacity),
      x: side === '::before' ? 0 : Math.max(0, rect.width - width), y: 0, width, height,
    };
    if (hasFill) node.fill = fill;
    if (hasBorder) node.borders = borders;
    const radii = [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius].map((r) => parseFloat(r) || 0);
    if (radii.some((r) => r > 0)) node.radii = radii;
    return node;
  }

  // The Lexikon double frame (`.lex-voll`'s inset `outline`) has no Figma
  // stroke equivalent that sits independently of the element's own border,
  // so it comes through as its own borders-only child box.
  function outlineNode(style, rect) {
    const width = parseFloat(style.outlineWidth) || 0;
    if (width === 0 || style.outlineStyle === 'none') return null;
    const offset = parseFloat(style.outlineOffset) || 0;
    const pos = -offset - width;
    const grow = 2 * (offset + width);
    const side = { width, style: style.outlineStyle, color: color(style.outlineColor) ?? { hex: '#000000', alpha: 0 } };
    return {
      kind: 'box', name: '::outline', opacity: 1,
      x: pos, y: pos, width: rect.width + grow, height: rect.height + grow,
      borders: { top: side, right: side, bottom: side, left: side },
    };
  }

  // Text color must always be a usable value for Figma — an unparseable one
  // is rare (it would mean an unhandled computed-color syntax) but silently
  // falling back beats dropping the text's color entirely.
  let unreadable = 0;

  function read(el, origin) {
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    if (!visible(el, style, rect)) return null;
    const base = {
      name: el.tagName.toLowerCase() + (el.classList.length ? '.' + [...el.classList].join('.') : ''),
      x: rect.left - origin.left, y: rect.top - origin.top, width: rect.width, height: rect.height,
      opacity: Number(style.opacity),
    };

    if (el.tagName === 'svg') return { kind: 'svg', ...base, svg: { source: el.outerHTML } };
    if (el.tagName === 'IMG') {
      const dataUrl = imageData(el);
      return dataUrl ? { kind: 'image', ...base, image: { dataUrl } } : null;
    }

    const node = { kind: 'box', ...base };
    let fill = color(style.backgroundColor);
    if ((!fill || fill.alpha === 0) && /gradient/.test(style.backgroundImage)) {
      // Figma fills are flat; approximate a gradient with its first stop.
      fill = color(style.backgroundImage) ?? fill;
    }
    if (fill && fill.alpha > 0) node.fill = fill;
    const borders = { top: border(style, 'Top'), right: border(style, 'Right'), bottom: border(style, 'Bottom'), left: border(style, 'Left') };
    if (Object.values(borders).some((b) => b.width > 0)) node.borders = borders;
    const radii = [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius].map((r) => parseFloat(r) || 0);
    if (radii.some((r) => r > 0)) node.radii = radii;
    const sh = shadow(style.boxShadow);
    if (sh) node.shadow = sh;

    const children = [];
    for (const child of el.childNodes) {
      if (child.nodeType === Node.TEXT_NODE && child.textContent.trim() !== '') {
        const range = document.createRange();
        range.selectNodeContents(child);
        const r = range.getBoundingClientRect();
        if (r.width === 0) continue;
        const lineHeight = style.lineHeight === 'normal' ? parseFloat(style.fontSize) * 1.2 : parseFloat(style.lineHeight);
        let textColor = color(style.color);
        if (!textColor) {
          textColor = { hex: '#000000', alpha: 1 };
          unreadable++;
        }
        children.push({
          kind: 'text', name: '#text',
          x: r.left - rect.left, y: r.top - rect.top, width: r.width, height: r.height, opacity: 1,
          text: {
            content: child.textContent.replace(/\s+/g, ' ').trim(),
            family: style.fontFamily.split(',')[0].replace(/["']/g, '').trim(),
            size: parseFloat(style.fontSize), weight: Number(style.fontWeight) || 400,
            italic: style.fontStyle === 'italic', color: textColor,
            lineHeight, letterSpacing: parseFloat(style.letterSpacing) || 0, align: align(style.textAlign),
            transform: style.textTransform,
          },
        });
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const c = read(child, rect);
        if (c) children.push(c);
      }
    }
    // Rendered before any real content, like the browser paints it. The text
    // is unshifted after the box so it ends up drawn on top of it, the way a
    // single ::before box would show its own background behind its content.
    const beforeText = pseudoText(el, '::before', rect);
    if (beforeText) children.unshift(beforeText);
    const beforeBox = pseudoBox(el, '::before', rect);
    if (beforeBox) children.unshift(beforeBox);
    const afterBox = pseudoBox(el, '::after', rect);
    if (afterBox) children.push(afterBox);
    const afterText = pseudoText(el, '::after', rect);
    if (afterText) children.push(afterText);
    const outline = outlineNode(style, rect);
    if (outline) children.push(outline);
    if (children.length) node.children = children;
    // A box with nothing to draw and nothing inside is noise in Figma.
    if (!node.fill && !node.borders && !node.shadow && !node.children) return null;
    return node;
  }

  const bodyRect = document.body.getBoundingClientRect();
  const origin = { left: 0, top: 0, width: bodyRect.width, height: bodyRect.height };
  const nodes = [...document.body.children].map((el) => read(el, origin)).filter(Boolean);
  return { nodes, unreadable };
});

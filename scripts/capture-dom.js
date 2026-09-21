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
          },
        });
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const c = read(child, rect);
        if (c) children.push(c);
      }
    }
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

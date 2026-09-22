/* Runs inside the overlay page. Turns the rendered DOM into the node tree
   the Figma plugin rebuilds. Only what Figma can hold is read — and what
   moves, written out for the note under the frame. */
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

  // Figma fills are flat; a gradient comes through as its first stop.
  function fillOf(style) {
    let fill = color(style.backgroundColor);
    if ((!fill || fill.alpha === 0) && /gradient/.test(style.backgroundImage)) fill = color(style.backgroundImage) ?? fill;
    return fill && fill.alpha > 0 ? fill : null;
  }

  // Computed style keeps a percentage radius as `50%`; Figma needs pixels.
  function radiiOf(style, width, height) {
    const side = Math.min(width, height);
    const radii = [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius]
      .map((r) => (r.endsWith('%') ? (parseFloat(r) / 100) * side : parseFloat(r) || 0));
    return radii.some((r) => r > 0) ? radii : null;
  }

  function textNode(name, content, r, style, rect, opacity) {
    const size = parseFloat(style.fontSize);
    const lineHeight = style.lineHeight === 'normal' ? size * 1.2 : parseFloat(style.lineHeight);
    let textColor = color(style.color);
    if (!textColor) {
      textColor = { hex: '#000000', alpha: 1 };
      unreadable++;
    }
    return {
      kind: 'text', name,
      x: r.left - rect.left, y: r.top - rect.top, width: r.width, height: r.height, opacity,
      text: {
        content,
        family: style.fontFamily.split(',')[0].replace(/["']/g, '').trim(),
        size, weight: Number(style.fontWeight) || 400,
        italic: style.fontStyle === 'italic', color: textColor,
        lineHeight, letterSpacing: parseFloat(style.letterSpacing) || 0, align: align(style.textAlign),
        transform: style.textTransform,
      },
    };
  }

  function rangeRect(node, start, end) {
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, end);
    return range.getBoundingClientRect();
  }

  // A styled ::first-letter (the Lexikon drop cap) is part of the text node,
  // so it comes out as a text layer of its own. Figma text cannot flow around
  // it: the lines beside the cap and the lines below it become two more
  // layers, split where the browser wrapped them.
  function firstLetterNodes(el, style, child, rect) {
    const fl = getComputedStyle(el, '::first-letter');
    if (fl.float === 'none' && fl.fontSize === style.fontSize && fl.color === style.color) return null;
    const text = child.textContent;
    const start = text.length - text.trimStart().length;
    const letter = text.slice(start).match(/^\p{P}*\S/u);
    if (!letter) return null;
    const end = start + letter[0].length;
    const capRect = rangeRect(child, start, end);
    if (capRect.width === 0) return null;

    // A drop cap's line height is tighter than its glyph box. CSS centers the
    // line box on the glyphs, and so does Figma — place it the same way.
    const cap = textNode('::first-letter', letter[0], capRect, fl, rect, 1);
    cap.height = cap.text.lineHeight;
    cap.y = capRect.top + capRect.height / 2 - cap.height / 2 - rect.top;

    let split = text.length;
    for (let i = end; i < text.length; i++) {
      if (/\s/.test(text[i])) continue;
      const r = rangeRect(child, i, i + 1);
      if (r.width > 0 && r.left < capRect.right - 0.5) { split = i; break; }
    }
    const nodes = [cap];
    for (const [a, b] of [[end, split], [split, text.length]]) {
      const content = text.slice(a, b).replace(/\s+/g, ' ').trim();
      if (content) nodes.push(textNode('#text', content, rangeRect(child, a, b), style, rect, 1));
    }
    return nodes;
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

  // Pseudo-elements have no DOM node, so getBoundingClientRect() has nothing
  // to measure. For a moment a stand-in element carries the pseudo's computed
  // style in its place, with the real pseudo hidden — the browser lays it out
  // exactly where the pseudo sits, flex-grown rules and all.
  let hidePseudos;
  function pseudoRect(el, side, style, text) {
    if (!hidePseudos) {
      hidePseudos = document.createElement('style');
      hidePseudos.textContent = '[data-capture-hide="::before"]::before, [data-capture-hide="::after"]::after { display: none !important; }';
      document.head.appendChild(hidePseudos);
    }
    const standIn = document.createElement('capture-pseudo');
    for (const prop of style) if (prop !== 'content') standIn.style.setProperty(prop, style.getPropertyValue(prop));
    standIn.textContent = text;
    el.setAttribute('data-capture-hide', side);
    if (side === '::before') el.insertBefore(standIn, el.firstChild);
    else el.appendChild(standIn);
    const r = standIn.getBoundingClientRect();
    standIn.remove();
    el.removeAttribute('data-capture-hide');
    return r;
  }

  function pseudoText(el, side, rect) {
    const style = getComputedStyle(el, side);
    const text = pseudoContent(style);
    if (!text || !pseudoVisible(style)) return null;
    const r = pseudoRect(el, side, style, text);
    return r.width > 0 ? textNode(side, text, r, style, rect, Number(style.opacity)) : null;
  }

  /** Only emitted when the pseudo has something visible to draw. */
  function pseudoBox(el, side, rect) {
    const style = getComputedStyle(el, side);
    const text = pseudoContent(style);
    if (text === null || !pseudoVisible(style)) return null;

    const fill = fillOf(style);
    const borders = { top: border(style, 'Top'), right: border(style, 'Right'), bottom: border(style, 'Bottom'), left: border(style, 'Left') };
    const hasBorder = Object.values(borders).some((b) => b.width > 0);
    if (!fill && !hasBorder) return null;

    const r = pseudoRect(el, side, style, text);
    if (r.width <= 0 || r.height <= 0) return null;
    const node = {
      kind: 'box', name: side, opacity: Number(style.opacity),
      x: r.left - rect.left, y: r.top - rect.top, width: r.width, height: r.height,
    };
    if (fill) node.fill = fill;
    if (hasBorder) node.borders = borders;
    const radii = radiiOf(style, r.width, r.height);
    if (radii) node.radii = radii;
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
    const fill = fillOf(style);
    if (fill) node.fill = fill;
    const borders = { top: border(style, 'Top'), right: border(style, 'Right'), bottom: border(style, 'Bottom'), left: border(style, 'Left') };
    if (Object.values(borders).some((b) => b.width > 0)) node.borders = borders;
    const radii = radiiOf(style, rect.width, rect.height);
    if (radii) node.radii = radii;
    const sh = shadow(style.boxShadow);
    if (sh) node.shadow = sh;
    // What overflows here is cut off in the browser — the round portrait
    // seal, a line-clamped paragraph. Figma cuts it off the same way.
    if (style.overflowX !== 'visible' || style.overflowY !== 'visible') node.clips = true;

    const children = [];
    let first = true;
    for (const child of el.childNodes) {
      if (child.nodeType === Node.TEXT_NODE && child.textContent.trim() !== '') {
        const r = rangeRect(child, 0, child.length);
        if (r.width === 0) continue;
        const dropCap = first ? firstLetterNodes(el, style, child, rect) : null;
        if (dropCap) children.push(...dropCap);
        else children.push(textNode('#text', child.textContent.replace(/\s+/g, ' ').trim(), r, style, rect, 1));
        first = false;
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const c = read(child, rect);
        if (c) {
          children.push(c);
          first = false;
        }
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

  // Figma holds still images only, so what moves is written out instead —
  // the plugin puts it into the note under each frame.
  function seconds(v) {
    return parseFloat(v).toLocaleString('de-DE') + ' s';
  }

  /** The i-th entry of a comma-separated computed list; commas inside cubic-bezier(…) don't count. */
  function nth(list, i) {
    const parts = list.split(/,\s*(?![^()]*\))/);
    return parts[i % parts.length];
  }

  function keyframeRules() {
    const byName = {};
    const walk = (rules) => {
      for (const rule of rules) {
        if (rule instanceof CSSKeyframesRule) byName[rule.name] = rule;
        else if (rule.cssRules) walk(rule.cssRules);
      }
    };
    for (const sheet of document.styleSheets) {
      try {
        walk(sheet.cssRules);
      } catch {
        // A cross-origin sheet (Google Fonts) can't be read — it holds no motion.
      }
    }
    return byName;
  }

  const DIRECTION = { alternate: 'hin und zurück', reverse: 'rückwärts', 'alternate-reverse': 'hin und zurück, rückwärts' };

  function motion() {
    const keyframes = keyframeRules();
    const groups = new Map();
    // Same element kind and same motion make one line — even when each gets
    // its own duration or delay (staggered bars, randomly timed sparkles).
    const add = (key, head, rest, detail, duration, delay) => {
      const group = groups.get(key) ?? { head, rest, detail, durations: [], delays: [] };
      group.durations.push(duration);
      group.delays.push(delay);
      groups.set(key, group);
    };
    for (const el of document.body.querySelectorAll('*')) {
      for (const side of ['', '::before', '::after']) {
        const s = getComputedStyle(el, side || null);
        const label = el.tagName.toLowerCase() + (el.classList.length ? '.' + [...el.classList].join('.') : '') + side;
        if (s.animationName !== 'none') {
          s.animationName.split(/,\s*/).forEach((name, i) => {
            if (name === 'none') return;
            const iterations = nth(s.animationIterationCount, i);
            const parts = [iterations === 'infinite' ? 'endlos' : iterations === '1' ? 'einmal' : `${iterations} ×`];
            const direction = DIRECTION[nth(s.animationDirection, i)];
            if (direction) parts.push(direction);
            parts.push(nth(s.animationTimingFunction, i));
            const rule = keyframes[name];
            const detail = rule
              ? [...rule.cssRules].map((k) => `${k.keyText}: ${[...k.style].map((p) => `${p} ${k.style.getPropertyValue(p)}`).join(', ')}`).join(' → ')
              : '';
            add(`${label}|${name}|${parts}`, `${label} — ${name}: `, `, ${parts.join(', ')}`, detail, nth(s.animationDuration, i), nth(s.animationDelay, i));
          });
        }
        if (s.transitionDuration.split(/,\s*/).some((d) => parseFloat(d) > 0)) {
          const list = s.transitionProperty.split(/,\s*/)
            .map((p, i) => `${p} ${seconds(nth(s.transitionDuration, i))} ${nth(s.transitionTimingFunction, i)}`).join(', ');
          add(`${label}|transition|${list}`, `${label} — Übergang: ${list}`, '', '', null, nth(s.transitionDelay, 0));
        }
      }
    }
    // One value as is, a handful listed, more than that as a range.
    const spread = (values) => {
      const distinct = [...new Set(values)];
      if (distinct.length === 1) return seconds(distinct[0]);
      if (values.length <= 6) return values.map(seconds).join(' / ');
      const sorted = distinct.map(parseFloat).sort((a, b) => a - b);
      return `${seconds(sorted[0]).replace(' s', '')}–${seconds(sorted.at(-1))}`;
    };
    return [...groups.values()].map(({ head, rest, detail, durations, delays }) => {
      const duration = durations[0] === null ? '' : spread(durations);
      const staggered = new Set(delays).size > 1;
      const delay = staggered ? `, versetzt ${spread(delays)}` : parseFloat(delays[0]) ? `, nach ${seconds(delays[0])}` : '';
      return `• ${delays.length > 1 ? delays.length + ' × ' : ''}${head}${duration}${rest}${delay}${detail ? '\n   ' + detail : ''}`;
    });
  }

  const bodyRect = document.body.getBoundingClientRect();
  const origin = { left: 0, top: 0, width: bodyRect.width, height: bodyRect.height };
  const nodes = [...document.body.children].map((el) => read(el, origin)).filter(Boolean);
  hidePseudos?.remove();
  return { nodes, unreadable, motion: motion() };
});

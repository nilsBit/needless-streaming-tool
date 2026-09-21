/* Runs inside the overlay page. Turns the rendered DOM into the node tree
   the Figma plugin rebuilds. Only what Figma can hold is read. */
(({ tokens }) => {
  const tokenByHex = {};
  for (const [name, value] of Object.entries(tokens)) {
    if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) tokenByHex[value.toLowerCase()] = name;
  }

  function color(css) {
    const m = css.match(/rgba?\(([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+%?))?\)/);
    if (!m) return null;
    const hex = '#' + [m[1], m[2], m[3]].map((v) => Math.round(Number(v)).toString(16).padStart(2, '0')).join('');
    let alpha = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : Number(m[4]);
    const out = { hex, alpha };
    if (tokenByHex[hex]) out.token = tokenByHex[hex];
    return out;
  }

  function border(style, side) {
    const width = parseFloat(style[`border${side}Width`]) || 0;
    if (width === 0 || style[`border${side}Style`] === 'none') return { width: 0, color: { hex: '#000000', alpha: 0 } };
    return { width, color: color(style[`border${side}Color`]) ?? { hex: '#000000', alpha: 0 } };
  }

  function shadow(css) {
    if (!css || css === 'none') return undefined;
    const c = css.match(/rgba?\([^)]*\)/);
    const nums = css.replace(/rgba?\([^)]*\)/, '').trim().split(/\s+/).map(parseFloat);
    if (!c || nums.length < 2) return undefined;
    return { x: nums[0] || 0, y: nums[1] || 0, blur: nums[2] || 0, spread: nums[3] || 0, color: color(c[0]) };
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
    const fill = color(style.backgroundColor);
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
        children.push({
          kind: 'text', name: '#text',
          x: r.left - rect.left, y: r.top - rect.top, width: r.width, height: r.height, opacity: 1,
          text: {
            content: child.textContent.replace(/\s+/g, ' ').trim(),
            family: style.fontFamily.split(',')[0].replace(/["']/g, '').trim(),
            size: parseFloat(style.fontSize), weight: Number(style.fontWeight) || 400,
            italic: style.fontStyle === 'italic', color: color(style.color),
            lineHeight, letterSpacing: parseFloat(style.letterSpacing) || 0, align: align(style.textAlign),
          },
        });
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const c = read(child, rect);
        if (c) children.push(c);
      }
    }
    if (children.length) node.children = children;
    // A box with nothing to draw and nothing inside is noise in Figma.
    if (!node.fill && !node.borders && !node.shadow && !node.children) return null;
    return node;
  }

  const bodyRect = document.body.getBoundingClientRect();
  const origin = { left: 0, top: 0, width: bodyRect.width, height: bodyRect.height };
  return [...document.body.children].map((el) => read(el, origin)).filter(Boolean);
});

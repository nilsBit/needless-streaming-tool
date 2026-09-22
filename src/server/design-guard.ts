/**
 * What a Claude run of the "Umsetzen" button may change in src/overlays,
 * checked on its copy before anything goes live. The run acts on text from a
 * Figma file and may have been steered by it, so this is an allowlist rather
 * than a hunt for bad patterns:
 *
 * - scripts stay byte for byte as they were — the run changes looks, not code;
 * - markup uses plain layout and SVG tags with plain attributes, and URLs in
 *   it are local;
 * - CSS neither imports nor loads from elsewhere;
 * - showcase/states.json stays as it is: its names become paths on the
 *   server, and its test data reaches the overlays' markup;
 * - no file goes away, and new files are only stylesheets and images.
 *
 * Everything outside that is an "item". An item the old file already had
 * (same text, as often) is fine — the Google Fonts links, the existing
 * scripts. Any other item is a violation.
 */

const TAGS = new Set([
  'html', 'head', 'body', 'meta', 'link', 'title', 'style',
  'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'main', 'section', 'header', 'footer', 'article', 'aside',
  'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'small', 'sup', 'sub', 'br', 'hr', 'figure', 'figcaption', 'img',
  'svg', 'g', 'path', 'polygon', 'polyline', 'circle', 'ellipse', 'rect', 'line', 'defs',
  'lineargradient', 'radialgradient', 'stop', 'text', 'tspan', 'clippath', 'mask',
]);

const ATTRIBUTES = new Set([
  'class', 'id', 'style', 'lang', 'dir', 'title', 'alt', 'width', 'height', 'hidden', 'role',
  'charset', 'name', 'content', 'rel', 'href', 'src', 'media', 'type', 'crossorigin', 'loading', 'decoding',
  'xmlns', 'viewbox', 'preserveaspectratio', 'points', 'd', 'fill', 'fill-opacity', 'fill-rule', 'stroke',
  'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'opacity',
  'transform', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'offset', 'stop-color',
  'stop-opacity', 'gradientunits', 'gradienttransform', 'clip-path', 'text-anchor', 'dominant-baseline',
]);

const URL_ATTRIBUTES = new Set(['href', 'src']);
const LINK_RELS = new Set(['stylesheet', 'preconnect', 'icon']);

/** A path on this server: no scheme, no host, nothing a browser could read as either. */
const LOCAL_URL = /^(?!\/\/)[\w\-./%#]*$/;
const IMAGE_DATA = /^data:image\/(png|webp|gif|jpeg);base64,[a-z0-9+/=]+$/i;

const localUrl = (value: string) => LOCAL_URL.test(value) || IMAGE_DATA.test(value);

/** Numeric references and the few named ones that could build a URL or CSS; any other `&` stays as it is. */
function decode(value: string): string {
  const named: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', colon: ':', sol: '/', bsol: '\\', lpar: '(', rpar: ')', commat: '@', tab: '\t', newline: '\n', period: '.' };
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex) => String.fromCodePoint(Math.min(parseInt(hex, 16), 0x10ffff)))
    .replace(/&#([0-9]+);?/g, (_, dec) => String.fromCodePoint(Math.min(parseInt(dec, 10), 0x10ffff)))
    .replace(/&([a-z]+);?/gi, (whole, name) => named[name.toLowerCase()] ?? whole);
}

/** Items in a stylesheet: anything that loads from elsewhere, and escapes outside strings that could spell it. */
export function cssItems(css: string): string[] {
  const items: string[] = [];
  const text = css;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? text.length : end + 2;
      continue;
    }
    if (c === '"' || c === "'") {
      // A CSS string ends at its quote or, unclosed, at the line's end.
      i++;
      while (i < text.length && text[i] !== c && text[i] !== '\n') i += text[i] === '\\' ? 2 : 1;
      i++;
      continue;
    }
    if (c === '\\') {
      items.push(`CSS-Escape ${text.slice(i, i + 8)}`);
      i += 2;
      continue;
    }
    const rest = text.slice(i, i + 20).toLowerCase();
    if (rest.startsWith('@import') || rest.startsWith('image-set(') || rest.startsWith('-webkit-image-set(') || rest.startsWith('src(')) {
      const end = text.indexOf(';', i);
      items.push(text.slice(i, end === -1 ? text.length : end + 1));
      i = end === -1 ? text.length : end + 1;
      continue;
    }
    if (rest.startsWith('url(')) {
      const end = text.indexOf(')', i);
      const whole = text.slice(i, end === -1 ? text.length : end + 1);
      const value = whole.slice(4, -1).trim().replace(/^(["'])(.*)\1$/s, '$2').trim();
      if (!localUrl(value)) items.push(whole);
      i = end === -1 ? text.length : end + 1;
      continue;
    }
    i++;
  }
  return items;
}

/**
 * Items in an HTML or SVG file. Reads like a browser's tokenizer, but errs
 * towards seeing more: every `<` followed by a letter counts as a tag, even
 * in text and comments, so nothing hides in a spot a browser would read
 * differently.
 */
export function htmlItems(html: string): string[] {
  const items: string[] = [];
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) break;
    if (!/[a-z]/i.test(html[lt + 1] ?? '')) { i = lt + 1; continue; }

    let j = lt + 1;
    while (j < html.length && !/[\s/>]/.test(html[j])) j++;
    const name = html.slice(lt + 1, j).toLowerCase();
    const attrs: [string, string][] = [];
    let closed = false;
    while (j < html.length) {
      while (j < html.length && /[\s/]/.test(html[j])) j++;
      if (html[j] === '>') { closed = true; j++; break; }
      const start = j;
      j++;
      while (j < html.length && !/[\s/>=]/.test(html[j])) j++;
      const attr = html.slice(start, j).toLowerCase();
      let value = '';
      let k = j;
      while (k < html.length && /\s/.test(html[k])) k++;
      if (html[k] === '=') {
        k++;
        while (k < html.length && /\s/.test(html[k])) k++;
        const quote = html[k];
        if (quote === '"' || quote === "'") {
          const end = html.indexOf(quote, k + 1);
          value = html.slice(k + 1, end === -1 ? html.length : end);
          j = end === -1 ? html.length : end + 1;
        } else {
          const startValue = k;
          while (k < html.length && !/[\s>]/.test(html[k])) k++;
          value = html.slice(startValue, k);
          j = k;
        }
      }
      attrs.push([attr, decode(value)]);
    }
    const raw = html.slice(lt, j);
    if (!closed) { items.push(`offenes Tag ${raw.slice(0, 80)}`); break; }

    if (name === 'script' || name === 'style') {
      // Ends where a browser ends it: `</script` followed by space, `/` or `>`.
      const close = new RegExp(`</${name}[\\s/>]`, 'ig');
      close.lastIndex = j;
      const found = close.exec(html);
      const body = html.slice(j, found ? found.index : html.length);
      if (name === 'script') {
        // A script is fine only if the old file had exactly this one, up to
        // its end tag. `<!--` inside it would let a browser run it further.
        items.push(raw + body + (found ? found[0] : ''));
        if (body.includes('<!--')) items.push(`<!-- im Skript ${raw}`);
      } else {
        items.push(...cssItems(body));
        for (const [attr] of attrs) if (!['type', 'media'].includes(attr)) { items.push(raw); break; }
      }
      // Inside SVG a browser reads <style> and <script> as markup, not text —
      // so their inside is read as markup here too.
      i = j;
      continue;
    }

    if (!TAGS.has(name)) { items.push(raw); i = j; continue; }
    for (const [attr, value] of attrs) {
      const plain = ATTRIBUTES.has(attr) || /^(data|aria)-[a-z0-9-]+$/.test(attr);
      if (!plain) { items.push(raw); break; }
      if (URL_ATTRIBUTES.has(attr) && !localUrl(value.trim())) { items.push(raw); break; }
      if (attr === 'rel' && !value.toLowerCase().split(/\s+/).every((r) => LINK_RELS.has(r))) { items.push(raw); break; }
      // style, and SVG attributes like fill or clip-path, take url() too.
      items.push(...cssItems(value));
    }
    i = j;
  }
  return items;
}

/** What `items` found in the new text that the old one did not have as often. */
function added(oldItems: string[], newItems: string[]): string[] {
  const left = new Map<string, number>();
  for (const item of oldItems) left.set(item, (left.get(item) ?? 0) + 1);
  const extra: string[] = [];
  for (const item of newItems) {
    const n = left.get(item) ?? 0;
    if (n > 0) left.set(item, n - 1);
    else extra.push(item);
  }
  return extra;
}

const IMAGE = /\.(png|webp|jpe?g|gif)$/i;
const MAX_IMAGE = 5 * 1024 * 1024;

/** Whether the bytes are the image the name says — nothing else may sit under an image's name. */
function isImage(file: string, bytes: Buffer): boolean {
  const ext = file.slice(file.lastIndexOf('.') + 1).toLowerCase();
  const starts = (...b: number[]) => b.every((v, i) => bytes[i] === v);
  if (ext === 'png') return starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  if (ext === 'jpg' || ext === 'jpeg') return starts(0xff, 0xd8, 0xff);
  if (ext === 'gif') return bytes.subarray(0, 4).toString('latin1') === 'GIF8';
  return bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP';
}

/**
 * Why a change to one file under src/overlays must not go live, or [] if it
 * may. `file` is relative to src/overlays with forward slashes; `before` is
 * undefined for a new file, `after` for a deleted one.
 */
export function violations(file: string, before: Buffer | undefined, after: Buffer | undefined, secrets: string[]): string[] {
  if (after === undefined) return ['gelöscht'];
  if (IMAGE.test(file)) return isImage(file, after) && after.length <= MAX_IMAGE ? [] : ['kein gültiges Bild'];
  const text = after.toString('utf8');
  const old = before?.toString('utf8') ?? '';
  const found: string[] = [];
  if (secrets.some((s) => text.includes(s) && !old.includes(s))) found.push('Token');

  if (file === 'showcase/states.json') {
    found.push('darf sich nicht ändern');
  } else if (/\.css$/i.test(file)) {
    found.push(...added(cssItems(old), cssItems(text)));
  } else if (/\.(html|svg)$/i.test(file) && before !== undefined) {
    found.push(...added(htmlItems(old), htmlItems(text)));
  } else {
    found.push(before === undefined ? 'neue Datei dieser Art' : 'Datei dieser Art darf sich nicht ändern');
  }
  return found.map((f) => (f.length > 120 ? `${f.slice(0, 117)}…` : f));
}

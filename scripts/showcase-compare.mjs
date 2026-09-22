import fs from 'fs';
import path from 'path';
import { launch, openState, readStates, requireRunningTool } from './showcase-browser.mjs';

// Draft left, overlay right, differences below. Usage: npm run showcase:compare -- <overlay>
const overlay = process.argv[2];
if (!overlay) { console.error('Aufruf: npm run showcase:compare -- <overlay>'); process.exit(1); }
await requireRunningTool();
const entry = (await readStates()).overlays[overlay];
if (!entry) { console.error(`Unbekanntes Overlay: ${overlay}`); process.exit(1); }

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// A PNG's width/height live in the IHDR chunk, right after the 8-byte signature.
function pngSize(buffer) {
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('Entwurf ist kein PNG');
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

const browser = await launch();
let failed = 0;
try {
  for (const state of Object.keys(entry.states)) {
    const draftFile = path.join(process.cwd(), 'design', 'drafts', overlay, state, 'image.png');
    if (!fs.existsSync(draftFile)) { console.log(`--   ${overlay} / ${state} — kein Entwurf`); continue; }
    let page;
    let sheet;
    try {
      const opened = await openState(browser, overlay, state, entry.size);
      page = opened.page;
      const rendered = (await page.screenshot({ omitBackground: true })).toString('base64');
      if (opened.errors.length) throw new Error('console errors: ' + opened.errors.join(' | '));
      const draftBuffer = fs.readFileSync(draftFile);
      const draftSize = pngSize(draftBuffer);
      const draft = draftBuffer.toString('base64');

      // The diff is computed in a canvas, so no image library is needed.
      const { width, height } = entry.size;
      sheet = await browser.newPage({ viewport: { width: width * 2 + 24, height: height * 2 + 24 } });
      await sheet.setContent(`<body style="margin:0;background:#888"><canvas id="c" width="${width * 2 + 24}" height="${height * 2 + 24}"></canvas></body>`);
      // Two thresholds: 48 is the summed per-channel delta below which a pixel counts
      // as unchanged (anti-aliasing noise), and 2 % of differing pixels is the cutoff
      // between "ok" and "diff" for the whole state.
      const percent = await sheet.evaluate(async ({ draft, rendered, width, height }) => {
        const load = (b64) => new Promise((ok, reject) => {
          const i = new Image();
          i.onload = () => ok(i);
          i.onerror = () => reject(new Error('Bild ließ sich nicht laden'));
          i.src = 'data:image/png;base64,' + b64;
        });
        const [a, b] = await Promise.all([load(draft), load(rendered)]);
        const ctx = document.getElementById('c').getContext('2d');
        ctx.drawImage(a, 0, 0, width, height);
        ctx.drawImage(b, width + 24, 0, width, height);
        const pa = ctx.getImageData(0, 0, width, height).data;
        const pb = ctx.getImageData(width + 24, 0, width, height).data;
        const diff = ctx.createImageData(width, height);
        let off = 0;
        for (let i = 0; i < pa.length; i += 4) {
          const d = Math.abs(pa[i] - pb[i]) + Math.abs(pa[i + 1] - pb[i + 1]) + Math.abs(pa[i + 2] - pb[i + 2]) + Math.abs(pa[i + 3] - pb[i + 3]);
          const bad = d > 48;
          if (bad) off++;
          diff.data[i] = bad ? 255 : pa[i] * 0.25; diff.data[i + 1] = bad ? 0 : pa[i + 1] * 0.25; diff.data[i + 2] = bad ? 80 : pa[i + 2] * 0.25; diff.data[i + 3] = 255;
        }
        ctx.putImageData(diff, 0, height + 24);
        return (off / (width * height)) * 100;
      }, { draft, rendered, width, height });
      const out = path.join(process.cwd(), 'design', 'compare', overlay, `${state}.png`);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      await sheet.screenshot({ path: out });
      const rel = path.relative(process.cwd(), out);
      if (draftSize.width !== width || draftSize.height !== height) {
        console.log(`diff ${overlay} / ${state} — Entwurf ist ${draftSize.width}x${draftSize.height}, Overlay ist ${width}x${height} (Frame-Größe prüfen) — ${percent.toFixed(1)} % abweichend → ${rel}`);
      } else {
        console.log(`${percent < 2 ? 'ok  ' : 'diff'} ${overlay} / ${state} — ${percent.toFixed(1)} % abweichend → ${rel}`);
      }
      // What the image can't show — motion above all — stands in the note sent along with the frame.
      const note = JSON.parse(fs.readFileSync(path.join(path.dirname(draftFile), 'draft.json'), 'utf8')).note;
      const wishes = typeof note === 'string' ? note.split('Wünsche:')[1]?.trim() : '';
      if (wishes) console.log(`     Wünsche: ${wishes.replace(/\n/g, '\n              ')}`);
    } catch (e) {
      failed++;
      console.log(`FAIL ${overlay} / ${state} — ${e.message}`);
    } finally {
      // Each close is independent — a rejecting one must not skip the other or escape the loop.
      await Promise.allSettled([page?.close(), sheet?.close()]);
    }
  }
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);

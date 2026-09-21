import fs from 'fs';
import path from 'path';
import { BASE, launch, openState, readStates, requireRunningTool } from './showcase-browser.mjs';

// Captures every showcase state into design/captured/<overlay>/<state>.json.
// Usage: npm run showcase:capture [-- <overlay>]
await requireRunningTool();
const only = process.argv[2];
const states = await readStates();
const config = await (await fetch(`${BASE}/public/overlay-config`)).json();
const captureDom = fs.readFileSync(new URL('./capture-dom.js', import.meta.url), 'utf8');
const outDir = path.join(process.cwd(), 'design', 'captured');

const browser = await launch();
let failed = 0;
try {
  for (const [overlay, entry] of Object.entries(states.overlays)) {
    if (only && overlay !== only) continue;
    const tokens = { ...(config.global ?? {}), ...(config.overrides?.[overlay] ?? {}) };
    for (const state of Object.keys(entry.states)) {
      let page;
      try {
        const opened = await openState(browser, overlay, state, entry.size);
        page = opened.page;
        const { nodes, unreadable } = await page.evaluate(`(${captureDom.trim().replace(/;$/, '')})(${JSON.stringify({ tokens })})`);
        const preview = 'data:image/png;base64,' + (await page.screenshot({ omitBackground: true })).toString('base64');
        if (opened.errors.length) throw new Error('console errors: ' + opened.errors.join(' | '));
        const file = path.join(outDir, overlay, `${state}.json`);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const capture = { overlay, state, width: entry.size.width, height: entry.size.height, tokens, preview, nodes };
        fs.writeFileSync(file, JSON.stringify(capture));
        const json = JSON.stringify(nodes);
        const bound = (json.match(/"token":/g) ?? []).length;
        const colors = (json.match(/"hex":/g) ?? []).length;
        console.log(`ok   ${overlay} / ${state} — ${colors} Farben, davon ${bound} an Tokens, ${unreadable} unlesbar`);
      } catch (e) {
        failed++;
        console.log(`FAIL ${overlay} / ${state} — ${e.message}`);
      } finally {
        // openState() itself already closes the page (and never returns one)
        // when it throws before returning, so `page` stays undefined there.
        if (page && !page.isClosed()) await page.close().catch(() => {});
      }
    }
  }
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);

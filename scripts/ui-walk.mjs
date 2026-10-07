import fs from 'fs';
import os from 'os';
import path from 'path';
import { launch } from './showcase-browser.mjs';

// Walks the app in Chrome: opens every area and sub tab, counts the panels,
// takes a screenshot per page at two window sizes, and reports console errors.
// Read-only — it clicks only the navigation, never a button inside a panel.
//
// Needs the server (npm run dev, or npm run server:headless) and the renderer
// (Vite on 5273, started by npm run dev or `npx vite`). The token comes from
// ~/.nst/connection.json, which the server writes on start.
// Usage: npm run ui:walk            → design/ui-walk/<size>-<area>[-<tab>].png

// Same place the server writes it (src/server/connection-file.ts): %APPDATA%\.nst on Windows, ~/.nst elsewhere.
const nstDir = process.platform === 'win32' ? (process.env.APPDATA || os.homedir()) : os.homedir();
const connectionFile = path.join(nstDir, '.nst', 'connection.json');
if (!fs.existsSync(connectionFile)) {
  console.error('Keine Verbindung gefunden (~/.nst/connection.json). Läuft der Server?');
  process.exit(1);
}
const conn = JSON.parse(fs.readFileSync(connectionFile, 'utf8'));
const renderer = process.env.NST_RENDERER ?? 'http://localhost:5273/';
const url = `${renderer}#token=${encodeURIComponent(conn.token)}&port=${conn.port}`;

const outDir = path.join(process.cwd(), 'design', 'ui-walk');
fs.mkdirSync(outDir, { recursive: true });

// Expected: every panel key has exactly one place, so the sum over all pages
// at the wide size equals the number of keys.
const keysSource = fs.readFileSync(path.join(process.cwd(), 'src/renderer/src/panelKeys.ts'), 'utf8');
const expectedPanels = (keysSource.match(/^\s*'[a-z-]+',\s*$/gm) ?? []).length;

const slug = (s) => s.toLowerCase().replace(/ & /g, '-').replace(/[^a-z0-9äöü]+/g, '-').replace(/^-|-$/g, '');
const sizes = [{ w: 1360, h: 900 }, { w: 900, h: 700 }];
const rows = [];
let pageErrors = 0;

const browser = await launch();
try {
  for (const size of sizes) {
    const page = await browser.newPage({ viewport: { width: size.w, height: size.h } });
    const consoleErrors = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', (e) => { pageErrors++; consoleErrors.push('PAGE ERROR ' + String(e)); });
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForSelector('.shell-nav', { timeout: 15_000 });

    const areas = await page.$$eval('.shell-nav-btn', (els) => els.map((e) => e.textContent.trim()));
    for (const area of areas) {
      await page.click(`.shell-nav-btn:text-is("${area}")`);
      await page.waitForTimeout(300);
      const tabs = await page.$$eval('.sub-tab', (els) => els.map((e) => e.textContent.trim()));
      for (const tab of tabs.length ? tabs : [null]) {
        if (tab) { await page.click(`.sub-tab:text-is("${tab}")`); await page.waitForTimeout(300); }
        await page.waitForTimeout(700); // panels fetch their data
        // A panel is wrapped as .page-panel on most pages and sits inside a card on "Im Stream" — both carry data-panel.
        const panels = await page.$$eval('[data-panel]', (els) => els.length);
        const cards = await page.$$eval('.start-card', (els) => els.length);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
        const file = `${size.w}x${size.h}-${slug(area)}${tab ? '-' + slug(tab) : ''}.png`;
        await page.screenshot({ path: path.join(outDir, file) });
        rows.push({ size: `${size.w}×${size.h}`, area, tab: tab ?? '—', panels, cards, overflow, errors: consoleErrors.splice(0) });
      }
    }
    await page.close();
  }
} finally {
  await browser.close();
}

const pad = (s, n) => String(s).padEnd(n);
console.log(pad('Größe', 10) + pad('Bereich', 20) + pad('Unterreiter', 18) + pad('Panels', 8) + pad('Karten', 8) + pad('Überlauf', 10) + 'Konsolenfehler');
for (const r of rows) {
  console.log(pad(r.size, 10) + pad(r.area, 20) + pad(r.tab, 18) + pad(r.panels, 8) + pad(r.cards, 8) + pad(r.overflow ? 'JA' : 'nein', 10) + r.errors.length);
  for (const e of r.errors) console.log('    ' + e.slice(0, 160));
}
const wide = rows.filter((r) => r.size === '1360×900');
const totalPanels = wide.reduce((n, r) => n + r.panels, 0);
const overflowing = rows.filter((r) => r.overflow).length;
console.log(`\nPanels bei 1360 px: ${totalPanels}, erwartet ${expectedPanels}. Seiten mit horizontalem Überlauf: ${overflowing}. Unbehandelte Fehler: ${pageErrors}.`);
console.log(`Bilder: ${outDir}`);
process.exit(totalPanels === expectedPanels && overflowing === 0 && pageErrors === 0 ? 0 : 1);

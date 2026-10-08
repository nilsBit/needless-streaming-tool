import fs from 'fs';
import os from 'os';
import path from 'path';
import { launch } from './showcase-browser.mjs';

// Walks one guided flow (a Quest-Pfad) in Chrome against the running tool and
// takes a screenshot after each click — to look at a flow without clicking
// through it by hand. It clicks what it is told and nothing else; leave the
// final "Anlegen" out, so nothing is created.
//
// Usage: npm run ui:flow -- <Bereich> <Unterreiter> <Knopf> [<Knopf> …]
//   e.g. npm run ui:flow -- "Chat & Bot" Punkte "+ Eigene Belohnung" Weiter Weiter
// → design/ui-flow/<n>.png. Needs server and renderer, like ui:walk.

const [area, tab, ...clicks] = process.argv.slice(2);
if (!area || !clicks.length) {
  console.error('Aufruf: npm run ui:flow -- <Bereich> <Unterreiter|-> <Knopf> [<Knopf> …]');
  process.exit(1);
}
const nstDir = process.platform === 'win32' ? (process.env.APPDATA || os.homedir()) : os.homedir();
const conn = JSON.parse(fs.readFileSync(path.join(nstDir, '.nst', 'connection.json'), 'utf8'));
const renderer = process.env.NST_RENDERER ?? 'http://localhost:5273/';
const url = `${renderer}#token=${encodeURIComponent(conn.token)}&port=${conn.port}`;
const outDir = path.join(process.cwd(), 'design', 'ui-flow');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const browser = await launch();
try {
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('.shell-nav', { timeout: 15_000 });
  await page.click(`.shell-nav-btn:text-is("${area}")`);
  if (tab && tab !== '-') await page.click(`.sub-tab:text-is("${tab}")`);
  await page.waitForTimeout(400);
  let n = 0;
  await page.screenshot({ path: path.join(outDir, `${n}.png`) });
  for (const label of clicks) {
    // A button, or a choice card (role radio, as in ChoiceCards).
    await page.getByRole('button', { name: label, exact: true }).or(page.getByRole('radio', { name: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) })).first().click();
    await page.waitForTimeout(Number(process.env.UI_FLOW_WAIT ?? 500));
    n += 1;
    await page.screenshot({ path: path.join(outDir, `${n}.png`) });
    console.log(`${n}: ${label}`);
  }
  if (errors.length) console.log('Fehler:', errors.join(' | '));
  console.log(`Bilder: ${outDir}`);
} finally {
  await browser.close();
}

import { chromium } from 'playwright-core';

export const BASE = 'http://localhost:4000';
const CHROME_BY_PLATFORM = {
  win32: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
};
const CHROME = process.env.CHROME_PATH ?? CHROME_BY_PLATFORM[process.platform] ?? '/usr/bin/google-chrome';

export async function requireRunningTool() {
  try {
    const res = await fetch(`${BASE}/public/overlay-config`);
    if (!res.ok) throw new Error(String(res.status));
  } catch {
    console.error('Das Stream Tool läuft nicht (Port 4000). Erst `npm run dev` starten.');
    process.exit(1);
  }
}

export async function launch() {
  return chromium.launch({ executablePath: CHROME, headless: true });
}

export async function readStates() {
  return (await fetch(`${BASE}/overlay/showcase/states.json`)).json();
}

/**
 * Opens one state at its OBS size and waits until boot.js has frozen it.
 *
 * boot.js freezes the page by turning `window.setTimeout` / `setInterval` /
 * `requestAnimationFrame` into permanent no-ops once frozen — on purpose, so
 * the capture is deterministic. That also starves any wait that polls from
 * inside the page (e.g. `page.waitForFunction`, which schedules its own
 * re-checks through those same globals). So this polls from Node instead,
 * on Node's own timer, and only reads the page — never asks it to reschedule
 * anything.
 */
export async function openState(browser, overlay, state, size) {
  const page = await browser.newPage({ viewport: { width: size.width, height: size.height } });
  const errors = [];
  // Chrome requests /favicon.ico on its own; the app serves none. Not the overlay's fault.
  page.on('console', (m) => { if (m.type() === 'error' && !m.location().url.endsWith('/favicon.ico')) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/overlay/${overlay}/index.html?state=${encodeURIComponent(state)}`);

  const deadline = Date.now() + 15_000;
  let status;
  for (;;) {
    status = await page.evaluate(() => ({
      ready: document.documentElement.hasAttribute('data-showcase-ready'),
      error: document.documentElement.getAttribute('data-showcase-error'),
    }));
    if (status.ready || status.error !== null) break;
    if (Date.now() >= deadline) {
      await page.close().catch(() => {});
      throw new Error(`${overlay} / ${state}: not ready after 15 s`);
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  if (status.error !== null) {
    await page.close().catch(() => {});
    throw new Error(`${overlay} / ${state}: ${status.error}`);
  }
  return { page, errors };
}

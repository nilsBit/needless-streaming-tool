import { chromium } from 'playwright-core';

export const BASE = 'http://localhost:4000';
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';

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

/** Opens one state at its OBS size and waits until boot.js has frozen it. */
export async function openState(browser, overlay, state, size) {
  const page = await browser.newPage({ viewport: { width: size.width, height: size.height } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/overlay/${overlay}/index.html?state=${encodeURIComponent(state)}`);
  await page.waitForFunction(
    () => document.documentElement.hasAttribute('data-showcase-ready') ||
          document.documentElement.hasAttribute('data-showcase-error'),
    null,
    { timeout: 15_000 },
  );
  const failure = await page.evaluate(() => document.documentElement.getAttribute('data-showcase-error'));
  if (failure !== null) throw new Error(`${overlay} / ${state}: ${failure}`);
  return { page, errors };
}

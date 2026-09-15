# Overlay-Lexikon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put all twelve overlays in the Lexikon style of the Entry Card, on one shared set of variables the settings panel can reach.

**Architecture:** The ten configurable `--color-*` / `--font-*` names stay as the contract; their values become Lexikon. Finer tones are derived with `color-mix()` in a shared `lexikon.css`. The boot script that sits copied in every overlay moves to a shared `boot.js`. A schema migration rewrites the stored `overlay_config`, without which none of the CSS changes are visible.

**Tech Stack:** Plain HTML/CSS/JS overlays served statically by Express from `src/overlays`, SQLite via better-sqlite3, Vitest + supertest against the HTTP seam.

**Spec:** `docs/overlay-lexikon-design.md`

## Global Constraints

- Code, comments, commit messages: **English**. The user communicates in German.
- Tests run at **one seam: the HTTP API**. `initDatabase(':memory:')`, then `createApp()`, then supertest. No mocks, no port bound, never assert by querying the database. Reference: `src/server/__tests__/http-seam.test.ts`.
- Before every commit: `npm run typecheck && npm test && npm run lint` — all three, exit codes not swallowed by a pipe.
- **Never** run `npm run dev`, `npm run build`, `build:mac`, `build:win`, or `electron-builder`. A dev server is already running on ports 4000 and 5173; use it, do not start or kill one.
- Ports 3001 and 3336 are occupied by other projects — never bind them.
- Overlays are served from `src/overlays` at `/overlay` (`src/server/index.ts:196,206`). A new file there is reachable at `/overlay/<name>` with no route change, and `build.files` already ships `src/overlays/**/*`.
- The `/overlay` CSP (`src/server/index.ts:83`) already allows `script-src 'self'` and `style-src 'self' https://fonts.googleapis.com`. No CSP change is needed.
- Only these ten keys survive `POST /api/overlay-config` (`src/server/api/overlay-config.ts:7-11`): `--color-primary`, `--color-secondary`, `--color-accent`, `--color-text`, `--color-bg`, `--color-bg-opacity`, `--color-bg-secondary`, `--font-display`, `--font-body`, `--font-size-base`.

### The Lexikon values (used verbatim in several tasks)

```
--color-bg             #0e0c0a
--color-bg-secondary   #282018
--color-bg-opacity     0.95
--color-text           #e1d6c2
--color-primary        #f4ead7
--color-secondary      #b8a98c
--color-accent         #c9a45c
--font-display         'Cormorant Garamond', Georgia, serif
--font-body            'Source Serif 4', Georgia, serif
--font-size-base       15px
```

---

## File Structure

| File | Responsibility |
|---|---|
| `src/overlays/boot.js` *(create)* | Fetch config, apply to `:root`, derive `-rgb`, load fonts, listen for live updates |
| `src/overlays/lexikon.css` *(create)* | Reset, transparency, derived tones, type scale, the three weights |
| `src/overlays/<name>/index.html` *(modify ×12)* | Drop the copied boot script, include the shared files, restyle |
| `src/overlays/_template/index.html` *(modify)* | Start new overlays on the shared pattern |
| `src/server/db/schema.ts` *(modify)* | `SCHEMA_VERSION` 19 → 20 |
| `src/server/db/index.ts` *(modify)* | The v20 migration |
| `src/server/__tests__/overlay-lexikon.test.ts` *(create)* | Migration result and shared-asset delivery, over HTTP |

**Ordering note — this plan departs from the spec.** The spec lists the migration as step 4. It is Task 1 here: the stored config is applied as an inline style on `:root` and beats the stylesheet, so until it is rewritten every visual check of every other task would still show orange and Inter, and would be worthless.

---

## The conversion

Tasks 2 and 4 through 6 each apply this same procedure to one overlay file. It is written out once here; where a task says "apply the conversion", it means exactly these five edits, with `<name>` standing for that overlay's directory name (`song`, `todos`, …).

1. **Delete the Google Fonts `<link>`** from `<head>`. `boot.js` loads fonts from the configured `--font-display` and `--font-body`.
2. **Add to `<head>`:** `<link rel="stylesheet" href="/overlay/lexikon.css">`
3. **Delete the copied boot block** — the `(function () { ... })();` containing `hexToRgb` and `__applyOverlayConfig` — and put in its place:
   `<script src="/overlay/boot.js" data-overlay="<name>"></script>`
   It must come **before** the overlay's own render script, which reads `window.__overlayOrigin`.
4. **Delete the local `:root { --color-* … }` block** and every `font-family` that names Inter or Rajdhani. The fallbacks now live in `lexikon.css`.
5. **Put the outer container in its weight** — `class="lex lex-voll"`, `class="lex lex-schlank"` or `class="lex lex-fluechtig"` — and delete the local declarations that the weight class now provides (background, border, outline, radius, shadow).

---

### Task 1: The migration that makes the redesign visible

**Files:**
- Modify: `src/server/db/schema.ts:1`
- Modify: `src/server/db/index.ts` (after the `from < 19` block, around line 174)
- Test: `src/server/__tests__/overlay-lexikon.test.ts` (create)

**Interfaces:**
- Consumes: `initDatabase`, `createApp`, `generateApiToken` — as in `http-seam.test.ts`
- Produces: schema version 20; `GET /public/overlay-config` returns the ten Lexikon values in `global`

- [ ] **Step 1: Write the failing test**

Create `src/server/__tests__/overlay-lexikon.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { initDatabase } from '../db/index';
import { generateApiToken } from '../auth-token';
import { createApp } from '../index';

describe('overlay config after the Lexikon migration', () => {
  let app: Express;
  let token: string;

  beforeAll(() => {
    initDatabase(':memory:');
    token = generateApiToken();
    app = createApp();
  });

  it('serves the Lexikon palette to overlays without a token', async () => {
    const res = await request(app).get('/public/overlay-config').expect(200);

    expect(res.body.global['--color-bg']).toBe('#0e0c0a');
    expect(res.body.global['--color-text']).toBe('#e1d6c2');
    expect(res.body.global['--color-accent']).toBe('#c9a45c');
    expect(res.body.global['--font-body']).toBe("'Source Serif 4', Georgia, serif");
  });

  it('keeps per-overlay overrides that were set by hand', async () => {
    await request(app)
      .post('/api/overlay-config')
      .set('Authorization', `Bearer ${token}`)
      .send({ global: { '--color-accent': '#c9a45c' }, overrides: { song: { '--color-accent': '#ff0000' } } })
      .expect(200);

    const res = await request(app).get('/public/overlay-config').expect(200);
    expect(res.body.overrides.song['--color-accent']).toBe('#ff0000');
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run src/server/__tests__/overlay-lexikon.test.ts`
Expected: FAIL — `global` is `{}`, so `res.body.global['--color-bg']` is `undefined`.

- [ ] **Step 3: Raise the schema version**

In `src/server/db/schema.ts` line 1:

```ts
export const SCHEMA_VERSION = 20;
```

- [ ] **Step 4: Write the migration**

In `src/server/db/index.ts`, directly after the `if (from < 19) { ... }` block:

```ts
  if (from < 20) {
    // The Lexikon palette (docs/overlay-lexikon-design.md). This has to touch the
    // stored value, not just the defaults in the overlay files: the config is
    // applied as an inline style on :root, so it beats every stylesheet. Leaving
    // it alone would make the redesign invisible.
    const LEXIKON: Record<string, string> = {
      '--color-bg': '#0e0c0a',
      '--color-bg-secondary': '#282018',
      '--color-bg-opacity': '0.95',
      '--color-text': '#e1d6c2',
      '--color-primary': '#f4ead7',
      '--color-secondary': '#b8a98c',
      '--color-accent': '#c9a45c',
      '--font-display': "'Cormorant Garamond', Georgia, serif",
      '--font-body': "'Source Serif 4', Georgia, serif",
      '--font-size-base': '15px',
    };

    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('overlay_config') as
      | { value: string }
      | undefined;

    // Overrides were set per overlay on purpose. Only the global layer is ours.
    let overrides = {};
    if (row) {
      try {
        overrides = JSON.parse(row.value).overrides ?? {};
      } catch {
        overrides = {};
      }
    }

    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
      'overlay_config',
      JSON.stringify({ global: LEXIKON, overrides }),
    );
    console.log('[DB] Migrated: overlay config set to the Lexikon palette');
  }
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `npx vitest run src/server/__tests__/overlay-lexikon.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 6: Verify the whole suite and commit**

```bash
npm run typecheck && npm test && npm run lint
git add src/server/db/schema.ts src/server/db/index.ts src/server/__tests__/overlay-lexikon.test.ts
git commit -m "feat(overlays): store the Lexikon palette as the overlay config"
```

---

### Task 2: Shared boot script and stylesheet, proven on `song`

**Files:**
- Create: `src/overlays/boot.js`
- Create: `src/overlays/lexikon.css`
- Modify: `src/overlays/song/index.html`
- Test: `src/server/__tests__/overlay-lexikon.test.ts` (extend)

**Interfaces:**
- Consumes: Task 1's stored config via `GET /public/overlay-config`
- Produces: `/overlay/boot.js` and `/overlay/lexikon.css`; the global `window.__overlayOrigin`, `window.__overlayWs`, `window.__applyOverlayConfig(config)`; CSS classes `.lex`, `.lex-voll`, `.lex-schlank`, `.lex-fluechtig`, `.lex-kicker`, `.lex-rule`, `.lex-title`, `.lex-body`, `.lex-seal`

- [ ] **Step 1: Write the failing test**

Append to `src/server/__tests__/overlay-lexikon.test.ts`, inside the same `describe`:

```ts
  it('serves the shared overlay assets without a token', async () => {
    const js = await request(app).get('/overlay/boot.js').expect(200);
    expect(js.text).toContain('__applyOverlayConfig');

    const css = await request(app).get('/overlay/lexikon.css').expect(200);
    expect(css.text).toContain('--lex-rule');
  });
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run src/server/__tests__/overlay-lexikon.test.ts`
Expected: FAIL — 404 on `/overlay/boot.js`.

- [ ] **Step 3: Create `src/overlays/boot.js`**

```js
/*
 * The one copy of what used to sit in every overlay.
 *
 * Include as:  <script src="/overlay/boot.js" data-overlay="song"></script>
 *
 * The name decides which entry of `overrides` applies on top of `global`.
 */
(function () {
  var script = document.currentScript;
  var name = (script && script.getAttribute('data-overlay')) || '';
  var origin = window.location.origin || 'http://localhost:4000';

  window.__overlayOrigin = origin;
  window.__overlayWs = origin.replace(/^http/, 'ws');

  // Hidden until the config is on, so no overlay flashes its fallback colours
  // into a live stream.
  document.documentElement.style.visibility = 'hidden';

  var RGB_KEYS = ['--color-primary', '--color-secondary', '--color-accent', '--color-bg'];

  function hexToRgb(hex) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return r + ' ' + g + ' ' + b;
  }

  function apply(config) {
    var vars = Object.assign({}, config.global || {}, (config.overrides || {})[name] || {});
    var root = document.documentElement;
    Object.keys(vars).forEach(function (k) {
      root.style.setProperty(k, vars[k]);
    });
    RGB_KEYS.forEach(function (k) {
      if (vars[k]) root.style.setProperty(k + '-rgb', hexToRgb(vars[k]));
    });
    return vars;
  }

  function loadFonts(vars) {
    var fonts = [vars['--font-display'], vars['--font-body']].filter(Boolean);
    if (fonts.length === 0) return;
    var families = fonts.map(function (f) {
      return f.split(',')[0].replace(/'/g, '').trim();
    });
    // Italics are requested explicitly. The Entry Card sets secondary names and
    // empty-page notes in italic, and a browser-faked oblique on a serif face
    // is plainly visible.
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?' +
      families
        .map(function (f) {
          return 'family=' + encodeURIComponent(f) + ':ital,wght@0,400;0,600;0,700;1,400;1,600';
        })
        .join('&') +
      '&display=swap';
    document.head.appendChild(link);
  }

  fetch(origin + '/public/overlay-config')
    .then(function (r) {
      return r.json();
    })
    .then(function (config) {
      loadFonts(apply(config));
    })
    .catch(function () {})
    .finally(function () {
      document.documentElement.style.visibility = 'visible';
    });

  // The settings panel broadcasts `overlay-config`; each overlay re-applies
  // without a reload.
  window.__applyOverlayConfig = function (config) {
    apply(config);
  };
})();
```

- [ ] **Step 4: Create `src/overlays/lexikon.css`**

```css
/*
 * The Lexikon look, shared by every overlay.
 *
 * The ten --color-* / --font-* names come from the settings panel. Everything
 * named --lex- below is derived from them and deliberately NOT configurable:
 * twenty knobs of which eighteen never agree are worse than ten that always do.
 */
:root {
  /* Fallbacks only — boot.js overwrites these from the stored config. */
  --color-bg: #0e0c0a;
  --color-bg-secondary: #282018;
  --color-bg-opacity: 0.95;
  --color-text: #e1d6c2;
  --color-primary: #f4ead7;
  --color-secondary: #b8a98c;
  --color-accent: #c9a45c;
  --font-display: 'Cormorant Garamond', Georgia, serif;
  --font-body: 'Source Serif 4', Georgia, serif;
  --font-size-base: 15px;

  --lex-frame: color-mix(in srgb, var(--color-primary) 20%, transparent);
  --lex-frame-inner: color-mix(in srgb, var(--color-primary) 8%, transparent);
  --lex-rule: color-mix(in srgb, var(--color-primary) 15%, transparent);
  --lex-soft: color-mix(in srgb, var(--color-text) 82%, var(--color-bg));
  --lex-faint: color-mix(in srgb, var(--color-text) 60%, var(--color-bg));

  --lex-margin: 24px;
  --art: var(--color-accent);
}

* { margin: 0; padding: 0; box-sizing: border-box; }

html, body {
  background: transparent !important;
  background-color: rgba(0, 0, 0, 0) !important;
  overflow: hidden;
  width: 100%;
  height: 100%;
}

.lex {
  color: var(--color-text);
  font-family: var(--font-body);
  font-size: var(--font-size-base);
  line-height: 1.55;
}

.lex-title {
  font-family: var(--font-display);
  font-weight: 600;
  color: var(--color-primary);
  line-height: 1.1;
}

/* The spaced small-caps line above a title. */
.lex-kicker {
  display: flex;
  align-items: center;
  gap: 14px;
  font: 600 15px var(--font-display);
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: var(--color-secondary);
}
.lex-kicker::after {
  content: '';
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, var(--lex-rule), transparent);
}

.lex-rule { height: 1px; background: var(--lex-rule); border: 0; }

/* ---- Weight: full. Frame, seal, small caps. Entry Card, leaderboard. ---- */
.lex-voll {
  position: relative;
  padding: 34px 44px 28px;
  background: radial-gradient(
    120% 120% at 0% 0%,
    color-mix(in srgb, var(--color-bg-secondary) calc(var(--color-bg-opacity) * 100%), transparent),
    color-mix(in srgb, var(--color-bg) calc(var(--color-bg-opacity) * 100%), transparent)
  );
  border: 1px solid var(--lex-frame);
  outline: 1px solid var(--lex-frame-inner);
  outline-offset: -10px;
  border-radius: 4px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.45);
}

.lex-seal {
  position: absolute;
  top: 28px;
  right: 32px;
  width: 66px;
  height: 66px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border: 1px solid var(--lex-frame);
  border-radius: 50%;
  color: var(--art);
  font: 600 26px var(--font-display);
}

/* ---- Weight: slim. One rule, serif, no frame. Song, todos, progress. ---- */
.lex-schlank {
  padding: 12px 16px;
  background: color-mix(in srgb, var(--color-bg) calc(var(--color-bg-opacity) * 100%), transparent);
  border-left: 2px solid var(--art);
  border-radius: 2px;
}

/* ---- Weight: fleeting. Type and accent only. Alerts, rank change, wheel. ----
   No frame on purpose: two seconds on screen has to read at a glance, and a
   border that fades in with it pulls the eye off the words. */
.lex-fluechtig {
  color: var(--color-primary);
  font-family: var(--font-display);
  text-shadow: 0 2px 18px rgba(0, 0, 0, 0.75);
}
.lex-fluechtig .accent { color: var(--art); }
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `npx vitest run src/server/__tests__/overlay-lexikon.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Put `song` on the shared files**

Apply **the conversion** (see the section above) to `src/overlays/song/index.html` with `data-overlay="song"` and the weight `lex lex-schlank`. The boot block to delete in this file is `src/overlays/song/index.html:134-173`.

Then: the song title becomes `.lex-title`, the requester line gets `color: var(--lex-faint)`.

- [ ] **Step 7: Look at it**

Open `http://localhost:4000/overlay/song/index.html` in a browser against the running dev server. Expect parchment text on a near-black bar with a gold left edge, serif throughout, no orange and no Inter anywhere.

- [ ] **Step 8: Verify and commit**

```bash
npm run typecheck && npm test && npm run lint
git add src/overlays/boot.js src/overlays/lexikon.css src/overlays/song/index.html src/server/__tests__/overlay-lexikon.test.ts
git commit -m "feat(overlays): share the boot script and the Lexikon stylesheet"
```

---

### Task 3: The Entry Card joins the system

**Files:**
- Modify: `src/overlays/character/index.html`

**Interfaces:**
- Consumes: `/overlay/lexikon.css`, `/overlay/boot.js` from Task 2
- Produces: nothing new — this removes the last overlay that stood outside the config system

- [ ] **Step 1: Replace the private variables with the shared names**

In the `:root` block at `src/overlays/character/index.html:14-31`, delete these and use the shared names at every use site:

| delete | use instead |
|---|---|
| `--lex-bg-from` | handled by `.lex-voll`'s gradient |
| `--lex-bg-to` | handled by `.lex-voll`'s gradient |
| `--lex-title` | `var(--color-primary)` |
| `--lex-text` | `var(--color-text)` |
| `--lex-muted` | `var(--color-secondary)` |
| `--lex-font-title` | `var(--font-display)` |
| `--lex-font-text` | `var(--font-body)` |
| `--lex-art-fallback` | `var(--color-accent)` |
| `--lex-frame`, `--lex-frame-inner`, `--lex-rule`, `--lex-soft`, `--lex-faint` | same names, now from `lexikon.css` |

Keep `--lex-width: 720px` and `--lex-kicker: 'Lexikon'` locally — they are this overlay's own, not palette.

- [ ] **Step 2: Include the shared files**

In `<head>`, replace the Google Fonts `<link>` (line 5) with `<link rel="stylesheet" href="/overlay/lexikon.css">`, and add before the card script:
`<script src="/overlay/boot.js" data-overlay="character"></script>`

- [ ] **Step 3: Reuse the shared classes**

Give `.card` the classes `lex lex-voll` and delete the now-duplicated `background`, `border`, `outline`, `border-radius` and `box-shadow` declarations from the local `.card` rule. Keep `width: var(--lex-width)`. Do the same for `.seal` → `lex-seal`, `.kicker` → `lex-kicker`.

At `src/overlays/character/index.html:182`, change the fallback:
`current.style.setProperty('--art', card.artColor || 'var(--color-accent)');`

- [ ] **Step 4: Compare it side by side**

Open `http://localhost:4000/overlay/character/index.html` next to a screenshot of the card before the change.

**This is the check the spec calls out.** The old frame tones came from `#e9d6b2`; the derivation uses `--color-primary` (`#f4ead7`). If the frame or the rules read visibly cooler or brighter than before, stop and add a dedicated `--lex-parchment: #e9d6b2` to `lexikon.css`, derive `--lex-frame`, `--lex-frame-inner` and `--lex-rule` from that instead, and re-check. Do not wave this through.

- [ ] **Step 5: Verify and commit**

```bash
npm run typecheck && npm test && npm run lint
git add src/overlays/character/index.html
git commit -m "refactor(overlays): let the Entry Card use the shared Lexikon tokens"
```

---

### Task 4: The slim weight

**Files:**
- Modify: `src/overlays/song-queue/index.html`, `todos/index.html`, `progress/index.html`, `milestone/index.html`, `challenge/index.html`, `poll/index.html`

For **each** of the six, in this order, one commit per file:

- [ ] **Step 1: Convert the file**

Apply **the conversion** (see the section above the tasks) with `data-overlay="<name>"` and the weight `lex lex-schlank`. Per-overlay specifics:

- **`song-queue`** — the queue rows get `border-bottom: 1px solid var(--lex-rule)`; the album artwork keeps its size, drop any coloured glow. The current title is `.lex-title` at `1.2rem`.
- **`todos`** — done items get `color: var(--lex-faint)` with `text-decoration: line-through`; open items stay `var(--color-text)`. The list heading becomes `.lex-kicker`.
- **`progress`** — the bar track is `var(--lex-rule)`, the fill `var(--art)`. Percentage text in `var(--font-display)`.
- **`milestone`** — the title is `.lex-title`, the sub-line `var(--color-secondary)`.
- **`challenge`** — keep the timer in a monospace stack (`ui-monospace, monospace`); a proportional serif makes digits jump as they tick. Title `.lex-title`, status word in `var(--art)`.
- **`poll`** — option rows get `border-bottom: 1px solid var(--lex-rule)`, the vote bars `var(--art)` at 25 % opacity behind the label.

- [ ] **Step 2: Look at it**

Open `http://localhost:4000/overlay/<name>/index.html`. Expect serif type, parchment on near-black, a gold left edge, no frame.

- [ ] **Step 3: Verify and commit**

```bash
npm run typecheck && npm test && npm run lint
git add src/overlays/<name>/index.html
git commit -m "style(overlays): put <name> in the slim Lexikon weight"
```

---

### Task 5: The fleeting weight

**Files:**
- Modify: `src/overlays/alerts/index.html`, `reward-rankchange/index.html`, `roulette/index.html`

One commit per file.

- [ ] **Step 1: Convert the file**

Apply **the conversion** (see the section above the tasks) with `data-overlay="<name>"` and the weight `lex lex-fluechtig` — no frame and no background panel. Per-overlay specifics:

- **`alerts`** — title in `var(--font-display)` at `2.4rem`, spaced `0.06em`; subtitle in `var(--font-body)` at `1.1rem`, `var(--color-secondary)`. The three alert types (`raid`, `reward`, `compile`) set `--art` rather than swapping colour rules: raid `#c9a45c`, reward `#b8a98c`, compile `#f4ead7`. Keep the existing entry animation untouched.
- **`reward-rankchange`** — rank number in `var(--font-display)`, the direction arrow in `var(--art)`.
- **`roulette`** — entries in `var(--font-body)`, `var(--lex-faint)` while spinning; the winner in `var(--color-primary)` with `.accent` on the surrounding marks. Do not add a frame — it spins, and a border would smear.

- [ ] **Step 2: Look at it**

These only appear on an event. Trigger each from the app (Alerts test button, reward simulation, wheel spin) and watch it against the running dev server.

- [ ] **Step 3: Verify and commit**

```bash
npm run typecheck && npm test && npm run lint
git add src/overlays/<name>/index.html
git commit -m "style(overlays): put <name> in the fleeting Lexikon weight"
```

---

### Task 6: The second full-weight overlay

**Files:**
- Modify: `src/overlays/reward-leaderboard/index.html`

- [ ] **Step 1: Convert the file**

Apply **the conversion** (see the section above the tasks) with `data-overlay="reward-leaderboard"` and the weight `lex lex-voll`. The heading becomes `.lex-kicker`; each rank row is separated by `1px solid var(--lex-rule)`; the top rank's name uses `var(--color-primary)`, the rest `var(--color-text)`; scores in `var(--font-display)`.

- [ ] **Step 2: Look at it**

Open `http://localhost:4000/overlay/reward-leaderboard/index.html`. It should read as a sibling of the Entry Card — same frame, same small caps, same parchment.

- [ ] **Step 3: Verify and commit**

```bash
npm run typecheck && npm test && npm run lint
git add src/overlays/reward-leaderboard/index.html
git commit -m "style(overlays): put the reward leaderboard in the full Lexikon weight"
```

---

### Task 7: The template starts new overlays right

**Files:**
- Modify: `src/overlays/_template/index.html`

- [ ] **Step 1: Rewrite the template**

Replace the copied boot block with `<script src="/overlay/boot.js" data-overlay="CHANGEME"></script>`, add `<link rel="stylesheet" href="/overlay/lexikon.css">`, and delete the local `:root` block.

Replace the `DESIGN-STYLES` comment (`src/overlays/_template/index.html:55-59`), which still offers "Pixel Art" and "Modern", with:

```
    DESIGN:
    Use the Lexikon style — see docs/overlay-lexikon-design.md.
    Put the outer container in one of the three weights:
      .lex .lex-voll       frame, seal, small caps  (long-lived, large)
      .lex .lex-schlank    one rule, no frame       (small, persistent)
      .lex .lex-fluechtig  type and accent only     (on-screen for seconds)
    Colours and fonts come from the settings panel. Do not hardcode either.
```

- [ ] **Step 2: Write the test that nothing was forgotten**

This one goes last on purpose: it only passes once every overlay is converted, so writing it earlier would block the commits of Tasks 2 through 6.

Append to `src/server/__tests__/overlay-lexikon.test.ts`, inside the same `describe`:

```ts
  it('has every overlay on the shared boot script and stylesheet', async () => {
    const names = [
      'alerts', 'challenge', 'character', 'milestone', 'poll', 'progress',
      'reward-leaderboard', 'reward-rankchange', 'roulette', 'song',
      'song-queue', 'todos', '_template',
    ];

    for (const name of names) {
      const res = await request(app).get(`/overlay/${name}/index.html`).expect(200);

      // Both shared files, and no leftover copy of the boot block.
      expect(res.text, `${name} misses boot.js`).toContain('/overlay/boot.js');
      expect(res.text, `${name} misses lexikon.css`).toContain('/overlay/lexikon.css');
      expect(res.text, `${name} still carries its own boot block`).not.toContain('function hexToRgb');
    }
  });
```

- [ ] **Step 3: Run the test and watch it pass**

Run: `npx vitest run src/server/__tests__/overlay-lexikon.test.ts`
Expected: PASS, 4 tests. A failure names the overlay that was missed.

- [ ] **Step 4: Verify and commit**

```bash
npm run typecheck && npm test && npm run lint
git add src/overlays/_template/index.html src/server/__tests__/overlay-lexikon.test.ts
git commit -m "docs(overlays): start the template on the Lexikon style"
```

---

## Out of scope

Named so nobody folds them in: self-hosting the fonts, rebuilding the settings panel, and rewriting `docs/overlay-variablen.md` (which still describes bugs, a wheel and "colours from the game"). Each is its own slice.

# Stream Deck Plugin Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconstruct the Stream Deck plugin source in this repo to exact functional parity with the shipped `assets/com.thelab.toolkit.streamDeckPlugin` ZIP, so future plugin changes are no longer blocked by missing source.

**Architecture:** New `streamdeck-plugin/` subproject with its own `package.json`, using the `@elgato/streamdeck` Node.js SDK. Source bundled via `esbuild` → `plugin.js`, packaged via `archiver` into the `.streamDeckPlugin` ZIP emitted to `assets/`. Behavior per-action is reverse-engineered from the shipped `bin/plugin.js` (source-of-truth) and re-encoded in individual TS action classes.

**Tech Stack:** `@elgato/streamdeck` (Node.js 20), `esbuild`, `archiver`, TypeScript. No automated tests — per repo convention, verification is typecheck + lint + manual parity QA.

**Baseline SHA:** `0eeb84f` (main). Every commit below is pushed directly to `main` (direct commits to main are approved for this repo).

**Source-of-truth:** The shipped ZIP at `assets/com.thelab.toolkit.streamDeckPlugin` and its bundled `bin/plugin.js`. Do not guess action behavior — extract and decode.

---

## File Structure

**Created by this plan:**

```
streamdeck-plugin/
  package.json                                             — subproject deps & scripts
  tsconfig.json                                            — TS config for plugin
  build.mjs                                                — esbuild bundle + archiver ZIP step
  README.md                                                — build/test instructions
  .gitignore                                               — ignore node_modules, bin output
  REBUILD-REFERENCE.md                                     — decoded behavior notes (Task 3 output)
  src/
    plugin.ts                                              — entry: registers all 8 actions
    api.ts                                                 — HTTP client (Authorization header, host/port)
    websocket.ts                                           — WS subscriber (bug counter updates)
    actions/
      scene.ts
      clip.ts
      bug.ts
      experiment.ts
      todo.ts
      milestone.ts
      compile-pray.ts
      roulette.ts
  com.thelab.toolkit.sdPlugin/                             — static bundle the ZIP is built from
    manifest.json                                          — copied from shipped ZIP, Version → 1.0.1.0
    package.json                                           — copied from shipped ZIP
    ui/
      pi.html, scene.html, clip.html, bug.html,
      experiment.html, todo.html, milestone.html,
      global-settings.html                                 — all copied verbatim from shipped ZIP
    imgs/                                                  — all images copied verbatim from shipped ZIP
    bin/                                                   — build output target (gitignored)
```

**Modified:**

- `package.json` (root) — add `build:plugin` script; make `build` depend on it
- `.gitignore` (root) — add `assets/com.thelab.toolkit.streamDeckPlugin` (after parity verification only)

**Deleted (after parity verification):**

- `assets/com.thelab.toolkit.streamDeckPlugin` (the committed binary)

---

### Task 1: Scaffold `streamdeck-plugin/` subproject

**Files:**
- Create: `streamdeck-plugin/package.json`
- Create: `streamdeck-plugin/tsconfig.json`
- Create: `streamdeck-plugin/.gitignore`
- Create: `streamdeck-plugin/README.md`

- [ ] **Step 1: Create `streamdeck-plugin/package.json`**

```json
{
  "name": "stream-toolkit-streamdeck-plugin",
  "version": "1.0.1",
  "private": true,
  "description": "Elgato Stream Deck plugin for Stream Toolkit (The Lab)",
  "scripts": {
    "build": "node build.mjs bundle",
    "package": "node build.mjs package",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@elgato/streamdeck": "^1.0.0",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@types/node": "^20.12.0",
    "@types/ws": "^8.5.10",
    "archiver": "^7.0.1",
    "esbuild": "^0.20.0",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create `streamdeck-plugin/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "build.mjs"]
}
```

- [ ] **Step 3: Create `streamdeck-plugin/.gitignore`**

```
node_modules/
com.thelab.toolkit.sdPlugin/bin/
```

- [ ] **Step 4: Create `streamdeck-plugin/README.md`**

```markdown
# Stream Toolkit — Stream Deck Plugin

Source for the `.streamDeckPlugin` ZIP that gets installed on user machines via the Toolkit onboarding flow.

## Build

From this directory:

- `npm install` — once, to pull deps
- `npm run build` — bundle TS → `com.thelab.toolkit.sdPlugin/bin/plugin.js`
- `npm run package` — build + ZIP into `../assets/com.thelab.toolkit.streamDeckPlugin`

From the repo root, `npm run build:plugin` runs `package` here.

## Action UUIDs

See `com.thelab.toolkit.sdPlugin/manifest.json`. UUIDs use the `com.thelab.toolkit.*` namespace — **do not rename**; existing user setups depend on them.

## Parity reference

`REBUILD-REFERENCE.md` documents each action's exact behavior decoded from the pre-rebuild shipped ZIP. Use it as source-of-truth when touching action code.
```

- [ ] **Step 5: Install subproject deps**

Run: `cd streamdeck-plugin && npm install`
Expected: `node_modules/` populated, `package-lock.json` created.

- [ ] **Step 6: Commit**

```bash
git add streamdeck-plugin/package.json streamdeck-plugin/tsconfig.json streamdeck-plugin/.gitignore streamdeck-plugin/README.md streamdeck-plugin/package-lock.json
git commit -m "feat(streamdeck): scaffold plugin subproject

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Extract shipped ZIP into static bundle

Copy the manifest, images, and UI HTML files verbatim from the shipped ZIP into `streamdeck-plugin/com.thelab.toolkit.sdPlugin/`. Bump `manifest.json` Version to `1.0.1.0`.

**Files:**
- Create: `streamdeck-plugin/com.thelab.toolkit.sdPlugin/manifest.json`
- Create: `streamdeck-plugin/com.thelab.toolkit.sdPlugin/package.json`
- Create: `streamdeck-plugin/com.thelab.toolkit.sdPlugin/ui/*.html` (8 files: `pi.html`, `global-settings.html`, `scene.html`, `clip.html`, `bug.html`, `experiment.html`, `todo.html`, `milestone.html`)
- Create: `streamdeck-plugin/com.thelab.toolkit.sdPlugin/imgs/plugin-icon.png` and `@2x.png`
- Create: `streamdeck-plugin/com.thelab.toolkit.sdPlugin/imgs/actions/<action>.png` and `@2x.png` for each of: `scene`, `clip`, `bug`, `experiment`, `todo`, `milestone`, `compile-pray`, `roulette`

- [ ] **Step 1: Extract ZIP to a temp dir**

Run from repo root:
```bash
mkdir -p /tmp/sdplugin-extract
unzip -o assets/com.thelab.toolkit.streamDeckPlugin -d /tmp/sdplugin-extract
```
Expected: 29 files under `/tmp/sdplugin-extract/com.thelab.toolkit.sdPlugin/`.

- [ ] **Step 2: Copy all static files (excluding `bin/plugin.js`) into subproject**

```bash
mkdir -p streamdeck-plugin/com.thelab.toolkit.sdPlugin
cp /tmp/sdplugin-extract/com.thelab.toolkit.sdPlugin/manifest.json streamdeck-plugin/com.thelab.toolkit.sdPlugin/
cp /tmp/sdplugin-extract/com.thelab.toolkit.sdPlugin/package.json streamdeck-plugin/com.thelab.toolkit.sdPlugin/
cp -r /tmp/sdplugin-extract/com.thelab.toolkit.sdPlugin/ui streamdeck-plugin/com.thelab.toolkit.sdPlugin/
cp -r /tmp/sdplugin-extract/com.thelab.toolkit.sdPlugin/imgs streamdeck-plugin/com.thelab.toolkit.sdPlugin/
```

- [ ] **Step 3: Bump manifest Version**

Edit `streamdeck-plugin/com.thelab.toolkit.sdPlugin/manifest.json`:

Find `"Version": "1.0.0.0"` → replace with `"Version": "1.0.1.0"`.

- [ ] **Step 4: Verify file list**

Run: `find streamdeck-plugin/com.thelab.toolkit.sdPlugin -type f | wc -l`
Expected: `28` (29 ZIP files minus the `bin/plugin.js` we deliberately didn't copy).

- [ ] **Step 5: Commit**

```bash
git add streamdeck-plugin/com.thelab.toolkit.sdPlugin/
git commit -m "feat(streamdeck): import static plugin bundle from shipped ZIP

Manifest, images, and UI HTML copied verbatim; version bumped to 1.0.1.0.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Decode shipped `bin/plugin.js` into reference doc

Reverse-engineer each action's exact HTTP call + visual feedback from the shipped `bin/plugin.js` and write it down so the TS implementation can match 1:1.

**Files:**
- Create: `streamdeck-plugin/REBUILD-REFERENCE.md`

- [ ] **Step 1: Extract `bin/plugin.js` into readable form**

```bash
cp /tmp/sdplugin-extract/com.thelab.toolkit.sdPlugin/bin/plugin.js /tmp/sdplugin-extract/plugin.js
# Pretty-print for easier reading:
npx prettier --write /tmp/sdplugin-extract/plugin.js
```

- [ ] **Step 2: Read the bundled `plugin.js` and for each of the 8 actions, record**

For each UUID in `streamdeck-plugin/com.thelab.toolkit.sdPlugin/manifest.json`, search the bundled JS for the action class and document:

- HTTP method + path (e.g. `POST /api/obs/scene`)
- Request body shape (e.g. `{ scene: settings.sceneName }`)
- How the Bearer token is attached
- How success/failure is surfaced to the button (title flash, state change, nothing?)
- Any WS subscription (only bug action should have one — confirm)
- Any cooldown logic (only roulette — confirm duration)

Write findings into `streamdeck-plugin/REBUILD-REFERENCE.md` as a table plus per-action code snippets showing the original logic (verbatim from the bundled JS if compact, or a faithful paraphrase).

Reference doc template:

```markdown
# Plugin behavior reference (decoded from pre-rebuild ZIP)

Source: `bin/plugin.js` from `assets/com.thelab.toolkit.streamDeckPlugin` at commit 68edcdd.

## Actions

### `com.thelab.toolkit.scene`
- **HTTP:** `POST http://{host}:{port}/api/obs/scene`
- **Body:** `{ "scene": settings.sceneName }`
- **Auth:** `Authorization: Bearer {globalSettings.apiToken}`
- **On success:** (fill from decoded JS)
- **On failure:** (fill from decoded JS)

### `com.thelab.toolkit.clip`
...

[All 8 actions follow this structure.]

## Globals
- `host`, `port`, `apiToken` — sourced from Elgato `getGlobalSettings`.
- Defaults (when unset): `host=localhost`, `port=4000`, `apiToken=""` → calls go out unauthenticated and backend rejects with 401.

## WS
- Only `bug` subscribes. URL: `ws://{host}:{port}/ws`, auth mechanism: (fill from decoded JS).
- Events consumed: `bug-created`, `bug-updated`, `bug-deleted` → recompute count.

## Cooldown
- Only `roulette`. Duration: (fill from decoded JS). Persisted or in-memory: (fill from decoded JS).
```

- [ ] **Step 3: Cross-check findings against the server API**

For each HTTP path found in step 2, confirm it exists in `src/server/api/*.ts` and accepts the documented body. If a path has moved/renamed, annotate the reference doc with the current path — source-of-truth for the rebuild is the current backend, not a stale URL. (The shipped plugin may have been ahead of or behind the current server; parity must work against the current server.)

- [ ] **Step 4: Commit**

```bash
git add streamdeck-plugin/REBUILD-REFERENCE.md
git commit -m "docs(streamdeck): decode shipped plugin behavior into reference

Source-of-truth for 1:1 rebuild of all 8 actions.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Implement HTTP client `src/api.ts`

**Files:**
- Create: `streamdeck-plugin/src/api.ts`

- [ ] **Step 1: Write the module**

```typescript
export interface ConnectionSettings {
  host: string;
  port: number;
  apiToken: string;
}

export function resolveBaseUrl(s: ConnectionSettings): string {
  const host = s.host || 'localhost';
  const port = s.port || 4000;
  return `http://${host}:${port}`;
}

export interface ApiCallOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
  settings: ConnectionSettings;
}

export interface ApiResult<T = unknown> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
}

export async function apiCall<T = unknown>(opts: ApiCallOptions): Promise<ApiResult<T>> {
  const { method = 'POST', path, body, settings } = opts;
  const url = `${resolveBaseUrl(settings)}${path}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (settings.apiToken) headers['Authorization'] = `Bearer ${settings.apiToken}`;

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data: T | null = null;
    try { data = (await res.json()) as T; } catch { /* empty response is fine */ }
    return {
      ok: res.ok,
      status: res.status,
      data,
      error: res.ok ? null : (data as { error?: string } | null)?.error ?? `HTTP ${res.status}`,
    };
  } catch (err) {
    return { ok: false, status: 0, data: null, error: err instanceof Error ? err.message : String(err) };
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `cd streamdeck-plugin && npm run typecheck`
Expected: exit 0, no errors.

- [ ] **Step 3: Commit**

```bash
git add streamdeck-plugin/src/api.ts
git commit -m "feat(streamdeck): add HTTP api client

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Implement WS subscriber `src/websocket.ts`

**Files:**
- Create: `streamdeck-plugin/src/websocket.ts`

- [ ] **Step 1: Write the module**

```typescript
import WebSocket from 'ws';
import type { ConnectionSettings } from './api.js';

export type WsEventHandler = (event: string, payload: unknown) => void;

export interface WsSubscription {
  close: () => void;
}

export function subscribe(settings: ConnectionSettings, handler: WsEventHandler): WsSubscription {
  const host = settings.host || 'localhost';
  const port = settings.port || 4000;
  const url = `ws://${host}:${port}/ws`;
  let ws: WebSocket | null = null;
  let closed = false;
  let reconnectTimer: NodeJS.Timeout | null = null;

  const connect = () => {
    if (closed) return;
    ws = new WebSocket(url);

    ws.on('open', () => {
      if (settings.apiToken) {
        ws?.send(JSON.stringify({ type: 'auth', token: settings.apiToken }));
      }
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as { event?: string; payload?: unknown };
        if (msg.event) handler(msg.event, msg.payload);
      } catch { /* ignore non-JSON */ }
    });

    ws.on('close', () => {
      if (closed) return;
      reconnectTimer = setTimeout(connect, 3000);
    });

    ws.on('error', () => {
      try { ws?.close(); } catch { /* ignore */ }
    });
  };

  connect();

  return {
    close: () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try { ws?.close(); } catch { /* ignore */ }
    },
  };
}
```

- [ ] **Step 2: Cross-check WS auth protocol**

Read `src/server/websocket/index.ts` in the repo to confirm how the backend expects auth (message shape, token location, whether auth is required for subscribing). If it differs from the `{ type: 'auth', token }` assumption above, adjust `subscribe` to match the actual protocol. Document the real protocol in `REBUILD-REFERENCE.md` under the "WS" section.

- [ ] **Step 3: Typecheck**

Run: `cd streamdeck-plugin && npm run typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add streamdeck-plugin/src/websocket.ts streamdeck-plugin/REBUILD-REFERENCE.md
git commit -m "feat(streamdeck): add WebSocket subscriber for live events

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Implement plugin entry `src/plugin.ts`

**Files:**
- Create: `streamdeck-plugin/src/plugin.ts`

- [ ] **Step 1: Write the entry module**

```typescript
import streamDeck, { LogLevel } from '@elgato/streamdeck';
import { SceneAction } from './actions/scene.js';
import { ClipAction } from './actions/clip.js';
import { BugAction } from './actions/bug.js';
import { ExperimentAction } from './actions/experiment.js';
import { TodoAction } from './actions/todo.js';
import { MilestoneAction } from './actions/milestone.js';
import { CompilePrayAction } from './actions/compile-pray.js';
import { RouletteAction } from './actions/roulette.js';

streamDeck.logger.setLevel(LogLevel.INFO);

streamDeck.actions.registerAction(new SceneAction());
streamDeck.actions.registerAction(new ClipAction());
streamDeck.actions.registerAction(new BugAction());
streamDeck.actions.registerAction(new ExperimentAction());
streamDeck.actions.registerAction(new TodoAction());
streamDeck.actions.registerAction(new MilestoneAction());
streamDeck.actions.registerAction(new CompilePrayAction());
streamDeck.actions.registerAction(new RouletteAction());

streamDeck.connect();
```

- [ ] **Step 2: Skip typecheck now** (action classes don't exist yet — will pass after Task 14).

- [ ] **Step 3: Commit**

```bash
git add streamdeck-plugin/src/plugin.ts
git commit -m "feat(streamdeck): add plugin entry with action registrations

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Implement `src/actions/scene.ts`

Reference: `streamdeck-plugin/REBUILD-REFERENCE.md` section `com.thelab.toolkit.scene`.

**Files:**
- Create: `streamdeck-plugin/src/actions/scene.ts`

- [ ] **Step 1: Write the action class**

```typescript
import streamDeck, { action, KeyDownEvent, SingletonAction } from '@elgato/streamdeck';
import { apiCall, type ConnectionSettings } from '../api.js';

interface SceneSettings {
  sceneName?: string;
}

@action({ UUID: 'com.thelab.toolkit.scene' })
export class SceneAction extends SingletonAction<SceneSettings> {
  override async onKeyDown(ev: KeyDownEvent<SceneSettings>): Promise<void> {
    const globals = await streamDeck.settings.getGlobalSettings<ConnectionSettings>();
    const scene = ev.payload.settings.sceneName?.trim();
    if (!scene) {
      await flashFail(ev.action, 'No scene');
      return;
    }
    const result = await apiCall({
      method: 'POST',
      path: '/api/obs/scene',
      body: { scene },
      settings: globals,
    });
    if (result.ok) {
      await flashSuccess(ev.action);
    } else {
      await flashFail(ev.action, result.error ?? 'Error');
    }
  }
}

async function flashSuccess(a: { setTitle: (s: string) => Promise<void> }): Promise<void> {
  const prev = '';
  await a.setTitle('✓');
  setTimeout(() => { a.setTitle(prev).catch(() => {}); }, 400);
}

async function flashFail(a: { setTitle: (s: string) => Promise<void> }, msg: string): Promise<void> {
  await a.setTitle(msg.slice(0, 10));
  setTimeout(() => { a.setTitle('').catch(() => {}); }, 1500);
}
```

If the `REBUILD-REFERENCE.md` documents a different flash duration / title / icon-state for the shipped plugin, adjust `flashSuccess` / `flashFail` to match it. Default values above are a sensible fallback.

- [ ] **Step 2: Typecheck**

Run: `cd streamdeck-plugin && npm run typecheck`
Expected: errors about other-action imports in `plugin.ts` are OK for now; the `scene.ts` file itself should type-check clean.

- [ ] **Step 3: Commit**

```bash
git add streamdeck-plugin/src/actions/scene.ts
git commit -m "feat(streamdeck): add scene action (parity with shipped plugin)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Implement `src/actions/clip.ts`

Reference: `streamdeck-plugin/REBUILD-REFERENCE.md` section `com.thelab.toolkit.clip`.

**Files:**
- Create: `streamdeck-plugin/src/actions/clip.ts`

- [ ] **Step 1: Write the action class**

```typescript
import streamDeck, { action, KeyDownEvent, SingletonAction } from '@elgato/streamdeck';
import { apiCall, type ConnectionSettings } from '../api.js';

interface ClipSettings {
  tag?: string;
}

@action({ UUID: 'com.thelab.toolkit.clip' })
export class ClipAction extends SingletonAction<ClipSettings> {
  override async onKeyDown(ev: KeyDownEvent<ClipSettings>): Promise<void> {
    const globals = await streamDeck.settings.getGlobalSettings<ConnectionSettings>();
    const tag = ev.payload.settings.tag?.trim() || 'highlight';
    const result = await apiCall({
      method: 'POST',
      path: '/api/clips',
      body: { tag },
      settings: globals,
    });
    if (result.ok) {
      await ev.action.setTitle('✓');
      setTimeout(() => { ev.action.setTitle('').catch(() => {}); }, 400);
    } else {
      await ev.action.setTitle((result.error ?? 'Err').slice(0, 10));
      setTimeout(() => { ev.action.setTitle('').catch(() => {}); }, 1500);
    }
  }
}
```

Adjust path / body / default tag per `REBUILD-REFERENCE.md`.

- [ ] **Step 2: Commit**

```bash
git add streamdeck-plugin/src/actions/clip.ts
git commit -m "feat(streamdeck): add clip action

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Implement `src/actions/bug.ts` (with WS live count)

Reference: `streamdeck-plugin/REBUILD-REFERENCE.md` section `com.thelab.toolkit.bug`.

**Files:**
- Create: `streamdeck-plugin/src/actions/bug.ts`

- [ ] **Step 1: Write the action class**

```typescript
import streamDeck, { action, KeyDownEvent, SingletonAction, WillAppearEvent, WillDisappearEvent } from '@elgato/streamdeck';
import { apiCall, type ConnectionSettings } from '../api.js';
import { subscribe, type WsSubscription } from '../websocket.js';

interface BugSettings {
  bugTitle?: string;
}

let sharedSub: WsSubscription | null = null;
let subscribers = 0;
let openCount = 0;
const titleSetters = new Set<(count: number) => void>();

function ensureSubscription(settings: ConnectionSettings): void {
  subscribers++;
  if (sharedSub) return;
  sharedSub = subscribe(settings, async (event) => {
    if (event === 'bug-created' || event === 'bug-updated' || event === 'bug-deleted') {
      const res = await apiCall<{ open: number }>({ method: 'GET', path: '/api/bugs/count', settings });
      if (res.ok && res.data) {
        openCount = res.data.open;
        titleSetters.forEach((fn) => fn(openCount));
      }
    }
  });
  // Prime initial count
  apiCall<{ open: number }>({ method: 'GET', path: '/api/bugs/count', settings }).then((res) => {
    if (res.ok && res.data) {
      openCount = res.data.open;
      titleSetters.forEach((fn) => fn(openCount));
    }
  });
}

function releaseSubscription(): void {
  subscribers--;
  if (subscribers <= 0 && sharedSub) {
    sharedSub.close();
    sharedSub = null;
    subscribers = 0;
  }
}

@action({ UUID: 'com.thelab.toolkit.bug' })
export class BugAction extends SingletonAction<BugSettings> {
  override async onWillAppear(ev: WillAppearEvent<BugSettings>): Promise<void> {
    const globals = await streamDeck.settings.getGlobalSettings<ConnectionSettings>();
    const setter = (count: number) => { ev.action.setTitle(`🐛 ${count}`).catch(() => {}); };
    titleSetters.add(setter);
    setter(openCount);
    (ev.action as unknown as { _setter?: (c: number) => void })._setter = setter;
    ensureSubscription(globals);
  }

  override async onWillDisappear(ev: WillDisappearEvent<BugSettings>): Promise<void> {
    const setter = (ev.action as unknown as { _setter?: (c: number) => void })._setter;
    if (setter) titleSetters.delete(setter);
    releaseSubscription();
  }

  override async onKeyDown(ev: KeyDownEvent<BugSettings>): Promise<void> {
    const globals = await streamDeck.settings.getGlobalSettings<ConnectionSettings>();
    const title = ev.payload.settings.bugTitle?.trim();
    if (!title) {
      await ev.action.setTitle('No title');
      setTimeout(() => { ev.action.setTitle(`🐛 ${openCount}`).catch(() => {}); }, 1500);
      return;
    }
    const result = await apiCall({
      method: 'POST',
      path: '/api/bugs',
      body: { title },
      settings: globals,
    });
    if (!result.ok) {
      await ev.action.setTitle((result.error ?? 'Err').slice(0, 10));
      setTimeout(() => { ev.action.setTitle(`🐛 ${openCount}`).catch(() => {}); }, 1500);
    }
    // success: WS event will update title
  }
}
```

Adjust HTTP paths, body shape, event names, count-endpoint shape per `REBUILD-REFERENCE.md`. If the shipped plugin uses a different count-fetching mechanism (e.g. the WS payload itself carries the count), replace the `apiCall` inside the WS handler with payload extraction.

- [ ] **Step 2: Commit**

```bash
git add streamdeck-plugin/src/actions/bug.ts
git commit -m "feat(streamdeck): add bug action with live open-bug counter

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Implement `src/actions/experiment.ts`

Reference: `streamdeck-plugin/REBUILD-REFERENCE.md` section `com.thelab.toolkit.experiment`.

**Files:**
- Create: `streamdeck-plugin/src/actions/experiment.ts`

- [ ] **Step 1: Write the action class**

```typescript
import streamDeck, { action, KeyDownEvent, SingletonAction } from '@elgato/streamdeck';
import { apiCall, type ConnectionSettings } from '../api.js';

interface ExperimentSettings {
  action?: 'running' | 'success' | 'failed' | 'idle';
}

@action({ UUID: 'com.thelab.toolkit.experiment' })
export class ExperimentAction extends SingletonAction<ExperimentSettings> {
  override async onKeyDown(ev: KeyDownEvent<ExperimentSettings>): Promise<void> {
    const globals = await streamDeck.settings.getGlobalSettings<ConnectionSettings>();
    const status = ev.payload.settings.action ?? 'running';
    const result = await apiCall({
      method: 'POST',
      path: '/api/experiments/current/status',
      body: { status },
      settings: globals,
    });
    if (result.ok) {
      await ev.action.setTitle('✓');
      setTimeout(() => { ev.action.setTitle('').catch(() => {}); }, 400);
    } else {
      await ev.action.setTitle((result.error ?? 'Err').slice(0, 10));
      setTimeout(() => { ev.action.setTitle('').catch(() => {}); }, 1500);
    }
  }
}
```

Adjust path + body per `REBUILD-REFERENCE.md` (the `/api/experiments/current/status` guess is a placeholder — verify against decoded JS and current backend).

- [ ] **Step 2: Commit**

```bash
git add streamdeck-plugin/src/actions/experiment.ts
git commit -m "feat(streamdeck): add experiment action

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Implement `src/actions/todo.ts`

Reference: `streamdeck-plugin/REBUILD-REFERENCE.md` section `com.thelab.toolkit.todo`.

**Files:**
- Create: `streamdeck-plugin/src/actions/todo.ts`

- [ ] **Step 1: Write the action class**

```typescript
import streamDeck, { action, KeyDownEvent, SingletonAction } from '@elgato/streamdeck';
import { apiCall, type ConnectionSettings } from '../api.js';

interface TodoSettings {
  todoId?: string;
}

@action({ UUID: 'com.thelab.toolkit.todo' })
export class TodoAction extends SingletonAction<TodoSettings> {
  override async onKeyDown(ev: KeyDownEvent<TodoSettings>): Promise<void> {
    const globals = await streamDeck.settings.getGlobalSettings<ConnectionSettings>();
    const id = ev.payload.settings.todoId?.trim() || 'next';
    const result = await apiCall({
      method: 'POST',
      path: `/api/todos/${encodeURIComponent(id)}/complete`,
      settings: globals,
    });
    if (result.ok) {
      await ev.action.setTitle('✓');
      setTimeout(() => { ev.action.setTitle('').catch(() => {}); }, 400);
    } else {
      await ev.action.setTitle((result.error ?? 'Err').slice(0, 10));
      setTimeout(() => { ev.action.setTitle('').catch(() => {}); }, 1500);
    }
  }
}
```

Adjust path per `REBUILD-REFERENCE.md`.

- [ ] **Step 2: Commit**

```bash
git add streamdeck-plugin/src/actions/todo.ts
git commit -m "feat(streamdeck): add todo action

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Implement `src/actions/milestone.ts`

Reference: `streamdeck-plugin/REBUILD-REFERENCE.md` section `com.thelab.toolkit.milestone`.

**Files:**
- Create: `streamdeck-plugin/src/actions/milestone.ts`

- [ ] **Step 1: Write the action class**

```typescript
import streamDeck, { action, KeyDownEvent, SingletonAction } from '@elgato/streamdeck';
import { apiCall, type ConnectionSettings } from '../api.js';

interface MilestoneSettings {
  milestoneId?: string;
}

@action({ UUID: 'com.thelab.toolkit.milestone' })
export class MilestoneAction extends SingletonAction<MilestoneSettings> {
  override async onKeyDown(ev: KeyDownEvent<MilestoneSettings>): Promise<void> {
    const globals = await streamDeck.settings.getGlobalSettings<ConnectionSettings>();
    const id = ev.payload.settings.milestoneId?.trim() || 'next';
    const result = await apiCall({
      method: 'POST',
      path: `/api/milestones/${encodeURIComponent(id)}/complete`,
      settings: globals,
    });
    if (result.ok) {
      await ev.action.setTitle('✓');
      setTimeout(() => { ev.action.setTitle('').catch(() => {}); }, 400);
    } else {
      await ev.action.setTitle((result.error ?? 'Err').slice(0, 10));
      setTimeout(() => { ev.action.setTitle('').catch(() => {}); }, 1500);
    }
  }
}
```

Adjust path per `REBUILD-REFERENCE.md`.

- [ ] **Step 2: Commit**

```bash
git add streamdeck-plugin/src/actions/milestone.ts
git commit -m "feat(streamdeck): add milestone action

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Implement `src/actions/compile-pray.ts`

Reference: `streamdeck-plugin/REBUILD-REFERENCE.md` section `com.thelab.toolkit.compile-pray`.

**Files:**
- Create: `streamdeck-plugin/src/actions/compile-pray.ts`

- [ ] **Step 1: Write the action class**

```typescript
import streamDeck, { action, KeyDownEvent, SingletonAction } from '@elgato/streamdeck';
import { apiCall, type ConnectionSettings } from '../api.js';

@action({ UUID: 'com.thelab.toolkit.compile-pray' })
export class CompilePrayAction extends SingletonAction {
  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    const globals = await streamDeck.settings.getGlobalSettings<ConnectionSettings>();
    const result = await apiCall({
      method: 'POST',
      path: '/api/actions/compile-pray',
      settings: globals,
    });
    if (result.ok) {
      await ev.action.setTitle('🙏');
      setTimeout(() => { ev.action.setTitle('').catch(() => {}); }, 800);
    } else {
      await ev.action.setTitle((result.error ?? 'Err').slice(0, 10));
      setTimeout(() => { ev.action.setTitle('').catch(() => {}); }, 1500);
    }
  }
}
```

Adjust path + flash icon per `REBUILD-REFERENCE.md`.

- [ ] **Step 2: Commit**

```bash
git add streamdeck-plugin/src/actions/compile-pray.ts
git commit -m "feat(streamdeck): add compile-pray action

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Implement `src/actions/roulette.ts` (with cooldown)

Reference: `streamdeck-plugin/REBUILD-REFERENCE.md` section `com.thelab.toolkit.roulette`. Verify cooldown duration there; the default below is 60 s.

**Files:**
- Create: `streamdeck-plugin/src/actions/roulette.ts`

- [ ] **Step 1: Write the action class**

```typescript
import streamDeck, { action, KeyDownEvent, SingletonAction, WillAppearEvent, WillDisappearEvent } from '@elgato/streamdeck';
import { apiCall, type ConnectionSettings } from '../api.js';

const COOLDOWN_MS = 60_000;
let cooldownUntil = 0;
const activeActions = new Set<{ setTitle: (s: string) => Promise<void> }>();
let tickInterval: NodeJS.Timeout | null = null;

function startTicker(): void {
  if (tickInterval) return;
  tickInterval = setInterval(() => {
    const remaining = Math.max(0, cooldownUntil - Date.now());
    if (remaining <= 0) {
      activeActions.forEach((a) => a.setTitle('').catch(() => {}));
      if (tickInterval) { clearInterval(tickInterval); tickInterval = null; }
      return;
    }
    const label = `Cooldown ${Math.ceil(remaining / 1000)}s`;
    activeActions.forEach((a) => a.setTitle(label).catch(() => {}));
  }, 500);
}

@action({ UUID: 'com.thelab.toolkit.roulette' })
export class RouletteAction extends SingletonAction {
  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    activeActions.add(ev.action);
    if (cooldownUntil > Date.now()) startTicker();
  }

  override async onWillDisappear(ev: WillDisappearEvent): Promise<void> {
    activeActions.delete(ev.action);
  }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    if (cooldownUntil > Date.now()) return;
    const globals = await streamDeck.settings.getGlobalSettings<ConnectionSettings>();
    const result = await apiCall({
      method: 'POST',
      path: '/api/actions/roulette',
      settings: globals,
    });
    if (result.ok) {
      cooldownUntil = Date.now() + COOLDOWN_MS;
      startTicker();
    } else {
      await ev.action.setTitle((result.error ?? 'Err').slice(0, 10));
      setTimeout(() => { ev.action.setTitle('').catch(() => {}); }, 1500);
    }
  }
}
```

Adjust cooldown duration + path + label format per `REBUILD-REFERENCE.md`.

- [ ] **Step 2: Typecheck whole subproject now**

Run: `cd streamdeck-plugin && npm run typecheck`
Expected: exit 0 across `plugin.ts`, all 8 actions, `api.ts`, `websocket.ts`.

- [ ] **Step 3: Commit**

```bash
git add streamdeck-plugin/src/actions/roulette.ts
git commit -m "feat(streamdeck): add roulette action with cooldown

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: Build pipeline `build.mjs`

Bundles `src/plugin.ts` → `com.thelab.toolkit.sdPlugin/bin/plugin.js` and optionally zips the whole sdPlugin dir into `../assets/com.thelab.toolkit.streamDeckPlugin`.

**Files:**
- Create: `streamdeck-plugin/build.mjs`

- [ ] **Step 1: Write the build script**

```javascript
import esbuild from 'esbuild';
import archiver from 'archiver';
import { createWriteStream, mkdirSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SD_DIR = resolve(__dirname, 'com.thelab.toolkit.sdPlugin');
const BIN_DIR = join(SD_DIR, 'bin');
const ZIP_OUT = resolve(__dirname, '..', 'assets', 'com.thelab.toolkit.streamDeckPlugin');

async function bundle() {
  mkdirSync(BIN_DIR, { recursive: true });
  await esbuild.build({
    entryPoints: [resolve(__dirname, 'src/plugin.ts')],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    outfile: join(BIN_DIR, 'plugin.js'),
    external: [],
    logLevel: 'info',
  });
  console.log('[plugin] bundled → bin/plugin.js');
}

async function pack() {
  await bundle();
  if (existsSync(ZIP_OUT)) rmSync(ZIP_OUT);
  mkdirSync(dirname(ZIP_OUT), { recursive: true });
  await new Promise((res, rej) => {
    const out = createWriteStream(ZIP_OUT);
    const zip = archiver('zip', { zlib: { level: 9 } });
    out.on('close', res);
    out.on('error', rej);
    zip.on('error', rej);
    zip.pipe(out);
    zip.directory(SD_DIR, 'com.thelab.toolkit.sdPlugin');
    zip.finalize();
  });
  console.log(`[plugin] packaged → ${ZIP_OUT}`);
}

const cmd = process.argv[2];
if (cmd === 'package') await pack();
else if (cmd === 'bundle') await bundle();
else { console.error('Usage: node build.mjs [bundle|package]'); process.exit(1); }
```

- [ ] **Step 2: Run the build**

```bash
cd streamdeck-plugin && npm run package
```
Expected:
- `com.thelab.toolkit.sdPlugin/bin/plugin.js` created
- `assets/com.thelab.toolkit.streamDeckPlugin` rebuilt on disk — overwrites the tracked binary with the freshly-built ZIP. Git status now shows this file as "modified."

This is intentional. The freshly-built ZIP is what Task 17 installs for QA. We do **not** commit this overwrite until Task 18 (after parity verification). Throughout Tasks 15–17, `git status` will show this file as modified — leave it.

- [ ] **Step 3: Commit only the build script**

```bash
git add streamdeck-plugin/build.mjs
git commit -m "feat(streamdeck): add esbuild+archiver build pipeline

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

**Do not use `git add .` or `git add -A`** — that would stage the overwritten binary prematurely. Always add explicit paths.

---

### Task 16: Root `package.json` integration

**Files:**
- Modify: `package.json` (root)

- [ ] **Step 1: Add `build:plugin` script and extend `build`**

Read current `package.json`, then in the `scripts` object:

- Add: `"build:plugin": "npm --prefix streamdeck-plugin run package"`
- Change existing `"build"` from whatever it is today (e.g. `"tsc && vite build && electron-builder"`) to prepend `npm run build:plugin && ` — so `npm run build` now also produces a fresh plugin ZIP before electron-builder packages the Electron app.

Exact edit depends on the current `build` value — read the file first and adapt the prefix; do not replace the rest of the command.

- [ ] **Step 2: Run full build to verify**

```bash
npm run build
```
Expected: plugin builds first, then the Electron app packages. `dist/` contains the installer. `assets/com.thelab.toolkit.streamDeckPlugin` stays as the freshly-built ZIP (the full build rebuilds it, same result as Task 15 Step 2).

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "build: add build:plugin script and integrate into main build

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 17: Parity verification (manual QA)

**No file changes.** This is a manual QA step. Do not proceed to Task 18 unless all 8 actions pass.

- [ ] **Step 1: Install freshly-built plugin in Stream Deck**

1. Confirm `assets/com.thelab.toolkit.streamDeckPlugin` on disk is the freshly-built ZIP from Task 15 / 16 (git status shows it as modified — that's the one).
2. In the Elgato Stream Deck desktop app: right-click the existing "The Lab Toolkit" plugin → Uninstall.
3. Double-click `assets/com.thelab.toolkit.streamDeckPlugin` — Elgato installer opens.
4. Confirm install in the Elgato dialog.
5. Restart Stream Deck if needed.

- [ ] **Step 2: Start Stream Toolkit with OBS + Twitch connected**

Run: `npm run dev`
Wait for: OBS "connected" status in the toolkit UI.

- [ ] **Step 3: Verify each of 8 actions**

For each UUID below, drag the action onto a deck slot (or re-use an existing bound button if your deck already has it), configure its Property Inspector as noted, press, and confirm the expected effect. Any mismatch → fix the action's TS file + `REBUILD-REFERENCE.md`, rebuild (`npm run build:plugin && mv ...`), reinstall, retry.

- `com.thelab.toolkit.scene`: PI `sceneName = <an OBS scene you have>`, press → OBS switches to that scene
- `com.thelab.toolkit.clip`: PI `tag = highlight`, press → toolkit creates a highlight clip (check Clips panel)
- `com.thelab.toolkit.bug`: title shows `🐛 N` (N = current open bugs); PI `bugTitle = "test bug"`, press → new bug appears in Bugs panel AND button title count increments
- `com.thelab.toolkit.experiment`: PI `action = success`, press → current experiment flips to success
- `com.thelab.toolkit.todo`: PI `todoId = next`, press → next open todo is completed
- `com.thelab.toolkit.milestone`: PI `milestoneId = next`, press → next open milestone is completed
- `com.thelab.toolkit.compile-pray`: press → compile-pray alert visible in overlay
- `com.thelab.toolkit.roulette`: press → roulette spins; button title shows `Cooldown Ns`; wait 60 s, title clears, button pressable again

- [ ] **Step 4: Verify existing-config preservation**

If any of your existing deck buttons were bound to the old plugin (same UUIDs), confirm they still work without reconfiguration after the rebuilt plugin installed. If a button lost its settings, record which action and investigate in the corresponding TS file.

- [ ] **Step 5: No code commit**. Parity pass unblocks Task 18.

---

### Task 18: Remove committed binary + gitignore

Only proceed if Task 17 fully passed.

**Files:**
- Delete from git: `assets/com.thelab.toolkit.streamDeckPlugin` (the tracked binary — on-disk file stays, as the freshly-built ZIP)
- Modify: `.gitignore` (root)

- [ ] **Step 1: Remove tracked binary from git without deleting from disk**

```bash
git rm --cached assets/com.thelab.toolkit.streamDeckPlugin
```
The `--cached` flag removes from the git index but keeps the file on disk — we need the freshly-built ZIP to stay there for runtime packaging.

- [ ] **Step 2: Add to `.gitignore`**

Append to `.gitignore` (root):
```
# Built-on-demand Stream Deck plugin bundle (see streamdeck-plugin/)
assets/com.thelab.toolkit.streamDeckPlugin
```

- [ ] **Step 3: Verify electron-builder still bundles the ZIP**

Read `electron-builder.json`. Confirm `files` (or equivalent) includes `assets/**` or `assets/com.thelab.toolkit.streamDeckPlugin`. If electron-builder explicitly lists files and this one isn't in the list, add it. (The file must still be in the packaged app at runtime, even though it's gitignored.)

- [ ] **Step 4: Do a full release-style build and verify the ZIP is in `dist/`**

```bash
npm run build
```
Then inspect the Electron installer output (`dist/win-unpacked/resources/app/assets/` on Windows) and confirm `com.thelab.toolkit.streamDeckPlugin` is present.

- [ ] **Step 5: Commit**

The `git rm --cached` from Step 1 is already in the index. Add the gitignore (and `electron-builder.json` if Step 3 required a change):

```bash
git add .gitignore
# If electron-builder.json changed in Step 3, add it too:
git add electron-builder.json 2>/dev/null || true
git commit -m "build: remove committed plugin binary; build-on-demand via build:plugin

Source now lives in streamdeck-plugin/; ZIP is rebuilt by npm run build
and bundled by electron-builder from assets/.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 19: Push + close the loop

- [ ] **Step 1: Run typecheck + lint at repo root**

```bash
npm run typecheck && npm run lint
```
Expected: both exit 0.

- [ ] **Step 2: Verify clean git tree**

```bash
git status
```
Expected: `nothing to commit, working tree clean`. (`.new` and `bin/` artifacts should all be gitignored.)

- [ ] **Step 3: Push to origin**

```bash
git push origin main
```

- [ ] **Step 4: Update plans memory**

Note in `MEMORY.md` / relevant project-memory file: plugin source rebuild complete, unblocks Scene-Dropdown feature (Task #3 in the broader work-tracking list). Close plan.

---

## Spec Coverage Check

| Spec section | Covered by |
|---|---|
| Subproject structure (`streamdeck-plugin/`) | Tasks 1, 2, 15 |
| All 8 actions with parity | Tasks 3, 7–14, 17 |
| Shared Property Inspector `pi.html` | Task 2 (copied verbatim) |
| Plugin runtime + `@elgato/streamdeck` SDK | Tasks 6, 7–14 |
| Build pipeline (esbuild + archiver → ZIP) | Task 15 |
| Root `package.json` integration | Task 16 |
| Parity verification (manual QA) | Task 17 |
| Version bump to `1.0.1.0` | Task 2 Step 3 |
| UUID continuity (`com.thelab.toolkit.*`) | Task 2 (copied manifest verbatim aside from version) |
| Binary removal + gitignore | Task 18 |
| Electron-builder still bundles ZIP at runtime | Task 18 Steps 4–5 |
| Non-goal: no new features | Enforced by referencing `REBUILD-REFERENCE.md` as source-of-truth in every action task |

## Risks Carried from Spec

- Backend endpoint drift — catches in Task 3 cross-check (Step 3) and Task 17.
- SDK version deltas — catches in Task 17 per-action manual QA.
- Binary-in-history — accepted (not a secret, ~81 KB).

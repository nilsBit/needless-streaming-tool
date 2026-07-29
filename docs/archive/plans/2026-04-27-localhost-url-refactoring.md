# Localhost URL Refactoring — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all hardcoded `localhost:4000` URLs with dynamic references so the port is configurable via `NST_PORT` env variable and the host via `NST_HOST`.

**Architecture:** Server exports configurable PORT/HOST. Main process forwards port to renderer via URL hash and to hotkeys module. Renderer extracts port at module load. Overlays use `window.location.origin`. Server APIs use `req.headers.host`.

**Tech Stack:** TypeScript, Electron, Express, React, Vite

**Spec:** `docs/superpowers/specs/2026-04-27-localhost-url-refactoring-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/server/index.ts` | Configurable PORT/HOST, updated return type, CORS |
| Modify | `src/main/main.ts` | Forward port in hash, set hotkey port, dynamic CSP |
| Modify | `src/main/hotkeys.ts` | Module-level port, setHotkeyPort() |
| Modify | `src/renderer/src/hooks/useApi.ts` | Dynamic API_BASE from hash |
| Modify | `src/renderer/src/hooks/useWebSocket.ts` | Dynamic WS URL |
| Modify | `src/server/api/auth.ts` | Dynamic redirect URI |
| Modify | `src/server/api/custom-overlays.ts` | Dynamic overlay URLs |
| Modify | `src/renderer/src/panels/ProgressPanel.tsx` | Dynamic export URL |
| Modify | `src/renderer/src/panels/ClipsPanel.tsx` | Dynamic export URL |
| Modify | `src/renderer/src/panels/SettingsPanel.tsx` | Dynamic display URL |
| Modify | `src/renderer/src/components/onboarding/TwitchStep.tsx` | Dynamic display URL |
| Modify | `src/overlays/progress/index.html` | window.location.origin |
| Modify | `src/overlays/alerts/index.html` | window.location.origin |
| Modify | `src/overlays/roulette/index.html` | window.location.origin |
| Modify | `src/overlays/poll/index.html` | window.location.origin |
| Modify | `src/overlays/song/index.html` | window.location.origin |
| Modify | `src/overlays/song-queue/index.html` | window.location.origin |
| Modify | `src/overlays/milestone/index.html` | window.location.origin |
| Modify | `src/overlays/todos/index.html` | window.location.origin |
| Modify | `src/overlays/experiment/index.html` | window.location.origin |
| Modify | `src/overlays/_template/index.html` | Update template code |

---

## Task 1: Server — Configurable PORT and HOST

**Files:**
- Modify: `src/server/index.ts`

- [ ] **Step 1: Replace hardcoded PORT with configurable PORT/HOST**

Replace line 37:
```typescript
const PORT = 4000;
```
With:
```typescript
const parsedPort = parseInt(process.env.NST_PORT || '4000', 10);
if (isNaN(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
  throw new Error(`Invalid NST_PORT: ${process.env.NST_PORT}`);
}
export const PORT = parsedPort;
const HOST = process.env.NST_HOST || '127.0.0.1';
```

- [ ] **Step 2: Change return type and resolve value**

Replace line 39:
```typescript
export async function startServer(): Promise<string> {
```
With:
```typescript
export async function startServer(): Promise<{ token: string; port: number }> {
```

Replace line 193:
```typescript
    server.listen(PORT, () => {
```
With:
```typescript
    server.listen(PORT, HOST, () => {
```

Replace line 224:
```typescript
      resolve(token);
```
With:
```typescript
      resolve({ token, port: PORT });
```

- [ ] **Step 3: Update CORS to allow LAN IPs when bound to 0.0.0.0**

Replace lines 46-55:
```typescript
  app.use((req, res, next) => {
    const origin = req.headers.origin || '';
    if (!origin || origin.startsWith('http://localhost:') || origin.startsWith('file://')) {
      res.header('Access-Control-Allow-Origin', origin || '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
    next();
  });
```
With:
```typescript
  app.use((req, res, next) => {
    const origin = req.headers.origin || '';
    const allowed = !origin || origin.startsWith('http://localhost:') || origin.startsWith('file://') ||
      (HOST === '0.0.0.0' && /^https?:\/\/\d+\.\d+\.\d+\.\d+/.test(origin));
    if (allowed) {
      res.header('Access-Control-Allow-Origin', origin || '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
    next();
  });
```

- [ ] **Step 4: Update CSP fallback to use PORT**

Replace in the overlay CSP middleware:
```typescript
    const host = req.headers.host || 'localhost:4000';
```
With:
```typescript
    const host = req.headers.host || `localhost:${PORT}`;
```

- [ ] **Step 5: Update EADDRINUSE error message**

Replace line 173:
```typescript
      console.error(`[Server] Port ${PORT} already in use. Close the other instance first.`);
```
With:
```typescript
      console.error(`[Server] ${HOST}:${PORT} already in use. Close the other instance first.`);
```

- [ ] **Step 6: Verify typecheck**

Run: `npm run typecheck`
Expected: Errors in `main.ts` (return type mismatch) — this is expected and will be fixed in Task 2.

- [ ] **Step 7: Commit**

```bash
git add src/server/index.ts
git commit -m "feat(server): configurable PORT and HOST via env variables"
```

---

## Task 2: Main Process — Port Forwarding

**Files:**
- Modify: `src/main/main.ts`
- Modify: `src/main/hotkeys.ts`

- [ ] **Step 1: Add setHotkeyPort to hotkeys.ts**

Add after line 4 (after the imports):
```typescript
let serverPort = 4000;

export function setHotkeyPort(port: number) {
  serverPort = port;
}
```

Replace in apiCall:
```typescript
    hostname: 'localhost',
    port: 4000,
```
With:
```typescript
    hostname: 'localhost',
    port: serverPort,
```

Replace in apiGet:
```typescript
    http.get(`http://localhost:4000${path}`, { headers: { 'Authorization': `Bearer ${getApiToken()}` } }, (res) => {
```
With:
```typescript
    http.get(`http://localhost:${serverPort}${path}`, { headers: { 'Authorization': `Bearer ${getApiToken()}` } }, (res) => {
```

- [ ] **Step 2: Update main.ts to forward port**

Update import:
```typescript
import { registerHotkeys, unregisterHotkeys } from './hotkeys';
```
To:
```typescript
import { registerHotkeys, unregisterHotkeys, setHotkeyPort } from './hotkeys';
```

Add module-level variable — replace:
```typescript
let apiToken: string = '';
```
With:
```typescript
let apiToken: string = '';
let appPort: number = 4000;
```

Replace the startServer call:
```typescript
  apiToken = await startServer();
```
With:
```typescript
  const serverResult = await startServer();
  apiToken = serverResult.token;
  appPort = serverResult.port;
  setHotkeyPort(appPort);
```

Replace dev URL:
```typescript
    mainWindow.loadURL(`http://localhost:5173#token=${apiToken}`);
```
With:
```typescript
    mainWindow.loadURL(`http://localhost:5173#token=${apiToken}&port=${appPort}`);
```

Replace prod URL:
```typescript
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'), {
      hash: `token=${apiToken}`,
    });
```
With:
```typescript
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'), {
      hash: `token=${apiToken}&port=${appPort}`,
    });
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/main/main.ts src/main/hotkeys.ts
git commit -m "feat(main): forward server port to renderer and hotkeys"
```

---

## Task 3: Renderer — Dynamic API and WebSocket URLs

**Files:**
- Modify: `src/renderer/src/hooks/useApi.ts`
- Modify: `src/renderer/src/hooks/useWebSocket.ts`

- [ ] **Step 1: Make API_BASE dynamic in useApi.ts**

Replace lines 3-4:
```typescript
const API_BASE = 'http://localhost:4000/api';

// Extract API token from URL hash (set by Electron main process)
```
With:
```typescript
// Extract config from URL hash (set by Electron main process)
const _hash = window.location.hash.substring(1);
const _hashParams = new URLSearchParams(_hash);
const SERVER_PORT = parseInt(_hashParams.get('port') || '4000', 10);
const API_BASE = `http://localhost:${SERVER_PORT}/api`;

export function getApiBase(): string { return API_BASE; }
export function getServerPort(): number { return SERVER_PORT; }

```

- [ ] **Step 2: Make WebSocket URL dynamic in useWebSocket.ts**

Add import at line 2:
```typescript
import { getApiToken } from './useApi';
```
Change to:
```typescript
import { getApiToken, getServerPort } from './useApi';
```

Replace line 20:
```typescript
      ws = new WebSocket(`ws://localhost:4000?token=${token}`);
```
With:
```typescript
      ws = new WebSocket(`ws://localhost:${getServerPort()}?token=${token}`);
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/hooks/useApi.ts src/renderer/src/hooks/useWebSocket.ts
git commit -m "feat(renderer): dynamic API and WebSocket URLs from port config"
```

---

## Task 4: Renderer Panels — Dynamic Export URLs

**Files:**
- Modify: `src/renderer/src/panels/ProgressPanel.tsx`
- Modify: `src/renderer/src/panels/ClipsPanel.tsx`
- Modify: `src/renderer/src/panels/SettingsPanel.tsx`
- Modify: `src/renderer/src/components/onboarding/TwitchStep.tsx`

- [ ] **Step 1: Fix ProgressPanel export URL**

Add import (if not already present — check existing imports for `getApiToken`):
```typescript
import { getApiToken, getApiBase } from '../hooks/useApi';
```

Replace line 214:
```typescript
    window.open(`http://localhost:4000/api/progress/export?token=${token}`, '_blank');
```
With:
```typescript
    window.open(`${getApiBase()}/progress/export?token=${token}`, '_blank');
```

- [ ] **Step 2: Fix ClipsPanel export URL**

Add/update import:
```typescript
import { getApiToken, getApiBase } from '../hooks/useApi';
```

Replace line 114:
```typescript
    window.open(`http://localhost:4000/api/clips/export?session_date=${sessionDate}&token=${token}`, '_blank');
```
With:
```typescript
    window.open(`${getApiBase()}/clips/export?session_date=${sessionDate}&token=${token}`, '_blank');
```

- [ ] **Step 3: Fix SettingsPanel display text**

Add import:
```typescript
import { getServerPort } from '../hooks/useApi';
```

Replace line 654:
```typescript
            <p className="setup-info">Base URL: <code>http://localhost:4000/api</code></p>
```
With:
```typescript
            <p className="setup-info">Base URL: <code>http://localhost:{getServerPort()}/api</code></p>
```

- [ ] **Step 4: Fix TwitchStep display text**

Add import:
```typescript
import { getServerPort } from '../../hooks/useApi';
```

Replace line 65:
```typescript
            <div className="info-row"><span className="info-label">OAuth Redirect URL:</span><span className="info-mono">http://localhost:4000/auth/twitch/callback</span></div>
```
With:
```typescript
            <div className="info-row"><span className="info-label">OAuth Redirect URL:</span><span className="info-mono">http://localhost:{getServerPort()}/auth/twitch/callback</span></div>
```

- [ ] **Step 5: Verify typecheck**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/panels/ProgressPanel.tsx src/renderer/src/panels/ClipsPanel.tsx src/renderer/src/panels/SettingsPanel.tsx src/renderer/src/components/onboarding/TwitchStep.tsx
git commit -m "feat(renderer): dynamic URLs in panels and onboarding"
```

---

## Task 5: Server APIs — Dynamic URLs

**Files:**
- Modify: `src/server/api/auth.ts`
- Modify: `src/server/api/custom-overlays.ts`

- [ ] **Step 1: Fix auth.ts redirect URI**

Build redirect URI dynamically from the request host (avoids circular import with `index.ts`).

In the GET `/twitch/url` handler, change `(_req, res)` to `(req, res)` and replace:
```typescript
  const redirectUri = 'http://localhost:4000/auth/twitch/callback';
```
With:
```typescript
  const redirectUri = `http://${req.headers.host}/auth/twitch/callback`;
```

In the POST `/twitch/open` handler, change `(_req, res)` to `(req, res)` and replace:
```typescript
  const redirectUri = 'http://localhost:4000/auth/twitch/callback';
```
With:
```typescript
  const redirectUri = `http://${req.headers.host}/auth/twitch/callback`;
```

- [ ] **Step 2: Fix custom-overlays.ts overlay URLs**

Replace line 41:
```typescript
          url: `http://localhost:4000/overlay/custom/${e.name}/index.html`,
```
With:
```typescript
          url: `http://${req.headers.host}/overlay/custom/${e.name}/index.html`,
```

But `req` is not in scope of the `.map()` callback. Need to capture it. Replace lines 29-47 (the full GET / handler):
```typescript
router.get('/', (_req, res) => {
  const dir = ensureDir();
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const overlays = entries
      .filter((e) => e.isDirectory())
      .map((e) => {
        const indexPath = path.join(dir, e.name, 'index.html');
        const exists = fs.existsSync(indexPath);
        return {
          name: e.name,
          hasIndex: exists,
          url: `http://localhost:4000/overlay/custom/${e.name}/index.html`,
        };
      });
    res.json(overlays);
  } catch {
    res.json([]);
  }
});
```
With:
```typescript
router.get('/', (req, res) => {
  const dir = ensureDir();
  const host = req.headers.host || 'localhost:4000';
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const overlays = entries
      .filter((e) => e.isDirectory())
      .map((e) => {
        const indexPath = path.join(dir, e.name, 'index.html');
        const exists = fs.existsSync(indexPath);
        return {
          name: e.name,
          hasIndex: exists,
          url: `http://${host}/overlay/custom/${e.name}/index.html`,
        };
      });
    res.json(overlays);
  } catch {
    res.json([]);
  }
});
```

Replace lines 51-70 (GET /builtin handler):
```typescript
router.get('/builtin', (_req, res) => {
```
With:
```typescript
router.get('/builtin', (req, res) => {
```

Replace line 62:
```typescript
          url: `http://localhost:4000/overlay/${e.name}/index.html`,
```
With:
```typescript
          url: `http://${req.headers.host}/overlay/${e.name}/index.html`,
```

Replace line 168:
```typescript
    url: `http://localhost:4000/overlay/custom/${safeName}/index.html`,
```
With:
```typescript
    url: `http://${req.headers.host}/overlay/custom/${safeName}/index.html`,
```

Note: The POST handler for creating overlays — check if `req` is available. It is (it's a route handler).

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/server/api/auth.ts src/server/api/custom-overlays.ts
git commit -m "feat(server): dynamic URLs in auth and custom-overlays APIs"
```

---

## Task 6: Overlays — window.location.origin

**Files:** All 9 overlay HTML files + template

Each overlay follows the same pattern. In the config loader IIFE, add origin detection. Then replace all hardcoded URLs.

**Pattern for each overlay:**

1. In the config loader `(function() {` block, after `var name = '...'`, add:
```javascript
  var origin = window.location.origin || 'http://localhost:4000';
  window.__overlayOrigin = origin;
  window.__overlayWs = origin.replace(/^http/, 'ws');
```

2. Replace all `'http://localhost:4000/public/...'` in the config loader with `origin + '/public/...'`

3. Replace all `'http://localhost:4000/public/...'` in main script `fetch()` calls with template literals using `window.__overlayOrigin`

4. Replace all `'ws://localhost:4000?overlay=1'` with template literal using `window.__overlayWs`

- [ ] **Step 1: Fix progress overlay** (`src/overlays/progress/index.html`)
- [ ] **Step 2: Fix alerts overlay** (`src/overlays/alerts/index.html`)
- [ ] **Step 3: Fix roulette overlay** (`src/overlays/roulette/index.html`)
- [ ] **Step 4: Fix poll overlay** (`src/overlays/poll/index.html`)
- [ ] **Step 5: Fix song overlay** (`src/overlays/song/index.html`)
- [ ] **Step 6: Fix song-queue overlay** (`src/overlays/song-queue/index.html`)
- [ ] **Step 7: Fix milestone overlay** (`src/overlays/milestone/index.html`)
- [ ] **Step 8: Fix todos overlay** (`src/overlays/todos/index.html`)
- [ ] **Step 9: Fix experiment overlay** (`src/overlays/experiment/index.html`)
- [ ] **Step 10: Fix template overlay** (`src/overlays/_template/index.html`)
- [ ] **Step 11: Clean up reward-rankchange fallback** — remove `|| 'http://localhost:4000'` from `src/overlays/reward-rankchange/index.html` since `window.location.origin` is always available when served by Express. (`reward-leaderboard` was already fully cleaned up.)

- [ ] **Step 12: Commit**

```bash
git add src/overlays/
git commit -m "feat(overlays): replace hardcoded localhost with window.location.origin"
```

---

## Task 7: E2E Verification

- [ ] **Step 1: Verify typecheck**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 2: Verify lint**

Run: `npm run lint`
Expected: No new errors

- [ ] **Step 3: Grep for remaining hardcoded localhost:4000**

Run: `grep -r "localhost:4000" src/ --include="*.ts" --include="*.tsx" --include="*.html" | grep -v "node_modules" | grep -v ".d.ts" | grep -v "help-en.ts" | grep -v "help-de.ts"`
Expected: No results (help docs are intentionally kept as documentation defaults)

- [ ] **Step 4: Manual verification**

1. Start with default port: `npm run dev` — app should work as before
2. Open overlay: `http://localhost:4000/overlay/progress/index.html` — should load and connect via WS
3. Check overlays panel — URLs should show `localhost:4000` (from req.headers.host)

- [ ] **Step 5: Final commit if any fixes needed**

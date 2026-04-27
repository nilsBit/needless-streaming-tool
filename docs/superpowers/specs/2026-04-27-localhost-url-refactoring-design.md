# Hardcoded Localhost URL Refactoring

## Overview

Replace all hardcoded `localhost:4000` and `localhost:5173` URLs throughout the codebase with dynamic references. Port becomes configurable via `NST_PORT` env variable (default 4000). Server host becomes configurable via `NST_HOST` env variable (default `127.0.0.1`, set to `0.0.0.0` for LAN access).

## Architecture

### Port/Host Configuration

**Server** (`src/server/index.ts`):
- Reads `process.env.NST_PORT` (default `4000`) and `process.env.NST_HOST` (default `127.0.0.1`)
- `server.listen(PORT, HOST)` — binds explicitly
- Exports `PORT` for use by other server modules

**Main Process** (`src/main/main.ts`):
- Receives the port from `startServer()` return value (change return type from `string` to `{ token: string; port: number }`)
- Passes port to renderer via URL hash: `#token=${token}&port=${port}`
- Passes port to hotkeys module

**Renderer** (`src/renderer/`):
- Extracts port from `window.location.hash` alongside the token
- `useApi` and `useWebSocket` hooks build URLs dynamically from the extracted port
- Panels that open export windows build URLs dynamically

**Overlays** (`src/overlays/`):
- Use `window.location.origin` for HTTP and `origin.replace(/^http/, 'ws')` for WebSocket
- No port knowledge needed — they're served by the same Express server they connect to

**Custom Overlays API** (`src/server/api/custom-overlays.ts`):
- Builds overlay URLs using `req.headers.host` instead of hardcoded `localhost:4000`
- Hardcodes `http://` protocol (no HTTPS support needed for local desktop app)

**OAuth** (`src/server/api/auth.ts`):
- Builds redirect URI dynamically from the request

## Components

### 1. Server: Configurable Port and Host

**File:** `src/server/index.ts`

```typescript
const parsedPort = parseInt(process.env.NST_PORT || '4000', 10);
if (isNaN(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
  throw new Error(`Invalid NST_PORT: ${process.env.NST_PORT}`);
}
export const PORT = parsedPort;
const HOST = process.env.NST_HOST || '127.0.0.1';
```

- `startServer()` return type changes from `Promise<string>` to `Promise<{ token: string; port: number }>`
- `server.listen(PORT, HOST, () => { ... })` — explicit host binding
- CORS updated to also allow origins from LAN IPs (when bound to `0.0.0.0`)
- CSP already dynamic (from previous fix)

CORS change:
```typescript
// Allow localhost on any port + LAN IPs when server is network-accessible
if (!origin || origin.startsWith('http://localhost:') || origin.startsWith('file://') ||
    (HOST === '0.0.0.0' && /^https?:\/\/\d+\.\d+\.\d+\.\d+/.test(origin))) {
```

### 2. Main Process: Port Forwarding

**File:** `src/main/main.ts`

- Destructure `startServer()` result: `const { token, port } = await startServer()`
- Dev URL: `http://localhost:5173#token=${token}&port=${port}`
- Prod URL: `file://...#token=${token}&port=${port}`
- Set port for hotkeys module before calling: `setHotkeyPort(port); registerHotkeys()`
- Update CSP in `webRequest.onHeadersReceived` to include dynamic port: `http://localhost:${port} ws://localhost:${port}`

**File:** `src/main/hotkeys.ts`

- Add module-level `let serverPort = 4000` variable
- Export `setHotkeyPort(port: number)` — sets the module-level port variable
- `registerHotkeys(config?: Partial<HotkeyConfig>)` signature remains unchanged
- `apiCall()` and `apiGet()` use `serverPort` instead of hardcoded `4000`

### 3. Renderer: Dynamic URL Construction

**File:** `src/renderer/src/hooks/useApi.ts`

Extract port from hash alongside token:
Compute port once at module load time (hash does not change during app lifetime):
```typescript
const hash = window.location.hash.substring(1);
const hashParams = new URLSearchParams(hash);
const SERVER_PORT = parseInt(hashParams.get('port') || '4000', 10);
const API_BASE = `http://localhost:${SERVER_PORT}/api`;

export function getApiBase(): string { return API_BASE; }
export function getServerPort(): number { return SERVER_PORT; }
```

All functions continue using `API_BASE` (now dynamically computed at load).
`getApiBase()` and `getServerPort()` are exported for use by panels and WebSocket hook.

**File:** `src/renderer/src/hooks/useWebSocket.ts`

```typescript
import { getServerPort } from './useApi';
const port = getServerPort();
ws = new WebSocket(`ws://localhost:${port}?token=${token}`);
```

**Files with `window.open()` to API URLs:**
- `src/renderer/src/panels/ProgressPanel.tsx` — use `getApiBase()`
- `src/renderer/src/panels/ClipsPanel.tsx` — use `getApiBase()`

**Files with hardcoded API URLs in text:**
- `src/renderer/src/panels/SettingsPanel.tsx` — display text, use `getServerPort()`
- `src/renderer/src/docs/help-en.ts` — keep `localhost:4000` as documentation default (static text, not executable)
- `src/renderer/src/docs/help-de.ts` — keep `localhost:4000` as documentation default (static text, not executable)
- `src/renderer/src/components/onboarding/TwitchStep.tsx` — display text, use `getServerPort()`

### 4. Overlays: window.location.origin

All overlay HTML files replace hardcoded URLs with dynamic origin detection.

**Pattern applied to each overlay:**
```javascript
// In config loader IIFE:
var origin = window.location.origin || 'http://localhost:4000';
window.__overlayOrigin = origin;
window.__overlayWs = origin.replace(/^http/, 'ws');

// Config loader uses:
fetch(origin + '/public/overlay-config')

// Main script uses:
fetch(window.__overlayOrigin + '/public/...')
const ws = new WebSocket(window.__overlayWs + '?overlay=1');
```

**Files (9 overlays + template):**
- `src/overlays/progress/index.html`
- `src/overlays/alerts/index.html`
- `src/overlays/roulette/index.html`
- `src/overlays/poll/index.html`
- `src/overlays/song/index.html`
- `src/overlays/song-queue/index.html`
- `src/overlays/milestone/index.html`
- `src/overlays/todos/index.html`
- `src/overlays/experiment/index.html`
- `src/overlays/_template/index.html` (code + documentation/comments — template has functional JS with hardcoded URLs that users copy)

Note: `reward-leaderboard` and `reward-rankchange` are already fixed (including their `localhost:4000` fallback values in the origin detection).

### 5. Server APIs: Dynamic URL Construction

**File:** `src/server/api/custom-overlays.ts`

Replace hardcoded URLs with dynamic construction:
```typescript
const baseUrl = `http://${req.headers.host}`;
// ...
url: `${baseUrl}/overlay/${e.name}/index.html`,
```

**File:** `src/server/api/auth.ts`

Build redirect URI dynamically using the PORT constant:
```typescript
import { PORT } from '../index';
const redirectUri = `http://localhost:${PORT}/auth/twitch/callback`;
```

**Important:** Twitch OAuth requires **exact** redirect URI matches registered in the Developer Console. The redirect URI is always built with `localhost` and the current port. Users must register `http://localhost:<port>/auth/twitch/callback` in their Twitch app settings. For the default port 4000, `http://localhost:4000/auth/twitch/callback` must be registered. If users change the port via `NST_PORT`, they must also update the redirect URI in the Twitch Developer Console.

### 6. Connection File

**File:** `src/server/connection-file.ts`

Already receives `port` as parameter — no change needed. The connection file at `~/.nst/connection.json` already contains the port dynamically.

## Files to Modify

| File | Change |
|------|--------|
| `src/server/index.ts` | Export PORT, add HOST, change listen(), update CORS, change return type |
| `src/main/main.ts` | Destructure server result, pass port in hash, set hotkey port, update CSP in webRequest to use dynamic port |
| `src/main/hotkeys.ts` | Add setHotkeyPort(), use module-level port in API calls |
| `src/renderer/src/hooks/useApi.ts` | Extract port from hash, dynamic API_BASE |
| `src/renderer/src/hooks/useWebSocket.ts` | Import getPort, dynamic WS URL |
| `src/renderer/src/panels/ProgressPanel.tsx` | Dynamic export URL |
| `src/renderer/src/panels/ClipsPanel.tsx` | Dynamic export URL |
| `src/renderer/src/panels/SettingsPanel.tsx` | Dynamic API URL in display text |
| `src/renderer/src/docs/help-en.ts` | No change — keep as documentation defaults |
| `src/renderer/src/docs/help-de.ts` | No change — keep as documentation defaults |
| `src/renderer/src/components/onboarding/TwitchStep.tsx` | Dynamic display URL |
| `src/server/api/auth.ts` | Dynamic redirect URI |
| `src/server/api/custom-overlays.ts` | Dynamic overlay URLs via req.headers.host |
| `src/overlays/progress/index.html` | window.location.origin |
| `src/overlays/alerts/index.html` | window.location.origin |
| `src/overlays/roulette/index.html` | window.location.origin |
| `src/overlays/poll/index.html` | window.location.origin |
| `src/overlays/song/index.html` | window.location.origin |
| `src/overlays/song-queue/index.html` | window.location.origin |
| `src/overlays/milestone/index.html` | window.location.origin |
| `src/overlays/todos/index.html` | window.location.origin |
| `src/overlays/experiment/index.html` | window.location.origin |
| `src/overlays/_template/index.html` | Update code + docs/comments |

## Out of Scope

- HTTPS support (not needed for local desktop app)
- Service discovery / mDNS for LAN (manual IP entry is fine)
- UI toggle for LAN mode in Settings panel (env variable is sufficient for now)
- Help docs (`help-en.ts`, `help-de.ts`) keep `localhost:4000` as static documentation defaults — not worth making dynamic for reference text
- Making Vite dev server port (5173) configurable — only affects development

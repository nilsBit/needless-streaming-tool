# Stream Deck Plugin — Store-Ready Design

**Goal:** Make the existing Stream Deck plugin publishable on the Elgato Marketplace. Users discover the plugin in the Store, install it, and are guided through setup via an onboarding wizard — no external help or stream explanation needed.

**Constraints:**
- Plugin requires the Stream Toolkit Electron app running locally
- Target audience: streamers who find the plugin in the Store or hear about it on stream
- App download via GitHub Releases link (no automatic download/installation)
- Separate public repo for the plugin (`nilsBit/thelab-streamdeck-plugin`)
- Elgato Developer Account registration required (manual, by user)

---

## 1. Auto-Discovery via Shared File

The Electron app writes a connection file on startup so the plugin can find it without manual configuration.

### File Location

| Platform | Path |
|----------|------|
| macOS | `~/.thelab/connection.json` |
| Windows | `%APPDATA%\.thelab\connection.json` |

Resolved via `path.join(os.homedir(), '.thelab', 'connection.json')` on macOS and `path.join(process.env.APPDATA || os.homedir(), '.thelab', 'connection.json')` on Windows.

### File Content

```json
{
  "version": 1,
  "token": "session-auth-token",
  "port": 4000,
  "pid": 12345
}
```

`version` field enables future schema changes without breaking older plugins.

### Electron App Behavior

- **On server start:** Create directory if needed, write `connection.json` with current session token, port, and `process.pid`.
- **On clean shutdown:** Delete the file.
- **On every start:** Overwrite — the file always reflects the current session.

### Plugin Behavior

- On plugin start and on reconnect: read `connection.json`.
- If file exists: use `token` and `port` to configure API/WebSocket connections.
- If file missing: fall back to Global Settings (manual config). If neither available, show onboarding wizard.
- Use `pid` field to check if the process is still alive before attempting connection (avoids stale file from crash).

### Stale File / PID Check

The Electron app deletes `connection.json` on clean shutdown, but crashes leave a stale file. The plugin handles this:

1. **PID liveness check:** `process.kill(pid, 0)` wrapped in try/catch — works cross-platform in Node.js. Returns without error if process exists, throws if not.
2. **If PID is dead:** Delete the stale file, treat as "file missing" (fall through to Global Settings or onboarding wizard).
3. **PID recycling:** Low risk — even if a different process now owns that PID, the subsequent HTTP health check or WebSocket handshake will fail with auth error, triggering reconnect/onboarding. No false-positive connection.

### Token Source Priority

When multiple sources exist, resolve in this order:

1. **Global Settings with non-localhost host** → user intentionally configured a remote machine, always respect this.
2. **`connection.json`** if file exists and PID is alive → auto-discovered local app.
3. **Global Settings with localhost** (or empty host) → manual local config, fallback.
4. **None available** → show onboarding wizard.

This ensures manual remote configuration is never silently overridden by a local connection file.

### Security Note

The `connection.json` contains the session auth token in plaintext. This is acceptable because:
- Token is session-scoped (regenerated on every app start).
- File is local-only, in the user's home directory.
- Same trust boundary as the app itself — if an attacker has filesystem access, the token is the least of the problems.

The app's OAuth tokens remain in Electron `safeStorage` and are not written to this file.

### Changes Required

**Electron app** (`src/main/main.ts` or server startup in `src/server/index.ts`):
- Write `connection.json` after auth token generation and server listen.
- Delete on `app.on('will-quit')` / `process.on('SIGTERM')`.
- Create `~/.thelab/` directory if it doesn't exist.

**Plugin** (`src/api.ts`):
- Add `readConnectionFile()` function using Node.js `fs` (available in Stream Deck Node.js runtime).
- Call on startup before `streamDeck.connect()`.
- Prefer connection file over Global Settings when both exist.

---

## 2. Connection Manager

Replace the per-action `let connected = false` pattern with a shared `ConnectionManager` module.

### Responsibilities

- Maintain single WebSocket connection to the app.
- Track connection state: `disconnected` | `connecting` | `connected`.
- Emit state-change events that actions subscribe to.
- Auto-reconnect with exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s. Reset to 1s on successful connection.
- On reconnect: re-read `connection.json` (token may have changed after app restart).
- Provide `isConnected()` check for actions.

### Interface

```typescript
type ConnectionState = 'disconnected' | 'connecting' | 'connected';

interface ConnectionManager {
  readonly state: ConnectionState;
  isConnected(): boolean;
  on(event: 'stateChange', cb: (state: ConnectionState) => void): void;
  on(event: 'message', cb: (type: string, data: unknown) => void): void;
  start(): void;
  stop(): void;
}
```

### Action Integration

Each action subscribes to `stateChange` events to update button titles:
- `connected`: show normal title (e.g., clip count, scene name)
- `disconnected` / `connecting`: show `Offline` on button title

On `keyDown` when disconnected: call `ev.action.showAlert()` instead of making API calls.

### WebSocket Authentication

The current plugin connects via `?overlay=1` (unauthenticated overlay client). With auto-discovery providing a token, the ConnectionManager should connect as an authenticated client using `?token={apiToken}` instead. This is more secure and consistent with the HTTP API auth.

### Lifecycle

`ConnectionManager.start()` must be called after `streamDeck.connect()` resolves. Actions may receive `onWillAppear` events immediately after connect — they should handle the case where ConnectionManager is not yet connected (show `Offline` initially).

### Files

- New: `src/connection.ts` — ConnectionManager implementation
- Removed: `src/ws.ts` — replaced entirely by ConnectionManager
- Modified: `src/api.ts` — get token/port from ConnectionManager's current config
- Modified: all 8 action files — remove local `connected` state, subscribe to ConnectionManager

---

## 3. Onboarding Wizard in Property Inspector

When the plugin has no connection (no `connection.json`, no Global Settings), the Property Inspector shows a guided setup instead of the normal action settings.

### Flow

```
┌─────────────────────────────────────────┐
│  Step 1: "App Required"                 │
│                                         │
│  The Lab Toolkit app is needed.         │
│  [Download for macOS]  [Download for    │
│                         Windows]        │
│  Links → GitHub Releases latest         │
│                                         │
│  Already have the app? [Start it →]     │
└─────────────────┬───────────────────────┘
                  │ (user clicks "I've started it"
                  │  or plugin detects connection)
┌─────────────────▼───────────────────────┐
│  Step 2: "Waiting for connection..."    │
│                                         │
│  ◌ Looking for The Lab Toolkit...       │
│  Plugin polls connection.json every 2s  │
│                                         │
│  [Advanced: Manual Setup]               │
└─────────────────┬───────────────────────┘
                  │ (connection.json found)
┌─────────────────▼───────────────────────┐
│  Step 3: "Connected!"                   │
│                                         │
│  ✓ Connected to The Lab Toolkit         │
│  Port: 4000                             │
│                                         │
│  (normal PI settings appear below)      │
└─────────────────────────────────────────┘
```

### Skip Logic

- If `connection.json` exists on PI open → skip straight to Step 3 / normal settings.
- If Global Settings already have a valid token → skip wizard entirely.

### Advanced / Manual Setup

Collapsed section in Step 2 that shows the current Host/Port/Token fields — same as current `global-settings.html`. For users who run the app on a different machine or non-standard port.

### PI ↔ Plugin Communication

The PI runs in a Chromium browser context and **cannot access the filesystem**. All `connection.json` reads are performed by the plugin Node.js process and communicated to the PI via message passing.

**Message flow:**

1. PI opens → sends `{ type: "checkConnection" }` via `sendToPlugin`.
2. Plugin reads `connection.json`, checks PID, responds via `sendToPropertyInspector`:
   - `{ type: "connectionStatus", connected: true, port: 4000 }` → PI shows Step 3 / normal settings.
   - `{ type: "connectionStatus", connected: false }` → PI shows wizard Step 1.
3. During wizard Step 2: PI sends `{ type: "checkConnection" }` every 2 seconds. Plugin re-reads file and responds.
4. When plugin detects connection: sends `{ type: "connectionStatus", connected: true }` → PI transitions to Step 3.

The current `pi.html` uses raw WebSocket communication via `connectElgatoStreamDeckSocket`. The `sendToPlugin` / `sendToPropertyInspector` messages are sent through this same WebSocket using the standard Stream Deck message protocol (`{ event: "sendToPlugin", payload: ... }`). No SDK migration needed — just add message handlers to the existing PI code.

### Implementation

- Modify `ui/pi.html` to include wizard HTML (hidden by default) and message handlers for `connectionStatus`.
- Modify plugin: add `onSendToPlugin` handler that reads `connection.json` and responds.
- Remove or consolidate `ui/global-settings.html` — its fields move into the wizard's "Advanced" section within `pi.html`.

---

## 4. Button Connection Feedback

Every action button reflects whether the app is reachable.

| State | Title | Behavior on Press |
|-------|-------|-------------------|
| Connected | Normal (e.g., `3 Clips`, scene name) | Normal action |
| Disconnected | `Offline` | `showAlert()` |
| Reconnecting | `Offline` | `showAlert()` |

This replaces the current behavior where buttons show stale data or silently fail when the app isn't running.

---

## 5. Manifest & Store Requirements

### manifest.json Additions

```json
{
  "URL": "https://github.com/nilsBit/thelab-streamdeck-plugin",
  "Category": "The Lab",
  "CategoryIcon": "imgs/plugin-icon"
}
```

`Category` and `CategoryIcon` already exist. `URL` needs to be added — required for Store listing.

### Icon Requirements

Elgato Store requires:
- Plugin icon: 288x288 (current `plugin-icon@2x.png` — verify dimensions)
- Action icons: 40x40 and 80x80 (@2x) — already present
- Store listing image: 1024x500 recommended (created manually before submission, out of scope for this plan)

### Store Listing Content (prepared, not submitted)

- **Name:** The Lab Toolkit
- **Description:** Stream toolkit for game dev streaming — control scenes, clips, bugs, experiments, todos, milestones and more from your Stream Deck. Requires The Lab Toolkit companion app.
- **Category:** Custom (or Streaming if available)
- **Support URL:** GitHub repo Issues tab

---

## 6. Separate Public Repo

### Structure: `nilsBit/thelab-streamdeck-plugin`

```
thelab-streamdeck-plugin/
  README.md              — what it is, screenshots, requirements, install guide
  LICENSE                — MIT or similar
  package.json           — copied/adapted from streamdeck-plugin/
  tsconfig.json
  build.mjs
  .gitignore
  src/                   — plugin TypeScript source
    plugin.ts
    api.ts
    connection.ts        — new ConnectionManager
    actions/
      scene.ts, clip.ts, bug.ts, experiment.ts,
      todo.ts, milestone.ts, compile-pray.ts, roulette.ts
  com.thelab.toolkit.sdPlugin/
    manifest.json
    package.json
    ui/
    imgs/
```

### Build & Release

- `npm run build` → bundles to `com.thelab.toolkit.sdPlugin/bin/plugin.js`
- `npm run package` → creates `.streamDeckPlugin` ZIP
- GitHub Actions CI: on tag push, build + attach `.streamDeckPlugin` to GitHub Release

### Sync Strategy

During development, the plugin code lives in the main `stream-toolkit` repo under `streamdeck-plugin/`. When ready for Store submission:
1. Copy plugin source to the public repo.
2. Make store-specific changes (manifest URL, etc.) in the public repo.
3. Going forward: develop in main repo, sync to public repo for releases.

---

## 7. Changes to Electron App

Summary of all changes needed in the main `stream-toolkit` repo:

| File | Change |
|------|--------|
| `src/server/index.ts` (or `src/main/main.ts`) | Write `connection.json` on server start |
| `src/main/main.ts` | Delete `connection.json` on app quit |
| New utility | `writeConnectionFile()` / `deleteConnectionFile()` helper |

These changes are small and independent of the plugin store work.

---

## Out of Scope

- Automatic app download/installation from within the plugin (security concern for Store review)
- Custom domain / landing page
- Plugin auto-update (handled by the Store)
- Elgato Developer Account registration (manual step by user)
- Store listing images/screenshots (created manually before submission)

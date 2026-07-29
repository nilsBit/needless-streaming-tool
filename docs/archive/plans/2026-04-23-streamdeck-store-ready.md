# Stream Deck Plugin Store-Ready Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Stream Deck plugin publishable on the Elgato Marketplace with auto-discovery, onboarding wizard, connection feedback, and store-compliant manifest.

**Architecture:** Electron app writes `~/.thelab/connection.json` with fixed API token + port. Plugin reads this file via new `ConnectionManager` (replaces per-action `let connected` pattern and `ws.ts`). PI shows onboarding wizard when no connection is available, normal settings when connected. All communication PI↔plugin via `sendToPlugin`/`sendToPropertyInspector` messages.

**Tech Stack:** Existing — TypeScript, `@elgato/streamdeck` SDK, esbuild, Node.js 20. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-04-23-streamdeck-store-ready-design.md`

**Important:** There are no automated tests in this project. Verification is via `npm run typecheck` (in both root and `streamdeck-plugin/`) and `npm run lint`. Manual QA on Stream Deck hardware follows as a separate step.

---

## File Structure

**Created:**

```
streamdeck-plugin/src/connection.ts          — ConnectionManager: WS, auto-reconnect, connection file reading, state events
src/server/connection-file.ts                — writeConnectionFile() / deleteConnectionFile() helpers
```

**Modified:**

```
src/server/index.ts                          — call writeConnectionFile() after server.listen, deleteConnectionFile() in shutdown
src/main/main.ts                             — call deleteConnectionFile() on before-quit
streamdeck-plugin/src/api.ts                 — add readConnectionFile(), config from ConnectionManager, remove getWsUrl()
streamdeck-plugin/src/plugin.ts              — use ConnectionManager instead of ws.ts
streamdeck-plugin/src/actions/scene.ts       — use ConnectionManager
streamdeck-plugin/src/actions/clip.ts        — use ConnectionManager
streamdeck-plugin/src/actions/bug.ts         — use ConnectionManager
streamdeck-plugin/src/actions/experiment.ts  — use ConnectionManager
streamdeck-plugin/src/actions/todo.ts        — use ConnectionManager
streamdeck-plugin/src/actions/milestone.ts   — use ConnectionManager
streamdeck-plugin/src/actions/compile-pray.ts — use ConnectionManager
streamdeck-plugin/src/actions/roulette.ts    — use ConnectionManager
streamdeck-plugin/com.thelab.toolkit.sdPlugin/ui/pi.html         — onboarding wizard + sendToPlugin messaging
streamdeck-plugin/com.thelab.toolkit.sdPlugin/manifest.json      — add URL field
```

**Deleted:**

```
streamdeck-plugin/src/ws.ts                                      — replaced by connection.ts
streamdeck-plugin/com.thelab.toolkit.sdPlugin/ui/global-settings.html — consolidated into pi.html advanced section
```

---

### Task 1: Electron app — write and delete connection file

**Files:**
- Create: `src/server/connection-file.ts`
- Modify: `src/server/index.ts:166-194`
- Modify: `src/main/main.ts:58-67`

This task adds the shared file that the plugin reads for auto-discovery. The Electron app writes `~/.thelab/connection.json` after the server starts and deletes it on shutdown.

- [ ] **Step 1: Create `src/server/connection-file.ts`**

```typescript
import fs from 'fs';
import path from 'path';
import os from 'os';
import { getFixedToken } from './auth-token';

const DIR = path.join(
  process.platform === 'win32'
    ? (process.env.APPDATA || os.homedir())
    : os.homedir(),
  '.thelab'
);
const FILE = path.join(DIR, 'connection.json');

export function writeConnectionFile(port: number): void {
  try {
    // Use the fixed token (persisted in DB, stable across restarts) — not the session token
    const token = getFixedToken();
    if (!token) {
      console.warn('[Connection] No fixed token available, skipping connection file');
      return;
    }
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify({
      version: 1,
      token,
      port,
      pid: process.pid,
    }, null, 2));
    console.log(`[Connection] Wrote ${FILE}`);
  } catch (err) {
    console.error('[Connection] Failed to write connection file:', err);
  }
}

export function deleteConnectionFile(): void {
  try {
    if (fs.existsSync(FILE)) {
      fs.unlinkSync(FILE);
      console.log(`[Connection] Deleted ${FILE}`);
    }
  } catch {
    /* best-effort cleanup */
  }
}
```

- [ ] **Step 2: Modify `src/server/index.ts` — write file after server.listen**

In `src/server/index.ts`, inside the `server.listen` callback (line 181), after `console.log`, add:

```typescript
import { writeConnectionFile, deleteConnectionFile } from './connection-file';
```

Add to the top imports. Then inside `server.listen` callback, after line 182 (`console.log`):

```typescript
      // Write connection file for Stream Deck plugin auto-discovery
      writeConnectionFile(PORT);
```

And in the `shutdown` function (line 167), before `server.close`:

```typescript
    deleteConnectionFile();
```

- [ ] **Step 3: Modify `src/main/main.ts` — delete on before-quit**

Add import at the top:

```typescript
import { deleteConnectionFile } from '../server/connection-file';
```

Add to the `before-quit` handler (line 64):

```typescript
app.on('before-quit', () => {
  isQuitting = true;
  unregisterHotkeys();
  deleteConnectionFile();
});
```

- [ ] **Step 4: Verify typecheck passes**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/server/connection-file.ts src/server/index.ts src/main/main.ts
git commit -m "feat(streamdeck): write connection.json for plugin auto-discovery"
```

---

### Task 2: Plugin — create ConnectionManager

**Files:**
- Create: `streamdeck-plugin/src/connection.ts`
- Delete: `streamdeck-plugin/src/ws.ts`

This replaces the current `ws.ts` with a centralized ConnectionManager that handles WebSocket connection, auto-reconnect with exponential backoff, connection file reading, and state events for all actions.

- [ ] **Step 1: Create `streamdeck-plugin/src/connection.ts`**

```typescript
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import os from 'os';
import WebSocket from 'ws';
import { getSettings, updateSettings } from './api.js';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected';

interface ConnectionFile {
  version?: number;
  token: string;
  port: number;
  pid: number;
}

const CONNECTION_FILE = path.join(
  process.platform === 'win32'
    ? (process.env.APPDATA || os.homedir())
    : os.homedir(),
  '.thelab',
  'connection.json'
);

const BACKOFF_INITIAL = 1000;
const BACKOFF_MAX = 30000;

class ConnectionManagerImpl extends EventEmitter {
  private _state: ConnectionState = 'disconnected';
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private backoff = BACKOFF_INITIAL;
  private stopped = true;

  get state(): ConnectionState {
    return this._state;
  }

  isConnected(): boolean {
    return this._state === 'connected';
  }

  start(): void {
    this.stopped = false;
    this.tryConnect();
  }

  stop(): void {
    this.stopped = true;
    this.clearReconnect();
    this.closeWs();
    this.setState('disconnected');
  }

  /** Read connection file and update settings if valid. Returns true if file was usable. */
  readConnectionFile(): boolean {
    try {
      if (!fs.existsSync(CONNECTION_FILE)) return false;
      const raw = fs.readFileSync(CONNECTION_FILE, 'utf-8');
      const data: ConnectionFile = JSON.parse(raw);
      if (!data.token || !data.port) return false;

      // PID liveness check — process.kill(pid, 0) throws if process doesn't exist
      try {
        process.kill(data.pid, 0);
      } catch (err: unknown) {
        // EPERM means process exists but we lack permission — treat as alive
        if ((err as NodeJS.ErrnoException).code === 'EPERM') {
          // Process exists, continue
        } else {
          // ESRCH or other — stale file, clean up
          try { fs.unlinkSync(CONNECTION_FILE); } catch { /* best-effort */ }
          return false;
        }
      }

      // Check priority: if Global Settings have a non-localhost host, the user
      // intentionally configured a remote machine — don't override
      const current = getSettings();
      if (current.host && current.host !== 'localhost' && current.host !== '127.0.0.1' && current.apiToken) {
        return false;
      }

      updateSettings({
        host: 'localhost',
        port: data.port,
        apiToken: data.token,
      });
      return true;
    } catch {
      return false;
    }
  }

  /** Called by PI via sendToPlugin to check connection status */
  getConnectionInfo(): { connected: boolean; port?: number } {
    if (this._state === 'connected') {
      return { connected: true, port: getSettings().port };
    }
    // Try reading connection file for the PI
    const hasFile = this.readConnectionFile();
    return { connected: false, port: hasFile ? getSettings().port : undefined };
  }

  private tryConnect(): void {
    if (this.stopped) return;

    // Re-read connection file on every connect attempt (token may have changed)
    this.readConnectionFile();

    const settings = getSettings();
    if (!settings.apiToken) {
      this.scheduleReconnect();
      return;
    }

    this.setState('connecting');
    this.closeWs();

    const url = `ws://${settings.host || 'localhost'}:${settings.port || 4000}?token=${settings.apiToken}`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.on('open', () => {
      this.backoff = BACKOFF_INITIAL;
      this.setState('connected');
    });

    ws.on('close', () => {
      this.setState('disconnected');
      this.scheduleReconnect();
    });

    ws.on('error', () => {
      try { ws.close(); } catch { /* ignore */ }
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as { event?: string; data?: unknown };
        if (typeof msg.event === 'string') {
          this.emit('message', msg.event, msg.data);
        }
      } catch { /* ignore non-JSON */ }
    });
  }

  private setState(state: ConnectionState): void {
    if (this._state === state) return;
    this._state = state;
    this.emit('stateChange', state);
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.tryConnect();
    }, this.backoff);
    this.backoff = Math.min(this.backoff * 2, BACKOFF_MAX);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private closeWs(): void {
    try {
      this.ws?.removeAllListeners();
      this.ws?.close();
    } catch { /* ignore */ }
    this.ws = null;
  }
}

export const connectionManager = new ConnectionManagerImpl();
```

- [ ] **Step 2: Commit**

Note: `ws.ts` is not deleted yet — it will be removed in Task 5 after all actions are migrated, to avoid broken intermediate commits.

```bash
git add streamdeck-plugin/src/connection.ts
git commit -m "feat(streamdeck): add ConnectionManager module"
```

---

### Task 3: Plugin — update api.ts

**Files:**
- Modify: `streamdeck-plugin/src/api.ts`

Remove the `getWsUrl()` function (ConnectionManager handles WS URL construction now). Keep everything else — `getSettings()`, `updateSettings()`, `request()`, `apiGet/Post/Patch` are still used by actions.

- [ ] **Step 1: Remove `getWsUrl` from `streamdeck-plugin/src/api.ts`**

Delete lines 24-27 (the `getWsUrl` function). The rest of the file stays unchanged.

The file should look like:

```typescript
export interface Settings {
  host: string;
  port: number;
  apiToken: string;
}

export const DEFAULT_SETTINGS: Settings = { host: 'localhost', port: 4000, apiToken: '' };

let currentSettings: Settings = { ...DEFAULT_SETTINGS };

export function getSettings(): Readonly<Settings> {
  return currentSettings;
}

export function updateSettings(partial: Partial<Settings>): void {
  currentSettings = { ...currentSettings, ...partial };
}

export function getBaseUrl(): string {
  const { host, port } = currentSettings;
  return `http://${host || 'localhost'}:${port || 4000}`;
}

export async function request<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const url = `${getBaseUrl()}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${currentSettings.apiToken}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export const apiGet = <T = unknown>(path: string): Promise<T> => request<T>('GET', path);
export const apiPost = <T = unknown>(path: string, body?: unknown): Promise<T> => request<T>('POST', path, body);
export const apiPatch = <T = unknown>(path: string, body?: unknown): Promise<T> => request<T>('PATCH', path, body);
```

- [ ] **Step 2: Commit**

```bash
git add streamdeck-plugin/src/api.ts
git commit -m "refactor(streamdeck): remove getWsUrl from api.ts"
```

---

### Task 4: Plugin — update plugin.ts entry point

**Files:**
- Modify: `streamdeck-plugin/src/plugin.ts`

Replace the `ws.ts` imports and global-settings listener with ConnectionManager. The `sendToPlugin` handler is added here to support PI↔plugin communication for the onboarding wizard.

- [ ] **Step 1: Rewrite `streamdeck-plugin/src/plugin.ts`**

```typescript
import streamDeck, { LogLevel } from '@elgato/streamdeck';
import { updateSettings, type Settings } from './api.js';
import { connectionManager } from './connection.js';

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

// When user changes global settings manually (from PI advanced section)
streamDeck.settings.onDidReceiveGlobalSettings<Partial<Settings>>((ev) => {
  updateSettings(ev.settings);
  // Restart connection with new settings
  connectionManager.stop();
  connectionManager.start();
});

// Handle PI messages for onboarding wizard
streamDeck.ui.onSendToPlugin((ev) => {
  const payload = ev.payload as { type?: string } | undefined;
  if (payload?.type === 'checkConnection') {
    const info = connectionManager.getConnectionInfo();
    ev.action.sendToPropertyInspector({
      type: 'connectionStatus',
      connected: info.connected,
      port: info.port,
    });
  }
});

(async () => {
  // Try reading connection file before connecting
  connectionManager.readConnectionFile();

  // Also try loading persisted global settings
  try {
    const initial = await streamDeck.settings.getGlobalSettings<Partial<Settings>>();
    // Only apply global settings if they have a token and connection file didn't already set one
    if (initial.apiToken) {
      updateSettings(initial);
    }
  } catch {
    /* first-run: no settings yet, defaults are fine */
  }

  await streamDeck.connect();

  // Start ConnectionManager AFTER streamDeck.connect() resolves
  connectionManager.start();
})();
```

- [ ] **Step 2: Verify plugin typecheck (will still fail — actions still import ws.ts)**

Run: `cd streamdeck-plugin && npx tsc --noEmit`
Expected: Errors only from action files importing `./ws.js`

- [ ] **Step 3: Commit**

```bash
git add streamdeck-plugin/src/plugin.ts
git commit -m "refactor(streamdeck): use ConnectionManager in plugin entry"
```

---

### Task 5: Plugin — refactor all 8 actions to use ConnectionManager

**Files:**
- Modify: `streamdeck-plugin/src/actions/scene.ts`
- Modify: `streamdeck-plugin/src/actions/clip.ts`
- Modify: `streamdeck-plugin/src/actions/bug.ts`
- Modify: `streamdeck-plugin/src/actions/experiment.ts`
- Modify: `streamdeck-plugin/src/actions/todo.ts`
- Modify: `streamdeck-plugin/src/actions/milestone.ts`
- Modify: `streamdeck-plugin/src/actions/compile-pray.ts`
- Modify: `streamdeck-plugin/src/actions/roulette.ts`

All 8 actions follow the same pattern. The changes per action are:
1. Replace `import { onEvent } from '../ws.js'` with `import { connectionManager } from '../connection.js'`
2. Remove the module-level `let connected = false`
3. Replace `onEvent(...)` in constructor with `connectionManager.on('stateChange', ...)` and `connectionManager.on('message', ...)`
4. Replace `connected` checks with `connectionManager.isConnected()`
5. Add `showAlert()` guard in `onKeyDown` when disconnected

Each action is shown in full below.

- [ ] **Step 1: Rewrite `streamdeck-plugin/src/actions/scene.ts`**

```typescript
import { action, KeyDownEvent, SingletonAction, WillAppearEvent } from '@elgato/streamdeck';
import type { JsonObject } from '@elgato/streamdeck';
import { apiPost } from '../api.js';
import { connectionManager } from '../connection.js';

interface SceneSettings extends JsonObject {
  sceneName?: string;
}

let currentScene: string | null = null;

@action({ UUID: 'com.thelab.toolkit.scene' })
export class SceneAction extends SingletonAction<SceneSettings> {
  constructor() {
    super();
    connectionManager.on('stateChange', () => this.updateAll());
    connectionManager.on('message', (event: string, data: unknown) => {
      if (event === 'obs-scene-changed') {
        const payload = data as { scene?: string } | undefined;
        if (payload?.scene) {
          currentScene = payload.scene;
          this.updateAll();
        }
      }
    });
  }

  override async onWillAppear(_ev: WillAppearEvent<SceneSettings>): Promise<void> {
    this.updateAll();
  }

  override async onKeyDown(ev: KeyDownEvent<SceneSettings>): Promise<void> {
    if (!connectionManager.isConnected()) {
      await ev.action.showAlert();
      return;
    }
    const scene = ev.payload.settings.sceneName?.trim();
    if (!scene) {
      await ev.action.showAlert();
      return;
    }
    try {
      await apiPost('/api/obs/scene', { scene });
      await ev.action.showOk();
    } catch {
      await ev.action.showAlert();
    }
  }

  private updateAll(): void {
    const title = !connectionManager.isConnected() ? 'OFFLINE' : (currentScene ?? 'Scene');
    for (const a of this.actions) {
      a.setTitle(title).catch(() => { /* ignore */ });
    }
  }
}
```

- [ ] **Step 2: Rewrite `streamdeck-plugin/src/actions/clip.ts`**

```typescript
import { action, KeyDownEvent, SingletonAction, WillAppearEvent } from '@elgato/streamdeck';
import type { JsonObject } from '@elgato/streamdeck';
import { apiGet, apiPost } from '../api.js';
import { connectionManager } from '../connection.js';

interface ClipSettings extends JsonObject {
  tag?: string;
}

interface ClipRow {
  session_date?: string;
}

let clipCount = 0;

function today(): string {
  return new Date().toISOString().split('T')[0];
}

async function fetchCount(): Promise<void> {
  try {
    const clips = await apiGet<ClipRow[]>('/api/clips');
    const d = today();
    clipCount = Array.isArray(clips) ? clips.filter((c) => c.session_date === d).length : 0;
  } catch { /* leave as-is */ }
}

@action({ UUID: 'com.thelab.toolkit.clip' })
export class ClipAction extends SingletonAction<ClipSettings> {
  constructor() {
    super();
    connectionManager.on('stateChange', async (state: string) => {
      if (state === 'connected') await fetchCount();
      this.updateAll();
    });
    connectionManager.on('message', (event: string) => {
      if (event === 'clip-created') {
        clipCount += 1;
        this.updateAll();
      }
    });
  }

  override async onWillAppear(_ev: WillAppearEvent<ClipSettings>): Promise<void> {
    this.updateAll();
  }

  override async onKeyDown(ev: KeyDownEvent<ClipSettings>): Promise<void> {
    if (!connectionManager.isConnected()) {
      await ev.action.showAlert();
      return;
    }
    const tag = ev.payload.settings.tag?.trim() || 'highlight';
    try {
      await apiPost('/api/clips', { tag });
      await ev.action.showOk();
    } catch {
      await ev.action.showAlert();
    }
  }

  private updateAll(): void {
    const title = !connectionManager.isConnected() ? 'OFFLINE' : `${clipCount} Clips`;
    for (const a of this.actions) {
      a.setTitle(title).catch(() => { /* ignore */ });
    }
  }
}
```

- [ ] **Step 3: Rewrite `streamdeck-plugin/src/actions/bug.ts`**

```typescript
import { action, KeyDownEvent, SingletonAction, WillAppearEvent } from '@elgato/streamdeck';
import type { JsonObject } from '@elgato/streamdeck';
import { apiGet, apiPost } from '../api.js';
import { connectionManager } from '../connection.js';

interface BugSettings extends JsonObject {
  bugTitle?: string;
}

interface IssueRow {
  status?: string;
}

let openCount = 0;

async function fetchCount(): Promise<void> {
  try {
    const issues = await apiGet<IssueRow[]>('/public/issues');
    openCount = Array.isArray(issues) ? issues.filter((b) => b.status === 'open').length : 0;
  } catch { /* leave as-is */ }
}

@action({ UUID: 'com.thelab.toolkit.bug' })
export class BugAction extends SingletonAction<BugSettings> {
  constructor() {
    super();
    connectionManager.on('stateChange', async (state: string) => {
      if (state === 'connected') await fetchCount();
      this.updateAll();
    });
    connectionManager.on('message', async (event: string) => {
      if (event === 'issue-created' || event === 'issue-updated' || event === 'issue-deleted') {
        await fetchCount();
        this.updateAll();
      }
    });
  }

  override async onWillAppear(_ev: WillAppearEvent<BugSettings>): Promise<void> {
    this.updateAll();
  }

  override async onKeyDown(ev: KeyDownEvent<BugSettings>): Promise<void> {
    if (!connectionManager.isConnected()) {
      await ev.action.showAlert();
      return;
    }
    const title = ev.payload.settings.bugTitle?.trim() || 'Stream Bug';
    try {
      await apiPost('/api/issues', { title });
      await ev.action.showOk();
    } catch {
      await ev.action.showAlert();
    }
  }

  private updateAll(): void {
    const titleStr = !connectionManager.isConnected() ? 'OFFLINE' : `${openCount} Bugs`;
    for (const a of this.actions) {
      a.setTitle(titleStr).catch(() => { /* ignore */ });
    }
  }
}
```

- [ ] **Step 4: Rewrite `streamdeck-plugin/src/actions/experiment.ts`**

```typescript
import { action, KeyDownEvent, SingletonAction, WillAppearEvent } from '@elgato/streamdeck';
import type { JsonObject } from '@elgato/streamdeck';
import { apiGet, apiPatch } from '../api.js';
import { connectionManager } from '../connection.js';

interface ExperimentSettings extends JsonObject {
  action?: 'running' | 'success' | 'failed' | 'idle';
}

interface StreamState {
  challenge_status?: string;
  challenge_title?: string;
}

const STATUS_EMOJI: Record<string, string> = {
  idle: '⏸️',
  in_progress: '🔴',
  done: '🟢',
  failed: '❌',
};

const PI_TO_STATUS: Record<string, string> = {
  running: 'in_progress',
  success: 'done',
  failed: 'failed',
  idle: 'idle',
};

let challengeStatus = 'idle';
let challengeTitle = '';

async function fetchState(): Promise<void> {
  try {
    const s = await apiGet<StreamState>('/public/stream-state');
    challengeStatus = s?.challenge_status ?? 'idle';
    challengeTitle = s?.challenge_title ?? '';
  } catch { /* leave as-is */ }
}

@action({ UUID: 'com.thelab.toolkit.experiment' })
export class ExperimentAction extends SingletonAction<ExperimentSettings> {
  constructor() {
    super();
    connectionManager.on('stateChange', async (state: string) => {
      if (state === 'connected') await fetchState();
      this.updateAll();
    });
    connectionManager.on('message', (event: string, data: unknown) => {
      if (event === 'stream-state') {
        const s = data as StreamState | undefined;
        challengeStatus = s?.challenge_status ?? challengeStatus;
        challengeTitle = s?.challenge_title ?? challengeTitle;
        this.updateAll();
      }
    });
  }

  override async onWillAppear(_ev: WillAppearEvent<ExperimentSettings>): Promise<void> {
    this.updateAll();
  }

  override async onKeyDown(ev: KeyDownEvent<ExperimentSettings>): Promise<void> {
    if (!connectionManager.isConnected()) {
      await ev.action.showAlert();
      return;
    }
    const piValue = ev.payload.settings.action ?? 'running';
    const status = PI_TO_STATUS[piValue] ?? piValue;
    try {
      await apiPatch('/api/stream-state', { challenge_status: status });
      await ev.action.showOk();
    } catch {
      await ev.action.showAlert();
    }
  }

  private updateAll(): void {
    let display: string;
    if (!connectionManager.isConnected()) {
      display = 'OFFLINE';
    } else {
      const emoji = STATUS_EMOJI[challengeStatus] ?? '⏸️';
      display = challengeTitle ? `${emoji} ${challengeTitle.substring(0, 8)}` : `${emoji} Exp`;
    }
    for (const a of this.actions) {
      a.setTitle(display).catch(() => { /* ignore */ });
    }
  }
}
```

- [ ] **Step 5: Rewrite `streamdeck-plugin/src/actions/todo.ts`**

```typescript
import { action, KeyDownEvent, SingletonAction, WillAppearEvent } from '@elgato/streamdeck';
import type { JsonObject } from '@elgato/streamdeck';
import { apiGet, apiPatch } from '../api.js';
import { connectionManager } from '../connection.js';

interface TodoSettings extends JsonObject {
  todoId?: string;
}

interface ProgressTodo {
  id: number;
  done: number;
}

interface ProgressItem {
  todos?: ProgressTodo[];
}

interface ProgressResponse {
  items?: ProgressItem[];
}

let openCount = 0;

function flattenTodos(p: ProgressResponse): ProgressTodo[] {
  const out: ProgressTodo[] = [];
  for (const it of p?.items ?? []) {
    for (const t of it.todos ?? []) out.push(t);
  }
  return out;
}

async function fetchCount(): Promise<void> {
  try {
    const p = await apiGet<ProgressResponse>('/public/progress');
    openCount = flattenTodos(p).filter((t) => t.done === 0).length;
  } catch { /* leave as-is */ }
}

@action({ UUID: 'com.thelab.toolkit.todo' })
export class TodoAction extends SingletonAction<TodoSettings> {
  constructor() {
    super();
    connectionManager.on('stateChange', async (state: string) => {
      if (state === 'connected') await fetchCount();
      this.updateAll();
    });
    connectionManager.on('message', async (event: string) => {
      if (event === 'progress-update') {
        await fetchCount();
        this.updateAll();
      }
    });
  }

  override async onWillAppear(_ev: WillAppearEvent<TodoSettings>): Promise<void> {
    this.updateAll();
  }

  override async onKeyDown(ev: KeyDownEvent<TodoSettings>): Promise<void> {
    if (!connectionManager.isConnected()) {
      await ev.action.showAlert();
      return;
    }
    const todoId = ev.payload.settings.todoId?.trim() || 'next';
    try {
      let targetId: number | string;
      if (todoId === 'next') {
        const p = await apiGet<ProgressResponse>('/public/progress');
        const next = flattenTodos(p).find((t) => t.done === 0);
        if (!next) {
          await ev.action.showAlert();
          return;
        }
        targetId = next.id;
      } else {
        targetId = todoId;
      }
      await apiPatch(`/api/progress/todos/${targetId}`, { done: 1 });
      await ev.action.showOk();
    } catch {
      await ev.action.showAlert();
    }
  }

  private updateAll(): void {
    const titleStr = !connectionManager.isConnected() ? 'OFFLINE' : `${openCount} Todos`;
    for (const a of this.actions) {
      a.setTitle(titleStr).catch(() => { /* ignore */ });
    }
  }
}
```

- [ ] **Step 6: Rewrite `streamdeck-plugin/src/actions/milestone.ts`**

```typescript
import { action, KeyDownEvent, SingletonAction, WillAppearEvent } from '@elgato/streamdeck';
import type { JsonObject } from '@elgato/streamdeck';
import { apiGet, apiPatch } from '../api.js';
import { connectionManager } from '../connection.js';

interface MilestoneSettings extends JsonObject {
  milestoneId?: string;
}

interface MilestoneRow {
  id?: number;
  status?: string;
}

let pendingCount = 0;

async function fetchCount(): Promise<void> {
  try {
    const milestones = await apiGet<MilestoneRow[]>('/api/milestones');
    pendingCount = Array.isArray(milestones)
      ? milestones.filter((m) => m.status === 'pending').length
      : 0;
  } catch { /* leave as-is */ }
}

@action({ UUID: 'com.thelab.toolkit.milestone' })
export class MilestoneAction extends SingletonAction<MilestoneSettings> {
  constructor() {
    super();
    connectionManager.on('stateChange', async (state: string) => {
      if (state === 'connected') await fetchCount();
      this.updateAll();
    });
    connectionManager.on('message', async (event: string) => {
      if (
        event === 'milestone-trigger' ||
        event === 'milestone-created' ||
        event === 'milestone-updated' ||
        event === 'milestone-deleted'
      ) {
        await fetchCount();
        this.updateAll();
      }
    });
  }

  override async onWillAppear(_ev: WillAppearEvent<MilestoneSettings>): Promise<void> {
    this.updateAll();
  }

  override async onKeyDown(ev: KeyDownEvent<MilestoneSettings>): Promise<void> {
    if (!connectionManager.isConnected()) {
      await ev.action.showAlert();
      return;
    }
    const milestoneId = ev.payload.settings.milestoneId?.trim() || 'next';
    try {
      let targetId: number | string;
      if (milestoneId === 'next') {
        const milestones = await apiGet<MilestoneRow[]>('/api/milestones');
        const next = Array.isArray(milestones)
          ? milestones.find((m) => m.status === 'pending')
          : undefined;
        if (!next || next.id === undefined) {
          await ev.action.showAlert();
          return;
        }
        targetId = next.id;
      } else {
        targetId = milestoneId;
      }
      await apiPatch(`/api/milestones/${targetId}`, { status: 'completed' });
      await ev.action.showOk();
    } catch {
      await ev.action.showAlert();
    }
  }

  private updateAll(): void {
    const titleStr = !connectionManager.isConnected() ? 'OFFLINE' : `${pendingCount} MS`;
    for (const a of this.actions) {
      a.setTitle(titleStr).catch(() => { /* ignore */ });
    }
  }
}
```

- [ ] **Step 7: Rewrite `streamdeck-plugin/src/actions/compile-pray.ts`**

```typescript
import { action, KeyDownEvent, SingletonAction, WillAppearEvent } from '@elgato/streamdeck';
import type { JsonObject } from '@elgato/streamdeck';
import { apiPost } from '../api.js';
import { connectionManager } from '../connection.js';

interface CompilePraySettings extends JsonObject {}

@action({ UUID: 'com.thelab.toolkit.compile-pray' })
export class CompilePrayAction extends SingletonAction<CompilePraySettings> {
  constructor() {
    super();
    connectionManager.on('stateChange', () => this.updateAll());
    connectionManager.on('message', (event: string) => {
      if (event === 'compile-pray') {
        for (const a of this.actions) {
          a.setTitle('🙏').catch(() => { /* ignore */ });
          setTimeout(() => {
            a.setTitle(connectionManager.isConnected() ? 'Compile' : 'OFFLINE').catch(() => { /* ignore */ });
          }, 2000);
        }
      }
    });
  }

  override async onWillAppear(_ev: WillAppearEvent<CompilePraySettings>): Promise<void> {
    this.updateAll();
  }

  override async onKeyDown(ev: KeyDownEvent<CompilePraySettings>): Promise<void> {
    if (!connectionManager.isConnected()) {
      await ev.action.showAlert();
      return;
    }
    try {
      await apiPost('/api/actions/compile-pray', {});
      await ev.action.showOk();
    } catch {
      await ev.action.showAlert();
    }
  }

  private updateAll(): void {
    const titleStr = !connectionManager.isConnected() ? 'OFFLINE' : 'Compile';
    for (const a of this.actions) {
      a.setTitle(titleStr).catch(() => { /* ignore */ });
    }
  }
}
```

- [ ] **Step 8: Rewrite `streamdeck-plugin/src/actions/roulette.ts`**

```typescript
import { action, KeyDownEvent, SingletonAction, WillAppearEvent } from '@elgato/streamdeck';
import type { JsonObject } from '@elgato/streamdeck';
import { apiPost } from '../api.js';
import { connectionManager } from '../connection.js';

interface RouletteSettings extends JsonObject {}
interface RouletteResult {
  title?: string;
}

@action({ UUID: 'com.thelab.toolkit.roulette' })
export class RouletteAction extends SingletonAction<RouletteSettings> {
  constructor() {
    super();
    connectionManager.on('stateChange', () => this.updateAll());
    connectionManager.on('message', (event: string, data: unknown) => {
      if (event === 'roulette-spin') {
        for (const a of this.actions) {
          a.setTitle('🎰...').catch(() => { /* ignore */ });
        }
      } else if (event === 'roulette-result') {
        const result = (data as RouletteResult | undefined) ?? {};
        const text = (result.title ?? 'Done!').substring(0, 10);
        for (const a of this.actions) {
          a.setTitle(text).catch(() => { /* ignore */ });
          setTimeout(() => {
            a.setTitle(connectionManager.isConnected() ? 'Roulette' : 'OFFLINE').catch(() => { /* ignore */ });
          }, 3000);
        }
      }
    });
  }

  override async onWillAppear(_ev: WillAppearEvent<RouletteSettings>): Promise<void> {
    this.updateAll();
  }

  override async onKeyDown(ev: KeyDownEvent<RouletteSettings>): Promise<void> {
    if (!connectionManager.isConnected()) {
      await ev.action.showAlert();
      return;
    }
    try {
      await apiPost('/api/actions/roulette', {});
      await ev.action.showOk();
    } catch {
      await ev.action.showAlert();
    }
  }

  private updateAll(): void {
    const titleStr = !connectionManager.isConnected() ? 'OFFLINE' : 'Roulette';
    for (const a of this.actions) {
      a.setTitle(titleStr).catch(() => { /* ignore */ });
    }
  }
}
```

- [ ] **Step 9: Delete `streamdeck-plugin/src/ws.ts`**

All consumers are now migrated. Remove the old module:

```bash
rm streamdeck-plugin/src/ws.ts
```

- [ ] **Step 10: Verify plugin typecheck passes**

Run: `cd streamdeck-plugin && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 11: Commit**

```bash
git add streamdeck-plugin/src/actions/
git rm streamdeck-plugin/src/ws.ts
git commit -m "refactor(streamdeck): migrate all actions to ConnectionManager, remove ws.ts"
```

---

### Task 6: Plugin — onboarding wizard in PI

**Files:**
- Modify: `streamdeck-plugin/com.thelab.toolkit.sdPlugin/ui/pi.html`
- Delete: `streamdeck-plugin/com.thelab.toolkit.sdPlugin/ui/global-settings.html`

The PI gets a 3-step onboarding wizard that shows when no connection is available. When connected, it shows the normal action settings. The wizard communicates with the plugin via `sendToPlugin`/`sendToPropertyInspector` to check `connection.json` status (since the PI runs in a Chromium context without filesystem access).

The manual connection fields (token/host/port) from `global-settings.html` move into a collapsible "Advanced" section in the wizard.

- [ ] **Step 1: Rewrite `streamdeck-plugin/com.thelab.toolkit.sdPlugin/ui/pi.html`**

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>The Lab Toolkit</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #2d2d2d;
      color: #ccc;
      padding: 12px;
      font-size: 12px;
      margin: 0;
    }
    .section {
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid #444;
    }
    .section:last-child { border-bottom: none; }
    h3 {
      color: #e67e22;
      font-size: 12px;
      margin: 0 0 10px 0;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .field { margin-bottom: 10px; }
    .field label {
      display: block;
      margin-bottom: 3px;
      color: #999;
      font-size: 11px;
    }
    .field input, .field select {
      width: 100%;
      padding: 5px 8px;
      background: #1a1a1a;
      border: 1px solid #444;
      border-radius: 3px;
      color: #eee;
      font-size: 12px;
      box-sizing: border-box;
    }
    .field input:focus, .field select:focus {
      outline: none;
      border-color: #e67e22;
    }
    .row { display: flex; gap: 6px; }
    .row input { flex: 1; }
    .hint {
      color: #555;
      font-size: 10px;
      margin-top: 3px;
    }
    .status {
      padding: 6px 8px;
      border-radius: 3px;
      font-size: 11px;
      margin-top: 6px;
    }
    .status.ok { background: rgba(46,204,113,0.15); color: #2ecc71; }
    .status.err { background: rgba(231,76,60,0.15); color: #e74c3c; }
    .action-settings { display: none; }
    .hidden { display: none !important; }

    /* Wizard styles */
    .wizard-step { display: none; }
    .wizard-step.active { display: block; }
    .wizard-step h3 { font-size: 13px; margin-bottom: 12px; }
    .wizard-step p { margin: 8px 0; line-height: 1.5; }
    .wizard-btn {
      display: inline-block;
      padding: 8px 16px;
      background: #e67e22;
      color: #fff;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      text-decoration: none;
      margin: 4px 4px 4px 0;
    }
    .wizard-btn:hover { background: #d35400; }
    .wizard-btn.secondary {
      background: transparent;
      border: 1px solid #666;
      color: #ccc;
    }
    .wizard-btn.secondary:hover { border-color: #e67e22; color: #e67e22; }
    .spinner {
      display: inline-block;
      width: 14px;
      height: 14px;
      border: 2px solid #555;
      border-top-color: #e67e22;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      vertical-align: middle;
      margin-right: 6px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .connected-badge {
      color: #2ecc71;
      font-weight: bold;
    }
    details { margin-top: 12px; }
    details summary {
      cursor: pointer;
      color: #888;
      font-size: 11px;
    }
    details summary:hover { color: #e67e22; }
  </style>
</head>
<body>

  <!-- ===== ONBOARDING WIZARD ===== -->
  <div id="wizard">
    <!-- Step 1: App required -->
    <div class="wizard-step active" id="wizard-step1">
      <div class="section">
        <h3>The Lab Toolkit</h3>
        <p>This plugin requires the <strong>The Lab Toolkit</strong> companion app running on your computer.</p>
        <p>
          <a class="wizard-btn" href="https://github.com/nilsBit/stream-toolkit/releases/latest" target="_blank">Download for macOS</a>
          <a class="wizard-btn" href="https://github.com/nilsBit/stream-toolkit/releases/latest" target="_blank">Download for Windows</a>
        </p>
        <p style="margin-top: 12px;">
          <button class="wizard-btn secondary" onclick="wizardGoTo(2)">Already installed — connect now</button>
        </p>
      </div>
    </div>

    <!-- Step 2: Waiting for connection -->
    <div class="wizard-step" id="wizard-step2">
      <div class="section">
        <h3>Connecting...</h3>
        <p><span class="spinner"></span> Looking for The Lab Toolkit...</p>
        <p class="hint">Start the app if it's not running. The connection will be detected automatically.</p>

        <details>
          <summary>Advanced: Manual Setup</summary>
          <div style="margin-top: 8px;">
            <div class="field">
              <label>API Token</label>
              <input type="text" id="adv-apiToken" placeholder="From Toolkit: Settings → API Token" />
            </div>
            <div class="field">
              <label>Host / Port</label>
              <div class="row">
                <input type="text" id="adv-host" placeholder="localhost" />
                <input type="text" id="adv-port" placeholder="4000" style="max-width:70px;" />
              </div>
            </div>
            <button class="wizard-btn" onclick="saveManualSettings()">Connect</button>
            <div id="adv-statusMsg" class="status" style="display:none;"></div>
          </div>
        </details>
      </div>
    </div>

    <!-- Step 3: Connected -->
    <div class="wizard-step" id="wizard-step3">
      <div class="section">
        <h3>Connected</h3>
        <p><span class="connected-badge">&#10003; Connected to The Lab Toolkit</span></p>
        <p class="hint" id="connected-port"></p>
      </div>
    </div>
  </div>

  <!-- ===== NORMAL SETTINGS (shown after connection) ===== -->

  <!-- Action-specific settings (shown based on action UUID) -->
  <div class="section action-settings" id="settings-scene">
    <h3>Scene Switch</h3>
    <div class="field">
      <label>Scene Name</label>
      <input type="text" id="sceneName" placeholder="e.g. Gameplay" />
    </div>
  </div>

  <div class="section action-settings" id="settings-clip">
    <h3>Clip Marker</h3>
    <div class="field">
      <label>Clip Tag</label>
      <input type="text" id="tag" placeholder="highlight" />
    </div>
  </div>

  <div class="section action-settings" id="settings-bug">
    <h3>Bug Report</h3>
    <div class="field">
      <label>Bug Title</label>
      <input type="text" id="bugTitle" placeholder="Stream Bug" />
    </div>
  </div>

  <div class="section action-settings" id="settings-experiment">
    <h3>Experiment</h3>
    <div class="field">
      <label>Action</label>
      <select id="action">
        <option value="running">Start</option>
        <option value="success">Done</option>
        <option value="failed">Failed</option>
        <option value="idle">Reset</option>
      </select>
    </div>
  </div>

  <div class="section action-settings" id="settings-todo">
    <h3>Todo</h3>
    <div class="field">
      <label>Todo ID</label>
      <input type="text" id="todoId" placeholder="next (or ID)" />
      <div class="hint">"next" completes the next open todo</div>
    </div>
  </div>

  <div class="section action-settings" id="settings-milestone">
    <h3>Milestone</h3>
    <div class="field">
      <label>Milestone ID</label>
      <input type="text" id="milestoneId" placeholder="next (or ID)" />
      <div class="hint">"next" completes the next pending milestone</div>
    </div>
  </div>

  <script>
    var websocket = null;
    var uuid = null;
    var currentAction = null;
    var globalSettings = {};
    var actionSettings = {};
    var pollTimer = null;
    var isConnected = false;

    var ACTION_MAP = {
      'com.thelab.toolkit.scene': { section: 'settings-scene', fields: ['sceneName'] },
      'com.thelab.toolkit.clip': { section: 'settings-clip', fields: ['tag'] },
      'com.thelab.toolkit.bug': { section: 'settings-bug', fields: ['bugTitle'] },
      'com.thelab.toolkit.experiment': { section: 'settings-experiment', fields: ['action'] },
      'com.thelab.toolkit.todo': { section: 'settings-todo', fields: ['todoId'] },
      'com.thelab.toolkit.milestone': { section: 'settings-milestone', fields: ['milestoneId'] },
    };

    function connectElgatoStreamDeckSocket(inPort, inPropertyInspectorUUID, inRegisterEvent, inInfo, inActionInfo) {
      uuid = inPropertyInspectorUUID;
      var info = JSON.parse(inActionInfo);
      currentAction = info.action;
      actionSettings = info.payload?.settings || {};

      // Load action settings into fields
      var mapping = ACTION_MAP[currentAction];
      if (mapping) {
        mapping.fields.forEach(function(f) {
          var el = document.getElementById(f);
          if (el && actionSettings[f] !== undefined) el.value = actionSettings[f];
        });
      }

      websocket = new WebSocket('ws://127.0.0.1:' + inPort);

      websocket.onopen = function() {
        websocket.send(JSON.stringify({ event: inRegisterEvent, uuid: uuid }));
        websocket.send(JSON.stringify({ event: 'getGlobalSettings', context: uuid }));
        // Ask plugin to check connection file
        sendToPlugin({ type: 'checkConnection' });
      };

      websocket.onmessage = function(evt) {
        var msg = JSON.parse(evt.data);

        if (msg.event === 'didReceiveGlobalSettings') {
          globalSettings = msg.payload.settings || {};
          // Populate advanced fields
          document.getElementById('adv-apiToken').value = globalSettings.apiToken || '';
          document.getElementById('adv-host').value = globalSettings.host || 'localhost';
          document.getElementById('adv-port').value = globalSettings.port || '4000';

          // If we have a token in global settings, we might be connected
          if (globalSettings.apiToken) {
            sendToPlugin({ type: 'checkConnection' });
          }
        }

        if (msg.event === 'sendToPropertyInspector') {
          handlePluginMessage(msg.payload);
        }
      };
    }

    function sendToPlugin(payload) {
      if (!websocket || websocket.readyState !== 1) return;
      websocket.send(JSON.stringify({
        event: 'sendToPlugin',
        action: currentAction,
        context: uuid,
        payload: payload,
      }));
    }

    function handlePluginMessage(payload) {
      if (!payload || payload.type !== 'connectionStatus') return;

      if (payload.connected) {
        isConnected = true;
        stopPolling();
        showConnected(payload.port);
      } else {
        isConnected = false;
        // If we're on step 1 and user hasn't interacted, stay there
        // If we're already polling (step 2), keep polling
        if (!pollTimer) {
          // First check — show step 1 if no connection
          wizardGoTo(1);
        }
      }
    }

    function showActionSettings() {
      var mapping = ACTION_MAP[currentAction];
      if (mapping) {
        document.getElementById(mapping.section).style.display = 'block';
      }
    }

    function showConnected(port) {
      // Show step 3 briefly, then show action settings
      wizardGoTo(3);
      if (port) {
        document.getElementById('connected-port').textContent = 'Port: ' + port;
      }
      showActionSettings();
    }

    function wizardGoTo(step) {
      document.querySelectorAll('.wizard-step').forEach(function(el) {
        el.classList.remove('active');
      });
      var stepEl = document.getElementById('wizard-step' + step);
      if (stepEl) stepEl.classList.add('active');

      if (step === 2) {
        startPolling();
      } else {
        stopPolling();
      }
    }

    function startPolling() {
      if (pollTimer) return;
      pollTimer = setInterval(function() {
        sendToPlugin({ type: 'checkConnection' });
      }, 2000);
    }

    function stopPolling() {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    }

    function saveManualSettings() {
      if (!websocket) return;
      globalSettings = {
        apiToken: document.getElementById('adv-apiToken').value.trim(),
        host: document.getElementById('adv-host').value.trim() || 'localhost',
        port: parseInt(document.getElementById('adv-port').value) || 4000,
      };
      websocket.send(JSON.stringify({
        event: 'setGlobalSettings',
        context: uuid,
        payload: globalSettings,
      }));

      // Test connection
      var statusEl = document.getElementById('adv-statusMsg');
      fetch('http://' + globalSettings.host + ':' + globalSettings.port + '/api/health', {
        headers: { 'Authorization': 'Bearer ' + globalSettings.apiToken }
      })
        .then(function(r) { return r.json(); })
        .then(function() {
          statusEl.textContent = 'Connected!';
          statusEl.className = 'status ok';
          statusEl.style.display = 'block';
          // Delay checkConnection to allow onDidReceiveGlobalSettings to fire first
          setTimeout(function() {
            sendToPlugin({ type: 'checkConnection' });
          }, 500);
        })
        .catch(function() {
          statusEl.textContent = 'Connection failed. Check token and host/port.';
          statusEl.className = 'status err';
          statusEl.style.display = 'block';
        });
    }

    function saveActionSettings() {
      if (!websocket || !currentAction) return;
      var mapping = ACTION_MAP[currentAction];
      if (!mapping) return;

      var settings = {};
      mapping.fields.forEach(function(f) {
        var el = document.getElementById(f);
        if (el) settings[f] = el.value;
      });

      websocket.send(JSON.stringify({
        event: 'setSettings',
        context: uuid,
        payload: settings,
      }));
    }

    // Auto-save action settings on change
    var saveTimer = null;
    document.addEventListener('input', function(e) {
      var id = e.target.id;
      // Don't auto-save advanced settings (those use the Connect button)
      if (id === 'adv-apiToken' || id === 'adv-host' || id === 'adv-port') return;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(function() {
        saveActionSettings();
      }, 400);
    });

    document.addEventListener('change', function(e) {
      var id = e.target.id;
      if (id === 'adv-apiToken' || id === 'adv-host' || id === 'adv-port') return;
      saveActionSettings();
    });
  </script>
</body>
</html>
```

- [ ] **Step 2: Delete `streamdeck-plugin/com.thelab.toolkit.sdPlugin/ui/global-settings.html`**

```bash
rm streamdeck-plugin/com.thelab.toolkit.sdPlugin/ui/global-settings.html
```

- [ ] **Step 3: Commit**

```bash
git add streamdeck-plugin/com.thelab.toolkit.sdPlugin/ui/pi.html
git rm streamdeck-plugin/com.thelab.toolkit.sdPlugin/ui/global-settings.html
git commit -m "feat(streamdeck): add onboarding wizard to PI, remove global-settings.html"
```

---

### Task 7: Plugin — update manifest.json for Store

**Files:**
- Modify: `streamdeck-plugin/com.thelab.toolkit.sdPlugin/manifest.json`

Add the `URL` field required for Store listing.

- [ ] **Step 1: Add URL to manifest.json**

Add after the `"Author"` line:

```json
"URL": "https://github.com/nilsBit/thelab-streamdeck-plugin",
```

- [ ] **Step 2: Commit**

```bash
git add streamdeck-plugin/com.thelab.toolkit.sdPlugin/manifest.json
git commit -m "feat(streamdeck): add URL to manifest for Store listing"
```

---

### Task 8: Verify full build pipeline

**Files:** None (verification only)

- [ ] **Step 1: Run root typecheck**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 2: Run root lint**

Run: `npm run lint`
Expected: No errors (or only pre-existing warnings)

- [ ] **Step 3: Run plugin typecheck**

Run: `cd streamdeck-plugin && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Run plugin build**

Run: `cd streamdeck-plugin && npm run build`
Expected: `[plugin] bundled → bin/plugin.js`

- [ ] **Step 5: Run plugin package**

Run: `cd streamdeck-plugin && npm run package`
Expected: `[plugin] packaged → ../assets/com.thelab.toolkit.streamDeckPlugin`

- [ ] **Step 6: Commit any fixes if needed**

If typecheck/lint revealed issues, fix and commit them. If all passes clean, no commit needed.

---

### Task 9: Update state document

**Files:**
- Modify: `docs/superpowers/state/streamdeck-plugin-rebuild-state.md`

- [ ] **Step 1: Update the state document to reflect store-ready changes**

Add a new section to the state doc documenting:
- Tasks completed in this plan
- What remains for Store submission (manual: Elgato Developer Account, store listing image, QA on hardware)
- New file: `src/server/connection-file.ts`
- New file: `streamdeck-plugin/src/connection.ts` (replaces `ws.ts`)
- Onboarding wizard in `pi.html`
- `global-settings.html` removed

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/state/streamdeck-plugin-rebuild-state.md
git commit -m "docs: update state doc for store-ready changes"
```

---

## Deferred (not in this plan)

- **Separate public repo** (`nilsBit/thelab-streamdeck-plugin`) — spec Section 6. Created manually when ready for Store submission. Involves copying source, adding README/LICENSE, GitHub Actions CI for releases.
- **Elgato Developer Account registration** — manual step by user.
- **Store listing image** (1024x500) — created manually before submission.
- **PI labels are changed from German to English** — this is intentional for the international Marketplace audience, consistent with the CLAUDE.md convention "Code is written in English."

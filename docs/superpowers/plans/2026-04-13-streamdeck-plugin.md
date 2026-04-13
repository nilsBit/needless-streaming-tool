# Stream Deck Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a native Elgato Stream Deck plugin that auto-installs from the Electron app, exposing clip creation, stream actions, OBS scene switching, and live status feedback.

**Architecture:** A standalone npm project (`streamdeck-plugin/`) built with `@elgato/streamdeck` SDK v2 and bundled via esbuild. The Electron main process provides two IPC handlers (`streamdeck:status`, `streamdeck:install`) that check for and copy the compiled plugin into the Stream Deck plugins folder, writing the API token automatically. A new Settings Panel section exposes the install button.

**Tech Stack:** `@elgato/streamdeck` SDK v2, esbuild, TypeScript 5.x, native `fetch` + `WebSocket` (Node 20 globals), Electron IPC (`ipcMain`/`ipcRenderer`), React (Settings UI)

---

## File Map

**New — plugin project:**
- `streamdeck-plugin/package.json` — plugin npm project
- `streamdeck-plugin/tsconfig.json` — TypeScript config for plugin
- `streamdeck-plugin/build.mjs` — esbuild bundle script
- `streamdeck-plugin/com.nilsr.stream-toolkit.sdPlugin/manifest.json` — Stream Deck plugin manifest
- `streamdeck-plugin/src/config.ts` — reads `config.json` from plugin folder
- `streamdeck-plugin/src/api.ts` — HTTP client to Stream Toolkit API
- `streamdeck-plugin/src/toolkit-ws.ts` — WebSocket subscriber to Stream Toolkit
- `streamdeck-plugin/src/actions/clips.ts` — 5 clip actions (one per tag)
- `streamdeck-plugin/src/actions/compile-pray.ts` — Compile & Pray action
- `streamdeck-plugin/src/actions/bug-roulette.ts` — Bug Roulette action with cooldown
- `streamdeck-plugin/src/actions/obs-scene.ts` — OBS scene switching with Property Inspector
- `streamdeck-plugin/src/actions/stream-status.ts` — LIVE/OFFLINE status display
- `streamdeck-plugin/src/actions/open-bugs.ts` — open bug count display
- `streamdeck-plugin/src/plugin.ts` — plugin entry point
- `streamdeck-plugin/ui/obs-scene.html` — Property Inspector for OBS scene

**Modified:**
- `src/server/api/settings.ts` — add `/streamdeck-status` and `/streamdeck-install` HTTP endpoints
- `src/renderer/src/panels/SettingsPanel.tsx` — add "Stream Deck Plugin" section
- `package.json` — add `build:streamdeck` script and `extraResources`

---

## Task 1: Plugin project scaffold

**Files:**
- Create: `streamdeck-plugin/package.json`
- Create: `streamdeck-plugin/tsconfig.json`
- Create: `streamdeck-plugin/build.mjs`
- Create: `streamdeck-plugin/com.nilsr.stream-toolkit.sdPlugin/manifest.json`

- [ ] **Step 1: Create `streamdeck-plugin/package.json`**

```json
{
  "name": "com.nilsr.stream-toolkit",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "node build.mjs",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@elgato/streamdeck": "^2.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "esbuild": "^0.23.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: Create `streamdeck-plugin/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "experimentalDecorators": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "com.nilsr.stream-toolkit.sdPlugin"]
}
```

- [ ] **Step 3: Create `streamdeck-plugin/build.mjs`**

```javascript
import * as esbuild from 'esbuild';
import { mkdirSync } from 'node:fs';

mkdirSync('com.nilsr.stream-toolkit.sdPlugin/bin', { recursive: true });

await esbuild.build({
  entryPoints: ['src/plugin.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: 'com.nilsr.stream-toolkit.sdPlugin/bin/plugin.js',
  target: 'node20',
  logLevel: 'info',
});

console.log('Stream Deck plugin built successfully.');
```

- [ ] **Step 4: Create the manifest**

Create `streamdeck-plugin/com.nilsr.stream-toolkit.sdPlugin/manifest.json`:

```json
{
  "Author": "NilsR",
  "CodePath": "bin/plugin.js",
  "Description": "Stream Toolkit integration for The Lab stream",
  "Name": "Stream Toolkit",
  "Icon": "imgs/plugin/marketplace",
  "SDKVersion": 2,
  "Software": { "MinimumVersion": "6.4" },
  "Version": "1.0.0",
  "OS": [{ "Platform": "windows", "MinimumVersion": "10" }],
  "UUID": "com.nilsr.stream-toolkit",
  "Actions": [
    {
      "Name": "Clip: Highlight",
      "UUID": "com.nilsr.stream-toolkit.clip.highlight",
      "Icon": "imgs/actions/clip/action",
      "Tooltip": "Create a highlight clip",
      "Controllers": ["Keypad"],
      "States": [{ "Image": "imgs/actions/clip/key" }]
    },
    {
      "Name": "Clip: Fail",
      "UUID": "com.nilsr.stream-toolkit.clip.fail",
      "Icon": "imgs/actions/clip/action",
      "Tooltip": "Create a fail clip",
      "Controllers": ["Keypad"],
      "States": [{ "Image": "imgs/actions/clip/key" }]
    },
    {
      "Name": "Clip: Funny",
      "UUID": "com.nilsr.stream-toolkit.clip.funny",
      "Icon": "imgs/actions/clip/action",
      "Tooltip": "Create a funny clip",
      "Controllers": ["Keypad"],
      "States": [{ "Image": "imgs/actions/clip/key" }]
    },
    {
      "Name": "Clip: Tutorial",
      "UUID": "com.nilsr.stream-toolkit.clip.tutorial",
      "Icon": "imgs/actions/clip/action",
      "Tooltip": "Create a tutorial clip",
      "Controllers": ["Keypad"],
      "States": [{ "Image": "imgs/actions/clip/key" }]
    },
    {
      "Name": "Clip: Bug",
      "UUID": "com.nilsr.stream-toolkit.clip.bug",
      "Icon": "imgs/actions/clip/action",
      "Tooltip": "Create a bug clip",
      "Controllers": ["Keypad"],
      "States": [{ "Image": "imgs/actions/clip/key" }]
    },
    {
      "Name": "Compile & Pray",
      "UUID": "com.nilsr.stream-toolkit.compile-pray",
      "Icon": "imgs/actions/compile-pray/action",
      "Tooltip": "Trigger Compile & Pray alert",
      "Controllers": ["Keypad"],
      "States": [{ "Image": "imgs/actions/compile-pray/key" }]
    },
    {
      "Name": "Bug Roulette",
      "UUID": "com.nilsr.stream-toolkit.bug-roulette",
      "Icon": "imgs/actions/bug-roulette/action",
      "Tooltip": "Spin the Bug Roulette",
      "Controllers": ["Keypad"],
      "States": [{ "Image": "imgs/actions/bug-roulette/key" }]
    },
    {
      "Name": "OBS Scene",
      "UUID": "com.nilsr.stream-toolkit.obs-scene",
      "Icon": "imgs/actions/obs-scene/action",
      "Tooltip": "Switch to a specific OBS scene",
      "Controllers": ["Keypad"],
      "States": [{ "Image": "imgs/actions/obs-scene/key" }],
      "PropertyInspectorPath": "ui/obs-scene.html"
    },
    {
      "Name": "Stream Status",
      "UUID": "com.nilsr.stream-toolkit.stream-status",
      "Icon": "imgs/actions/stream-status/action",
      "Tooltip": "Shows LIVE or OFFLINE",
      "Controllers": ["Keypad"],
      "States": [{ "Image": "imgs/actions/stream-status/key" }]
    },
    {
      "Name": "Open Bugs",
      "UUID": "com.nilsr.stream-toolkit.open-bugs",
      "Icon": "imgs/actions/open-bugs/action",
      "Tooltip": "Shows number of open bugs",
      "Controllers": ["Keypad"],
      "States": [{ "Image": "imgs/actions/open-bugs/key" }]
    }
  ]
}
```

- [ ] **Step 5: Create placeholder icon files**

Create `streamdeck-plugin/scripts/create-icons.mjs`:

```javascript
import { writeFileSync, mkdirSync } from 'node:fs';

// Minimal 1x1 transparent PNG (placeholder — replace with real icons later)
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAABjE+ibYAAAAASUVORK5CYII=',
  'base64'
);

const dirs = [
  'com.nilsr.stream-toolkit.sdPlugin/imgs/plugin',
  'com.nilsr.stream-toolkit.sdPlugin/imgs/actions/clip',
  'com.nilsr.stream-toolkit.sdPlugin/imgs/actions/compile-pray',
  'com.nilsr.stream-toolkit.sdPlugin/imgs/actions/bug-roulette',
  'com.nilsr.stream-toolkit.sdPlugin/imgs/actions/obs-scene',
  'com.nilsr.stream-toolkit.sdPlugin/imgs/actions/stream-status',
  'com.nilsr.stream-toolkit.sdPlugin/imgs/actions/open-bugs',
];

dirs.forEach(dir => mkdirSync(dir, { recursive: true }));

const files = [
  'com.nilsr.stream-toolkit.sdPlugin/imgs/plugin/marketplace.png',
  'com.nilsr.stream-toolkit.sdPlugin/imgs/actions/clip/action.png',
  'com.nilsr.stream-toolkit.sdPlugin/imgs/actions/clip/key.png',
  'com.nilsr.stream-toolkit.sdPlugin/imgs/actions/compile-pray/action.png',
  'com.nilsr.stream-toolkit.sdPlugin/imgs/actions/compile-pray/key.png',
  'com.nilsr.stream-toolkit.sdPlugin/imgs/actions/bug-roulette/action.png',
  'com.nilsr.stream-toolkit.sdPlugin/imgs/actions/bug-roulette/key.png',
  'com.nilsr.stream-toolkit.sdPlugin/imgs/actions/obs-scene/action.png',
  'com.nilsr.stream-toolkit.sdPlugin/imgs/actions/obs-scene/key.png',
  'com.nilsr.stream-toolkit.sdPlugin/imgs/actions/stream-status/action.png',
  'com.nilsr.stream-toolkit.sdPlugin/imgs/actions/stream-status/key.png',
  'com.nilsr.stream-toolkit.sdPlugin/imgs/actions/open-bugs/action.png',
  'com.nilsr.stream-toolkit.sdPlugin/imgs/actions/open-bugs/key.png',
];

files.forEach(file => writeFileSync(file, PNG));
console.log(`Created ${files.length} placeholder icon files.`);
```

Run from `streamdeck-plugin/` directory:
```bash
node scripts/create-icons.mjs
```

Expected output: `Created 13 placeholder icon files.`

- [ ] **Step 6: Install dependencies**

```bash
cd streamdeck-plugin && npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 7: Commit scaffold**

```bash
cd ..
git add streamdeck-plugin/
git commit -m "feat: add Stream Deck plugin project scaffold"
```

---

## Task 2: Config and API client

**Files:**
- Create: `streamdeck-plugin/src/config.ts`
- Create: `streamdeck-plugin/src/api.ts`

- [ ] **Step 1: Create `streamdeck-plugin/src/config.ts`**

```typescript
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface PluginConfig {
  token: string;
  baseUrl: string;
}

let _config: PluginConfig | null = null;

export function getConfig(): PluginConfig {
  if (!_config) {
    // Plugin runs from com.nilsr.stream-toolkit.sdPlugin/bin/plugin.js
    // config.json lives one level up: com.nilsr.stream-toolkit.sdPlugin/config.json
    const configPath = join(__dirname, '..', 'config.json');
    _config = JSON.parse(readFileSync(configPath, 'utf-8')) as PluginConfig;
  }
  return _config;
}
```

- [ ] **Step 2: Create `streamdeck-plugin/src/api.ts`**

```typescript
import { getConfig } from './config';

async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const { token, baseUrl } = getConfig();
  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
}

export async function createClip(tag: string): Promise<boolean> {
  try {
    const res = await apiFetch('/clips', {
      method: 'POST',
      body: JSON.stringify({ tag }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function triggerCompilePray(): Promise<boolean> {
  try {
    const res = await apiFetch('/actions/compile-pray', { method: 'POST' });
    return res.ok;
  } catch {
    return false;
  }
}

/** Returns true if roulette spun, false if on cooldown or error */
export async function triggerBugRoulette(): Promise<{ success: boolean; onCooldown: boolean }> {
  try {
    const res = await apiFetch('/actions/roulette', { method: 'POST' });
    if (res.status === 429) return { success: false, onCooldown: true };
    return { success: res.ok, onCooldown: false };
  } catch {
    return { success: false, onCooldown: false };
  }
}

export async function switchScene(scene: string): Promise<boolean> {
  try {
    const res = await apiFetch('/obs/scene', {
      method: 'POST',
      body: JSON.stringify({ scene }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function getScenes(): Promise<string[]> {
  try {
    const res = await apiFetch('/obs/scenes');
    if (!res.ok) return [];
    const data = await res.json() as { scenes: { sceneName: string }[]; currentScene: string };
    return data.scenes.map((s) => s.sceneName);
  } catch {
    return [];
  }
}

export async function getStreamState(): Promise<{ is_live: number } | null> {
  try {
    const res = await apiFetch('/stream-state');
    if (!res.ok) return null;
    return res.json() as Promise<{ is_live: number }>;
  } catch {
    return null;
  }
}

export async function getOpenBugCount(): Promise<number> {
  try {
    const res = await apiFetch('/bugs');
    if (!res.ok) return 0;
    const bugs = await res.json() as { status: string }[];
    return bugs.filter((b) => b.status === 'open').length;
  } catch {
    return 0;
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd streamdeck-plugin && npm run typecheck
```

Expected: no errors. (Note: this will error on missing `src/plugin.ts` import — that's fine, the entry point doesn't exist yet. If you see only "Cannot find module" for plugin.ts, proceed.)

- [ ] **Step 4: Commit**

```bash
cd ..
git add streamdeck-plugin/src/config.ts streamdeck-plugin/src/api.ts
git commit -m "feat(streamdeck): add config reader and API client"
```

---

## Task 3: WebSocket subscriber

**Files:**
- Create: `streamdeck-plugin/src/toolkit-ws.ts`

- [ ] **Step 1: Create `streamdeck-plugin/src/toolkit-ws.ts`**

This module connects to the Stream Toolkit WebSocket and re-emits events. It uses the native `WebSocket` global (available in Node.js 20+, which is what Stream Deck 6.x ships with).

```typescript
import { getConfig } from './config';

type EventHandler = (data: unknown) => void;

const handlers = new Map<string, Set<EventHandler>>();
let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

export function onToolkitEvent(eventType: string, handler: EventHandler): void {
  if (!handlers.has(eventType)) handlers.set(eventType, new Set());
  handlers.get(eventType)!.add(handler);
}

export function connectToolkit(): void {
  const { token, baseUrl } = getConfig();
  // Convert http://localhost:4000/api → ws://localhost:4000
  const wsUrl = baseUrl.replace(/^http/, 'ws').replace(/\/api$/, '') + `/ws?token=${token}`;

  try {
    socket = new WebSocket(wsUrl);
  } catch {
    scheduleReconnect();
    return;
  }

  socket.addEventListener('message', (ev) => {
    try {
      const { event_type, data } = JSON.parse(ev.data as string) as {
        event_type: string;
        data: unknown;
      };
      handlers.get(event_type)?.forEach((h) => h(data));
    } catch {
      // ignore malformed messages
    }
  });

  socket.addEventListener('close', () => scheduleReconnect());
  socket.addEventListener('error', () => {
    socket?.close();
  });
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectToolkit();
  }, 10_000);
}
```

- [ ] **Step 2: Run typecheck**

```bash
cd streamdeck-plugin && npm run typecheck
```

Expected: no errors on the new files.

- [ ] **Step 3: Commit**

```bash
cd ..
git add streamdeck-plugin/src/toolkit-ws.ts
git commit -m "feat(streamdeck): add WebSocket subscriber for live events"
```

---

## Task 4: Clip actions

**Files:**
- Create: `streamdeck-plugin/src/actions/clips.ts`

- [ ] **Step 1: Create `streamdeck-plugin/src/actions/clips.ts`**

All 5 clip actions in one file — they share identical logic, only differing by tag.

```typescript
import { action, KeyDownEvent, SingletonAction, WillAppearEvent } from '@elgato/streamdeck';
import { createClip } from '../api';

const TAG_LABELS: Record<string, string> = {
  highlight: '⭐\nHighlight',
  fail: '💀\nFail',
  funny: '😂\nFunny',
  tutorial: '📚\nTutorial',
  bug: '🐛\nBug',
};

function makeClipAction(tag: string) {
  @action({ UUID: `com.nilsr.stream-toolkit.clip.${tag}` })
  class ClipAction extends SingletonAction {
    async onWillAppear(ev: WillAppearEvent): Promise<void> {
      await ev.action.setTitle(TAG_LABELS[tag] ?? tag);
    }

    async onKeyDown(ev: KeyDownEvent): Promise<void> {
      const success = await createClip(tag);
      if (success) {
        await ev.action.showOk();
      } else {
        await ev.action.showAlert();
      }
    }
  }
  return ClipAction;
}

export const HighlightClipAction = makeClipAction('highlight');
export const FailClipAction = makeClipAction('fail');
export const FunnyClipAction = makeClipAction('funny');
export const TutorialClipAction = makeClipAction('tutorial');
export const BugClipAction = makeClipAction('bug');
```

- [ ] **Step 2: Run typecheck**

```bash
cd streamdeck-plugin && npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd ..
git add streamdeck-plugin/src/actions/clips.ts
git commit -m "feat(streamdeck): add clip actions (highlight, fail, funny, tutorial, bug)"
```

---

## Task 5: Compile & Pray and Bug Roulette actions

**Files:**
- Create: `streamdeck-plugin/src/actions/compile-pray.ts`
- Create: `streamdeck-plugin/src/actions/bug-roulette.ts`

- [ ] **Step 1: Create `streamdeck-plugin/src/actions/compile-pray.ts`**

```typescript
import { action, KeyDownEvent, SingletonAction, WillAppearEvent } from '@elgato/streamdeck';
import { triggerCompilePray } from '../api';

@action({ UUID: 'com.nilsr.stream-toolkit.compile-pray' })
export class CompilePrayAction extends SingletonAction {
  async onWillAppear(ev: WillAppearEvent): Promise<void> {
    await ev.action.setTitle('🙏\nCompile\n& Pray');
  }

  async onKeyDown(ev: KeyDownEvent): Promise<void> {
    const success = await triggerCompilePray();
    if (success) {
      await ev.action.showOk();
    } else {
      await ev.action.showAlert();
    }
  }
}
```

- [ ] **Step 2: Create `streamdeck-plugin/src/actions/bug-roulette.ts`**

```typescript
import { action, KeyDownEvent, SingletonAction, WillAppearEvent } from '@elgato/streamdeck';
import { triggerBugRoulette } from '../api';

@action({ UUID: 'com.nilsr.stream-toolkit.bug-roulette' })
export class BugRouletteAction extends SingletonAction {
  private cooldownUntil = 0;
  private cooldownTimer: ReturnType<typeof setInterval> | null = null;

  async onWillAppear(ev: WillAppearEvent): Promise<void> {
    await ev.action.setTitle('🎰\nRoulette');
  }

  async onKeyDown(ev: KeyDownEvent): Promise<void> {
    if (Date.now() < this.cooldownUntil) {
      await ev.action.showAlert();
      return;
    }

    const result = await triggerBugRoulette();

    if (result.onCooldown) {
      await this.startCooldown(ev);
      return;
    }

    if (result.success) {
      await ev.action.showOk();
      // Start local 60s cooldown to match server cooldown
      this.cooldownUntil = Date.now() + 60_000;
      await this.startCooldown(ev);
    } else {
      await ev.action.showAlert();
    }
  }

  private async startCooldown(ev: KeyDownEvent): Promise<void> {
    if (this.cooldownTimer) return;

    this.cooldownTimer = setInterval(async () => {
      const remaining = Math.ceil((this.cooldownUntil - Date.now()) / 1000);
      if (remaining <= 0) {
        clearInterval(this.cooldownTimer!);
        this.cooldownTimer = null;
        await ev.action.setTitle('🎰\nRoulette');
      } else {
        await ev.action.setTitle(`⏳\n${remaining}s`);
      }
    }, 1000);
  }
}
```

- [ ] **Step 3: Run typecheck**

```bash
cd streamdeck-plugin && npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd ..
git add streamdeck-plugin/src/actions/compile-pray.ts streamdeck-plugin/src/actions/bug-roulette.ts
git commit -m "feat(streamdeck): add Compile & Pray and Bug Roulette actions"
```

---

## Task 6: OBS Scene action + Property Inspector

**Files:**
- Create: `streamdeck-plugin/src/actions/obs-scene.ts`
- Create: `streamdeck-plugin/ui/obs-scene.html`

- [ ] **Step 1: Create `streamdeck-plugin/src/actions/obs-scene.ts`**

```typescript
import {
  action,
  DidReceiveSettingsEvent,
  KeyDownEvent,
  SendToPluginEvent,
  SingletonAction,
  WillAppearEvent,
} from '@elgato/streamdeck';
import { getScenes, switchScene } from '../api';

interface OBSSceneSettings {
  scene?: string;
}

@action({ UUID: 'com.nilsr.stream-toolkit.obs-scene' })
export class OBSSceneAction extends SingletonAction<OBSSceneSettings> {
  async onWillAppear(ev: WillAppearEvent<OBSSceneSettings>): Promise<void> {
    const scene = ev.payload.settings.scene;
    await ev.action.setTitle(scene ? `🎬\n${scene}` : '🎬\nScene');
  }

  async onDidReceiveSettings(ev: DidReceiveSettingsEvent<OBSSceneSettings>): Promise<void> {
    const scene = ev.payload.settings.scene;
    await ev.action.setTitle(scene ? `🎬\n${scene}` : '🎬\nScene');
  }

  async onKeyDown(ev: KeyDownEvent<OBSSceneSettings>): Promise<void> {
    const scene = ev.payload.settings.scene;
    if (!scene) {
      await ev.action.showAlert();
      return;
    }
    const success = await switchScene(scene);
    if (success) {
      await ev.action.showOk();
    } else {
      await ev.action.showAlert();
    }
  }

  async onSendToPlugin(
    ev: SendToPluginEvent<{ event: string }, OBSSceneSettings>
  ): Promise<void> {
    if (ev.payload.event === 'getScenes') {
      const scenes = await getScenes();
      await ev.action.sendToPropertyInspector({ scenes });
    }
  }
}
```

- [ ] **Step 2: Create `streamdeck-plugin/ui/obs-scene.html`**

The Property Inspector communicates with the plugin via the Stream Deck WebSocket protocol.

```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; font-size: 13px; padding: 8px; color: #d4d4d4; }
    label { display: block; margin-bottom: 4px; color: #9e9e9e; }
    select {
      width: 100%;
      background: #2a2a2a;
      color: #d4d4d4;
      border: 1px solid #444;
      border-radius: 4px;
      padding: 6px 8px;
      font-size: 13px;
    }
    .hint { margin-top: 6px; color: #666; font-size: 11px; }
  </style>
</head>
<body>
  <label>OBS Szene</label>
  <select id="scene-select">
    <option value="">Wird geladen...</option>
  </select>
  <p class="hint">OBS muss verbunden sein.</p>

  <script>
    let ws = null;
    let piUUID = null;
    let actionUUID = null;
    let currentScene = '';

    // Stream Deck calls this function when the PI connects
    function connectElgato(port, propertyInspectorUUID, registerEvent, info, actionInfo) {
      piUUID = propertyInspectorUUID;
      const parsed = JSON.parse(actionInfo);
      actionUUID = parsed.context;
      currentScene = parsed.payload?.settings?.scene ?? '';

      ws = new WebSocket(`ws://localhost:${port}`);

      ws.onopen = () => {
        ws.send(JSON.stringify({ event: registerEvent, uuid: piUUID }));
        // Ask the plugin for the scene list
        ws.send(JSON.stringify({
          action: parsed.action,
          event: 'sendToPlugin',
          context: piUUID,
          payload: { event: 'getScenes' },
        }));
      };

      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.event === 'sendToPropertyInspector') {
          const { scenes } = msg.payload;
          populateScenes(scenes);
        }
      };
    }

    function populateScenes(scenes) {
      const select = document.getElementById('scene-select');
      select.innerHTML = '<option value="">Szene wählen...</option>';
      scenes.forEach((name) => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        if (name === currentScene) opt.selected = true;
        select.appendChild(opt);
      });
    }

    document.getElementById('scene-select').addEventListener('change', (ev) => {
      currentScene = ev.target.value;
      if (ws && piUUID) {
        ws.send(JSON.stringify({
          event: 'setSettings',
          context: piUUID,
          payload: { scene: currentScene },
        }));
      }
    });
  </script>
</body>
</html>
```

- [ ] **Step 3: Run typecheck**

```bash
cd streamdeck-plugin && npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd ..
git add streamdeck-plugin/src/actions/obs-scene.ts streamdeck-plugin/ui/obs-scene.html
git commit -m "feat(streamdeck): add OBS scene action with property inspector"
```

---

## Task 7: Stream Status and Open Bugs actions

**Files:**
- Create: `streamdeck-plugin/src/actions/stream-status.ts`
- Create: `streamdeck-plugin/src/actions/open-bugs.ts`

- [ ] **Step 1: Create `streamdeck-plugin/src/actions/stream-status.ts`**

```typescript
import { action, SingletonAction, WillAppearEvent, WillDisappearEvent } from '@elgato/streamdeck';
import { getStreamState } from '../api';
import { onToolkitEvent } from '../toolkit-ws';

@action({ UUID: 'com.nilsr.stream-toolkit.stream-status' })
export class StreamStatusAction extends SingletonAction {
  async onWillAppear(ev: WillAppearEvent): Promise<void> {
    // Load initial state
    const state = await getStreamState();
    await this.updateTitle(ev.action, state?.is_live === 1);

    // Subscribe to live updates
    onToolkitEvent('stream-state', async (data) => {
      const s = data as { is_live: number };
      await this.updateTitle(ev.action, s.is_live === 1);
    });
  }

  async onWillDisappear(_ev: WillDisappearEvent): Promise<void> {
    // WebSocket subscriptions are global — no cleanup needed per-action instance
  }

  private async updateTitle(
    actionContext: WillAppearEvent['action'],
    isLive: boolean
  ): Promise<void> {
    await actionContext.setTitle(isLive ? '🔴\nLIVE' : '⚫\nOFFLINE');
  }
}
```

- [ ] **Step 2: Create `streamdeck-plugin/src/actions/open-bugs.ts`**

```typescript
import { action, SingletonAction, WillAppearEvent } from '@elgato/streamdeck';
import { getOpenBugCount } from '../api';
import { onToolkitEvent } from '../toolkit-ws';

@action({ UUID: 'com.nilsr.stream-toolkit.open-bugs' })
export class OpenBugsAction extends SingletonAction {
  private count = 0;

  async onWillAppear(ev: WillAppearEvent): Promise<void> {
    this.count = await getOpenBugCount();
    await this.updateTitle(ev.action);

    const refresh = async () => {
      this.count = await getOpenBugCount();
      await this.updateTitle(ev.action);
    };

    onToolkitEvent('bug-created', refresh);
    onToolkitEvent('bug-updated', refresh);
    onToolkitEvent('bug-deleted', refresh);
  }

  private async updateTitle(actionContext: WillAppearEvent['action']): Promise<void> {
    await actionContext.setTitle(`🐛\n${this.count} Bug${this.count !== 1 ? 's' : ''}`);
  }
}
```

- [ ] **Step 3: Run typecheck**

```bash
cd streamdeck-plugin && npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd ..
git add streamdeck-plugin/src/actions/stream-status.ts streamdeck-plugin/src/actions/open-bugs.ts
git commit -m "feat(streamdeck): add Stream Status and Open Bugs display actions"
```

---

## Task 8: Plugin entry point and first build

**Files:**
- Create: `streamdeck-plugin/src/plugin.ts`

- [ ] **Step 1: Create `streamdeck-plugin/src/plugin.ts`**

```typescript
import streamDeck, { LogLevel } from '@elgato/streamdeck';
import { HighlightClipAction, FailClipAction, FunnyClipAction, TutorialClipAction, BugClipAction } from './actions/clips';
import { CompilePrayAction } from './actions/compile-pray';
import { BugRouletteAction } from './actions/bug-roulette';
import { OBSSceneAction } from './actions/obs-scene';
import { StreamStatusAction } from './actions/stream-status';
import { OpenBugsAction } from './actions/open-bugs';
import { connectToolkit } from './toolkit-ws';

streamDeck.logger.setLevel(LogLevel.TRACE);

streamDeck.actions.registerAll([
  HighlightClipAction,
  FailClipAction,
  FunnyClipAction,
  TutorialClipAction,
  BugClipAction,
  CompilePrayAction,
  BugRouletteAction,
  OBSSceneAction,
  StreamStatusAction,
  OpenBugsAction,
]);

// Connect to Stream Toolkit WebSocket for live updates
connectToolkit();

await streamDeck.connect();
```

- [ ] **Step 2: Run full typecheck**

```bash
cd streamdeck-plugin && npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Run build**

```bash
npm run build
```

Expected output includes:
```
  com.nilsr.stream-toolkit.sdPlugin/bin/plugin.js  ...kb
Stream Deck plugin built successfully.
```

If esbuild reports decorator errors, add `--supported:decorators=true` to the build command in `build.mjs`:
```javascript
await esbuild.build({
  // ...existing options...
  supported: { decorators: true },
});
```

- [ ] **Step 4: Verify output exists**

```bash
ls com.nilsr.stream-toolkit.sdPlugin/bin/plugin.js
```

Expected: file exists and is non-empty.

- [ ] **Step 5: Commit**

```bash
cd ..
git add streamdeck-plugin/src/plugin.ts
git commit -m "feat(streamdeck): add plugin entry point, first successful build"
```

---

## ~~Task 9: Electron installer~~ — SKIP

> The renderer communicates with the server via HTTP (no contextBridge/preload). The installer logic lives directly in `src/server/api/settings.ts` — see Task 11.

---

## ~~Task 10: Wire IPC into main.ts~~ — SKIP

> Not needed. All installer logic is in the HTTP endpoint added in Task 11.

---

## Task 9 (was 11): Settings HTTP endpoints + UI

**Files:**
- Modify: `src/server/api/settings.ts`
- Modify: `src/renderer/src/panels/SettingsPanel.tsx`

- [ ] **Step 1: Create `src/main/streamdeck-installer.ts`**

```typescript
import { app, ipcMain } from 'electron';
import { cpSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getFixedToken } from '../server/auth-token';

const PLUGIN_ID = 'com.nilsr.stream-toolkit.sdPlugin';

function getStreamDeckPluginsDir(): string {
  return path.join(process.env.APPDATA ?? '', 'Elgato', 'StreamDeck', 'Plugins');
}

function getPluginSourceDir(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'streamdeck-plugin', PLUGIN_ID);
  }
  return path.join(app.getAppPath(), 'streamdeck-plugin', PLUGIN_ID);
}

function isInstalled(): boolean {
  const dest = path.join(getStreamDeckPluginsDir(), PLUGIN_ID);
  return existsSync(dest);
}

export function registerStreamDeckIPC(): void {
  ipcMain.handle('streamdeck:status', () => {
    const pluginsDir = getStreamDeckPluginsDir();
    const sdInstalled = existsSync(pluginsDir);
    return {
      sdInstalled,
      pluginInstalled: sdInstalled && isInstalled(),
    };
  });

  ipcMain.handle('streamdeck:install', async () => {
    const pluginsDir = getStreamDeckPluginsDir();

    if (!existsSync(pluginsDir)) {
      return {
        success: false,
        message: 'Stream Deck Software nicht gefunden. Bitte Stream Deck installieren.',
      };
    }

    const source = getPluginSourceDir();
    if (!existsSync(source)) {
      return {
        success: false,
        message: 'Plugin-Dateien nicht gefunden. Bitte `npm run build:streamdeck` ausführen.',
      };
    }

    try {
      const dest = path.join(pluginsDir, PLUGIN_ID);
      cpSync(source, dest, { recursive: true, force: true });

      const token = getFixedToken();
      if (!token) {
        return {
          success: false,
          message: 'API-Token noch nicht initialisiert. App neu starten und erneut versuchen.',
        };
      }

      writeFileSync(
        path.join(dest, 'config.json'),
        JSON.stringify({ token, baseUrl: 'http://localhost:4000/api' }, null, 2)
      );

      return { success: true, message: 'Plugin erfolgreich installiert. Stream Deck neu starten.' };
    } catch (err) {
      return { success: false, message: `Fehler: ${(err as Error).message}` };
    }
  });
}
```

- [ ] **Step 2: Run typecheck from project root**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/main/streamdeck-installer.ts
git commit -m "feat: add Stream Deck plugin installer with IPC handlers"
```

---

## Task 10: Wire IPC into main.ts

**Files:**
- Modify: `src/main/main.ts`

- [ ] **Step 1: Add import and call to `main.ts`**

Add the import at the top of `src/main/main.ts` (after the existing imports):

```typescript
import { registerStreamDeckIPC } from './streamdeck-installer';
```

In `app.whenReady().then(async () => { ... })`, add `registerStreamDeckIPC()` after `startServer()`:

Current code (lines 58–62):
```typescript
app.whenReady().then(async () => {
  apiToken = await startServer();
  createWindow();
  registerHotkeys();
});
```

Replace with:
```typescript
app.whenReady().then(async () => {
  apiToken = await startServer();
  registerStreamDeckIPC();
  createWindow();
  registerHotkeys();
});
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/main/main.ts
git commit -m "feat: register Stream Deck IPC handlers in main process"
```

---

## Task 11: Settings Panel UI

**Files:**
- Modify: `src/renderer/src/panels/SettingsPanel.tsx`

- [ ] **Step 1: Read the current SettingsPanel.tsx**

Read `src/renderer/src/panels/SettingsPanel.tsx` and find the end of the last settings section (the existing "Stream Deck API Token" block). Note the line number where the closing `</div>` of that section is.

- [ ] **Step 2: Add IPC type declarations and state**

At the top of the component function, add two state variables and a load effect. First, check if `window.electron` or similar IPC bridge exists — look at how other panels call Electron IPC. In this project the renderer calls the Express API via HTTP, not IPC. For IPC from renderer, Electron's `contextBridge` / `ipcRenderer` would be needed.

Since the existing code does NOT have a contextBridge preload script, use a direct HTTP approach instead: add a new Express endpoint for the installer rather than IPC.

**Update plan for installer: use HTTP endpoint instead of IPC.**

Add to `src/server/api/settings.ts` — two new routes:

Read `src/server/api/settings.ts` first to find where to add routes, then add:

```typescript
// GET /api/settings/streamdeck-status
router.get('/streamdeck-status', requireAuth, (_req, res) => {
  const pluginsDir = path.join(process.env.APPDATA ?? '', 'Elgato', 'StreamDeck', 'Plugins');
  const pluginId = 'com.nilsr.stream-toolkit.sdPlugin';
  const sdInstalled = existsSync(pluginsDir);
  const pluginInstalled = sdInstalled && existsSync(path.join(pluginsDir, pluginId));
  res.json({ sdInstalled, pluginInstalled });
});

// POST /api/settings/streamdeck-install
router.post('/streamdeck-install', requireAuth, (_req, res) => {
  const pluginsDir = path.join(process.env.APPDATA ?? '', 'Elgato', 'StreamDeck', 'Plugins');
  const pluginId = 'com.nilsr.stream-toolkit.sdPlugin';

  if (!existsSync(pluginsDir)) {
    return res.status(400).json({ error: 'Stream Deck Software nicht gefunden.' });
  }

  const isDev = !require('electron').app.isPackaged;
  const source = isDev
    ? path.join(process.cwd(), 'streamdeck-plugin', pluginId)
    : path.join(process.resourcesPath, 'streamdeck-plugin', pluginId);

  if (!existsSync(source)) {
    return res.status(400).json({ error: 'Plugin-Dateien nicht gefunden. `npm run build:streamdeck` ausführen.' });
  }

  try {
    const dest = path.join(pluginsDir, pluginId);
    cpSync(source, dest, { recursive: true, force: true });
    const token = getFixedToken();
    writeFileSync(
      path.join(dest, 'config.json'),
      JSON.stringify({ token, baseUrl: 'http://localhost:4000/api' }, null, 2)
    );
    res.json({ success: true, message: 'Plugin installiert. Stream Deck neu starten.' });
  } catch (err) {
    res.status(500).json({ error: `Fehler: ${(err as Error).message}` });
  }
});
```

Add the required imports at the top of `settings.ts`:
```typescript
import { cpSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getFixedToken } from '../auth-token';
```

- [ ] **Step 3: Add the UI section in SettingsPanel.tsx**

In `SettingsPanel.tsx`, add state and effect for Stream Deck plugin status. Add this to the component's state section:

```typescript
const [sdStatus, setSdStatus] = useState<{ sdInstalled: boolean; pluginInstalled: boolean } | null>(null);
const [sdInstalling, setSdInstalling] = useState(false);
const [sdMessage, setSdMessage] = useState('');
```

Add this effect (alongside the other `useEffect` calls):

```typescript
useEffect(() => {
  apiGet<{ sdInstalled: boolean; pluginInstalled: boolean }>('/settings/streamdeck-status')
    .then(setSdStatus)
    .catch(() => {});
}, []);
```

Add this JSX section at the end of the settings form (after the existing "Stream Deck API Token" section):

```tsx
<div className="settings-section">
  <h3>Stream Deck Plugin</h3>
  {sdStatus && (
    <p className="status-line">
      {sdStatus.pluginInstalled ? '● Installiert' : sdStatus.sdInstalled ? '○ Nicht installiert' : '○ Stream Deck nicht gefunden'}
    </p>
  )}
  <button
    className="btn-primary"
    disabled={sdInstalling}
    onClick={async () => {
      setSdInstalling(true);
      setSdMessage('');
      try {
        const result = await apiPost<{ success?: boolean; error?: string; message?: string }>(
          '/settings/streamdeck-install',
          {}
        );
        setSdMessage(result.message ?? result.error ?? 'Unbekannter Fehler');
        if (result.success) {
          const status = await apiGet<{ sdInstalled: boolean; pluginInstalled: boolean }>(
            '/settings/streamdeck-status'
          );
          setSdStatus(status);
        }
      } catch {
        setSdMessage('Fehler beim Installieren.');
      } finally {
        setSdInstalling(false);
      }
    }}
  >
    {sdInstalling ? 'Installiert...' : 'Plugin installieren / aktualisieren'}
  </button>
  {sdMessage && <p className="settings-hint">{sdMessage}</p>}
</div>
```

- [ ] **Step 4: Check that `apiGet` is available**

Look at the existing imports in `SettingsPanel.tsx`. If `apiGet` is not imported (only `apiPost` is used currently), add it from `../hooks/useApi`. The hook file should already export it based on the codebase structure.

- [ ] **Step 5: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/server/api/settings.ts src/renderer/src/panels/SettingsPanel.tsx
git commit -m "feat: add Stream Deck plugin install UI and HTTP endpoints"
```

---

## Task 12: Build integration and electron-builder config

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add `build:streamdeck` script**

In `package.json` `scripts`, add:
```json
"build:streamdeck": "cd streamdeck-plugin && npm install && npm run build",
```

Update the `build` script to include the streamdeck build first:
```json
"build": "npm run build:streamdeck && tsc -p tsconfig.node.json && vite build && electron-builder",
```

Do the same for `build:win`, `build:mac`, `build:all`.

- [ ] **Step 2: Add plugin to `extraResources`**

In `package.json` `build.extraResources`, add:
```json
{
  "from": "streamdeck-plugin/com.nilsr.stream-toolkit.sdPlugin",
  "to": "streamdeck-plugin/com.nilsr.stream-toolkit.sdPlugin"
}
```

The full `extraResources` array becomes:
```json
"extraResources": [
  {
    "from": "src/overlays",
    "to": "overlays"
  },
  {
    "from": "streamdeck-plugin/com.nilsr.stream-toolkit.sdPlugin",
    "to": "streamdeck-plugin/com.nilsr.stream-toolkit.sdPlugin"
  }
]
```

- [ ] **Step 3: Verify build:streamdeck script works**

```bash
npm run build:streamdeck
```

Expected: `Stream Deck plugin built successfully.`

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "feat: integrate Stream Deck plugin into main build pipeline"
```

---

## Task 13: End-to-end verification

Manual testing — requires Stream Deck software and hardware connected.

- [ ] **Step 1: Start the app**

```bash
npm run dev
```

Expected: app starts, no console errors related to streamdeck-installer.

- [ ] **Step 2: Install the plugin**

1. Open Stream Toolkit UI → Settings panel
2. Scroll to "Stream Deck Plugin" section
3. Verify status shows "Stream Deck nicht gefunden" OR "Nicht installiert"
4. Click "Plugin installieren / aktualisieren"
5. Expected message: "Plugin installiert. Stream Deck neu starten."
6. Status should now show "Installiert"

- [ ] **Step 3: Restart Stream Deck software**

Close and reopen the Stream Deck software. The "Stream Toolkit" plugin should appear in the action list.

- [ ] **Step 4: Test Clip button**

1. Drag "Clip: Highlight" onto a button
2. During a stream: press the button
3. Expected: button shows ✓ briefly, a new clip appears in the Clips panel

- [ ] **Step 5: Test Bug Roulette cooldown**

1. Press Bug Roulette button
2. Expected: shows ✓, then button title counts down `⏳ 59s`, `⏳ 58s`...
3. Press again during countdown: shows ✗ (alert)
4. After 60s: title resets to `🎰 Roulette`

- [ ] **Step 6: Test Stream Status button**

1. Drag "Stream Status" onto a button
2. Mark stream as offline in Stream Toolkit
3. Expected button shows: `⚫ OFFLINE`
4. Mark stream as live
5. Expected button updates to: `🔴 LIVE`

- [ ] **Step 7: Test OBS Scene button**

1. Drag "OBS Scene" onto a button
2. Click the button in Stream Deck software (not the key) to open Property Inspector
3. Expected: dropdown populated with OBS scenes
4. Select a scene → press the key → OBS switches to that scene

---

## Self-Review Notes

- **Spec coverage:** All 10 actions from spec ✓ | Auto-install mechanism ✓ | Zero-config token write ✓ | Live status via WebSocket ✓ | Cooldown on Bug Roulette ✓ | OBS Property Inspector ✓
- **Placeholder scan:** No TBDs. Task 11 has a note about `apiGet` availability — developer must verify import exists.
- **Type consistency:** `WillAppearEvent['action']` type alias used consistently across stream-status and open-bugs. `getConfig()` used consistently in api.ts, config.ts, toolkit-ws.ts.
- **Architectural note:** Task 10 (IPC) is superseded by Task 11's HTTP approach — `src/main/streamdeck-installer.ts` created in Task 9 is unused. Remove it or keep it as a reference. The HTTP approach in `settings.ts` is the actual integration path.

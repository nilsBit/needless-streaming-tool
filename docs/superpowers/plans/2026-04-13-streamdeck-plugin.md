# Stream Deck Plugin "The Lab Toolkit" Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a native Elgato Stream Deck plugin that provides 8 action buttons with live status for the stream-toolkit app.

**Architecture:** Standalone Node.js project using `@elgato/streamdeck` SDK v2. Each action is a `SingletonAction` subclass. A shared WebSocket client receives live updates from stream-toolkit and pushes them to all visible buttons. A shared HTTP client handles API calls with the global API token.

**Tech Stack:** `@elgato/streamdeck` SDK v2, `@elgato/cli`, TypeScript, Rollup, Node.js v20+

**Spec:** `docs/superpowers/specs/2026-04-13-streamdeck-plugin-design.md`

---

## File Structure

```
~/streamdeck-the-lab/
  com.thelab.toolkit.sdPlugin/
    manifest.json
    imgs/
      plugin-icon.png          (256x256)
      plugin-icon@2x.png       (512x512)
      actions/
        scene.png              (20x20)
        scene@2x.png           (40x40)
        clip.png / @2x
        bug.png / @2x
        experiment.png / @2x
        todo.png / @2x
        compile-pray.png / @2x
        roulette.png / @2x
        milestone.png / @2x
    ui/
      scene.html
      clip.html
      bug.html
      experiment.html
      todo.html
      milestone.html
  src/
    plugin.ts                  -- Entry point, registers all actions, starts WS client
    lib/
      api.ts                   -- HTTP client (fetch wrapper with auth)
      ws-client.ts             -- WebSocket client (connect, reconnect, event dispatch)
      global-settings.ts       -- Global settings type + helpers
    actions/
      scene.ts
      clip.ts
      bug.ts
      experiment.ts
      todo.ts
      compile-pray.ts
      roulette.ts
      milestone.ts
  package.json
  tsconfig.json
  rollup.config.mjs
```

---

### Task 1: Scaffold the project

**Files:**
- Create: `~/streamdeck-the-lab/` (entire project scaffold)

- [ ] **Step 1: Install the Elgato CLI globally**

```bash
npm install -g @elgato/cli@latest
```

- [ ] **Step 2: Create the project**

```bash
mkdir ~/streamdeck-the-lab && cd ~/streamdeck-the-lab
streamdeck create
```

Follow the wizard:
- Name: `The Lab Toolkit`
- UUID: `com.thelab.toolkit`
- Author: `nilsBit`
- Description: `Stream Toolkit for GameDev Streaming`
- Create one default action (we'll replace it)

- [ ] **Step 3: Verify the scaffold builds**

```bash
cd ~/streamdeck-the-lab
npm install
npm run build
```

Expected: builds without errors, `com.thelab.toolkit.sdPlugin/bin/plugin.js` exists.

- [ ] **Step 4: Init git and commit**

```bash
cd ~/streamdeck-the-lab
git init
echo "node_modules/" > .gitignore
echo "com.thelab.toolkit.sdPlugin/logs/" >> .gitignore
git add -A
git commit -m "chore: scaffold Stream Deck plugin project"
```

---

### Task 2: Global settings & shared libraries

**Files:**
- Create: `src/lib/global-settings.ts`
- Create: `src/lib/api.ts`
- Create: `src/lib/ws-client.ts`

- [ ] **Step 1: Create global settings type**

```typescript
// src/lib/global-settings.ts
export type GlobalSettings = {
  apiToken: string;
  host: string;
  port: number;
};

export const DEFAULT_SETTINGS: GlobalSettings = {
  apiToken: '',
  host: 'localhost',
  port: 4000,
};

export function getBaseUrl(settings: GlobalSettings): string {
  return `http://${settings.host || 'localhost'}:${settings.port || 4000}`;
}

export function getWsUrl(settings: GlobalSettings): string {
  return `ws://${settings.host || 'localhost'}:${settings.port || 4000}?overlay=1`;
}
```

- [ ] **Step 2: Create HTTP API client**

```typescript
// src/lib/api.ts
import { GlobalSettings, getBaseUrl } from './global-settings';

let currentSettings: GlobalSettings = { apiToken: '', host: 'localhost', port: 4000 };

export function updateApiSettings(settings: GlobalSettings) {
  currentSettings = settings;
}

export async function apiGet(path: string): Promise<unknown> {
  const url = `${getBaseUrl(currentSettings)}${path}`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${currentSettings.apiToken}` },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  return res.json();
}

export async function apiPost(path: string, body: unknown): Promise<unknown> {
  const url = `${getBaseUrl(currentSettings)}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${currentSettings.apiToken}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  return res.json();
}

export async function apiPatch(path: string, body: unknown): Promise<unknown> {
  const url = `${getBaseUrl(currentSettings)}${path}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${currentSettings.apiToken}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  return res.json();
}

export async function apiDelete(path: string): Promise<unknown> {
  const url = `${getBaseUrl(currentSettings)}${path}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${currentSettings.apiToken}` },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  return res.json();
}
```

- [ ] **Step 3: Create WebSocket client**

```typescript
// src/lib/ws-client.ts
import WebSocket from 'ws';
import { GlobalSettings, getWsUrl } from './global-settings';

type EventHandler = (event: string, data: unknown) => void;

let ws: WebSocket | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let currentSettings: GlobalSettings = { apiToken: '', host: 'localhost', port: 4000 };
let connected = false;
const handlers: Set<EventHandler> = new Set();

export function updateWsSettings(settings: GlobalSettings) {
  currentSettings = settings;
}

export function onEvent(handler: EventHandler) {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

export function isConnected(): boolean {
  return connected;
}

export function connectWs() {
  if (ws) return;
  if (!currentSettings.apiToken) return;

  const url = getWsUrl(currentSettings);

  try {
    ws = new WebSocket(url);
  } catch {
    scheduleReconnect();
    return;
  }

  ws.on('open', () => {
    connected = true;
    handlers.forEach((h) => h('_connected', null));
  });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.event) {
        handlers.forEach((h) => h(msg.event, msg.data));
      }
    } catch {}
  });

  ws.on('close', () => {
    connected = false;
    ws = null;
    handlers.forEach((h) => h('_disconnected', null));
    scheduleReconnect();
  });

  ws.on('error', () => {
    ws?.close();
  });
}

export function disconnectWs() {
  if (reconnectTimeout) clearTimeout(reconnectTimeout);
  if (ws) {
    ws.close();
    ws = null;
  }
  connected = false;
}

function scheduleReconnect() {
  if (reconnectTimeout) clearTimeout(reconnectTimeout);
  reconnectTimeout = setTimeout(() => {
    ws = null;
    connectWs();
  }, 5000);
}
```

- [ ] **Step 4: Build and verify**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/
git commit -m "feat: add shared libraries (API client, WebSocket client, global settings)"
```

---

### Task 3: Plugin entry point and manifest

**Files:**
- Modify: `src/plugin.ts`
- Modify: `com.thelab.toolkit.sdPlugin/manifest.json`

- [ ] **Step 1: Write the plugin entry point**

```typescript
// src/plugin.ts
import streamDeck, { LogLevel } from '@elgato/streamdeck';
import { updateApiSettings, updateWsSettings } from './lib/api';
import { connectWs, disconnectWs, updateWsSettings as updateWs } from './lib/ws-client';
import { GlobalSettings, DEFAULT_SETTINGS } from './lib/global-settings';

import { SceneAction } from './actions/scene';
import { ClipAction } from './actions/clip';
import { BugAction } from './actions/bug';
import { ExperimentAction } from './actions/experiment';
import { TodoAction } from './actions/todo';
import { CompilePrayAction } from './actions/compile-pray';
import { RouletteAction } from './actions/roulette';
import { MilestoneAction } from './actions/milestone';

streamDeck.logger.setLevel(LogLevel.DEBUG);

// Register all actions
streamDeck.actions.registerAction(new SceneAction());
streamDeck.actions.registerAction(new ClipAction());
streamDeck.actions.registerAction(new BugAction());
streamDeck.actions.registerAction(new ExperimentAction());
streamDeck.actions.registerAction(new TodoAction());
streamDeck.actions.registerAction(new CompilePrayAction());
streamDeck.actions.registerAction(new RouletteAction());
streamDeck.actions.registerAction(new MilestoneAction());

// Handle global settings changes
streamDeck.settings.onDidReceiveGlobalSettings<GlobalSettings>((ev) => {
  const settings = { ...DEFAULT_SETTINGS, ...ev.settings };
  updateApiSettings(settings);
  updateWs(settings);
  disconnectWs();
  connectWs();
});

// Initial global settings load
(async () => {
  const settings = await streamDeck.settings.getGlobalSettings<GlobalSettings>();
  const merged = { ...DEFAULT_SETTINGS, ...settings };
  updateApiSettings(merged);
  updateWs(merged);
  connectWs();
})();

streamDeck.connect();
```

- [ ] **Step 2: Write the manifest.json**

Replace the scaffold manifest with the full manifest containing all 8 actions. Each action follows the pattern from the spec with UUID `com.thelab.toolkit.<action>`, Name, Icon path, PropertyInspectorPath, Controllers `["Keypad"]`, one State with ShowTitle true.

- [ ] **Step 3: Build and verify**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/plugin.ts com.thelab.toolkit.sdPlugin/manifest.json
git commit -m "feat: plugin entry point with all 8 actions registered"
```

---

### Task 4: Scene action

**Files:**
- Create: `src/actions/scene.ts`
- Create: `com.thelab.toolkit.sdPlugin/ui/scene.html`

- [ ] **Step 1: Implement the scene action**

```typescript
// src/actions/scene.ts
import { action, KeyDownEvent, SingletonAction, WillAppearEvent } from '@elgato/streamdeck';
import { apiPost } from '../lib/api';
import { onEvent, isConnected } from '../lib/ws-client';

type SceneSettings = { sceneName: string };

@action({ UUID: 'com.thelab.toolkit.scene' })
export class SceneAction extends SingletonAction<SceneSettings> {
  private currentScene = '';

  constructor() {
    super();
    onEvent((event, data) => {
      if (event === 'obs-scene-changed') {
        this.currentScene = (data as { scene: string })?.scene || '';
        this.updateAllTitles();
      }
      if (event === '_disconnected') this.setOffline();
      if (event === '_connected') this.updateAllTitles();
    });
  }

  override onWillAppear(ev: WillAppearEvent<SceneSettings>): void {
    if (!isConnected()) {
      ev.action.setTitle('OFFLINE');
    } else {
      ev.action.setTitle(this.currentScene || 'Scene');
    }
  }

  override async onKeyDown(ev: KeyDownEvent<SceneSettings>): Promise<void> {
    const scene = ev.payload.settings.sceneName;
    if (!scene) { await ev.action.showAlert(); return; }
    try {
      await apiPost('/api/obs/scene', { scene });
      await ev.action.showOk();
    } catch {
      await ev.action.showAlert();
    }
  }

  private updateAllTitles() {
    for (const a of this.actions) {
      a.setTitle(this.currentScene || 'Scene');
    }
  }

  private setOffline() {
    for (const a of this.actions) {
      a.setTitle('OFFLINE');
    }
  }
}
```

- [ ] **Step 2: Create the Property Inspector**

```html
<!-- com.thelab.toolkit.sdPlugin/ui/scene.html -->
<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<script src="sdpi-components.js"></script>
</head><body>
<sdpi-item label="Scene Name">
  <sdpi-textfield setting="sceneName" placeholder="z.B. Gameplay"></sdpi-textfield>
</sdpi-item>
</body></html>
```

- [ ] **Step 3: Build and verify**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/actions/scene.ts com.thelab.toolkit.sdPlugin/ui/scene.html
git commit -m "feat: add Scene Switch action"
```

---

### Task 5: Clip action

**Files:**
- Create: `src/actions/clip.ts`
- Create: `com.thelab.toolkit.sdPlugin/ui/clip.html`

- [ ] **Step 1: Implement the clip action**

Same pattern as scene. On keyDown: `POST /api/clips` with `{ tag: settings.tag, session_date: new Date().toISOString().split('T')[0] }`. On `clip-created` event: increment internal counter and show on title (e.g. "3 Clips"). On `_connected`: fetch `GET /api/clips?session_date=today` for initial count.

- [ ] **Step 2: Create Property Inspector** with `tag` textfield (default: "highlight")

- [ ] **Step 3: Build and commit**

```bash
git commit -m "feat: add Clip action"
```

---

### Task 6: Bug action

**Files:**
- Create: `src/actions/bug.ts`
- Create: `com.thelab.toolkit.sdPlugin/ui/bug.html`

- [ ] **Step 1: Implement the bug action**

On keyDown: `POST /api/bugs` with `{ title: settings.bugTitle || 'Stream Bug' }`. Listen to `bug-created`, `bug-updated`, `bug-deleted` events. On `_connected`: fetch `GET /public/bugs`, count where status='open'. Display count on title (e.g. "3 Bugs").

- [ ] **Step 2: Create Property Inspector** with `bugTitle` textfield

- [ ] **Step 3: Build and commit**

```bash
git commit -m "feat: add Bug action"
```

---

### Task 7: Experiment action

**Files:**
- Create: `src/actions/experiment.ts`
- Create: `com.thelab.toolkit.sdPlugin/ui/experiment.html`

- [ ] **Step 1: Implement the experiment action**

On keyDown: `PATCH /api/stream-state` with `{ experiment_status: settings.action }` where action is 'in_progress', 'done', 'failed', or 'idle'. Listen to `stream-state` events. Show status emoji + title on button (e.g. "🔴 My Exp"). On `_connected`: fetch `GET /public/stream-state`.

- [ ] **Step 2: Create Property Inspector** with `action` select dropdown (start/stop/done/fail)

- [ ] **Step 3: Build and commit**

```bash
git commit -m "feat: add Experiment action"
```

---

### Task 8: Todo action

**Files:**
- Create: `src/actions/todo.ts`
- Create: `com.thelab.toolkit.sdPlugin/ui/todo.html`

- [ ] **Step 1: Implement the todo action**

On keyDown: if todoId is "next", fetch `GET /public/todos`, find first with done=0, then `PATCH /api/todos/:id` with `{ done: 1 }`. Otherwise patch the specific ID. Listen to `todo-*` events. Show open count on title. On `_connected`: fetch `GET /public/todos`.

- [ ] **Step 2: Create Property Inspector** with `todoId` textfield (placeholder: "next")

- [ ] **Step 3: Build and commit**

```bash
git commit -m "feat: add Todo action"
```

---

### Task 9: Compile Pray action

**Files:**
- Create: `src/actions/compile-pray.ts`

- [ ] **Step 1: Implement the compile pray action**

Simplest action — no settings, no PI. On keyDown: `POST /api/actions/compile-pray`. Show `showOk()` on success. Listen to `compile-pray` event and briefly flash the title to "🙏" for 2 seconds, then reset to "Compile".

- [ ] **Step 2: Build and commit**

```bash
git commit -m "feat: add Compile Pray action"
```

---

### Task 10: Roulette action

**Files:**
- Create: `src/actions/roulette.ts`

- [ ] **Step 1: Implement the roulette action**

No PI needed. On keyDown: `POST /api/actions/roulette`. Listen to `roulette-spin` → show "🎰..." on title. Listen to `roulette-result` → show winner name for 3 seconds, then reset to "Roulette".

- [ ] **Step 2: Build and commit**

```bash
git commit -m "feat: add Roulette action"
```

---

### Task 11: Milestone action

**Files:**
- Create: `src/actions/milestone.ts`
- Create: `com.thelab.toolkit.sdPlugin/ui/milestone.html`

- [ ] **Step 1: Implement the milestone action**

On keyDown: if milestoneId is "next", fetch milestones, find first pending, then `PATCH /api/milestones/:id` with `{ status: 'completed' }`. Listen to `milestone-trigger` events. Show pending count on title. On `_connected`: fetch `GET /api/milestones`.

- [ ] **Step 2: Create Property Inspector** with `milestoneId` textfield (placeholder: "next")

- [ ] **Step 3: Build and commit**

```bash
git commit -m "feat: add Milestone action"
```

---

### Task 12: Placeholder icons

**Files:**
- Create: `com.thelab.toolkit.sdPlugin/imgs/` (all icon files)

- [ ] **Step 1: Generate simple placeholder icons**

Create minimal SVG-based PNG icons for each action (can be replaced with proper pixel-art icons later). Each needs 20x20 and 40x40 (@2x). Plugin icon needs 256x256 and 512x512 (@2x).

Use a simple script or tool to generate colored squares with a letter:
- Scene: 🎬 (blue)
- Clip: ✂️ (green)
- Bug: 🐛 (red)
- Experiment: 🧪 (orange)
- Todo: ✅ (teal)
- Compile: 🙏 (purple)
- Roulette: 🎰 (gold)
- Milestone: 🏆 (yellow)

- [ ] **Step 2: Commit**

```bash
git add com.thelab.toolkit.sdPlugin/imgs/
git commit -m "feat: add placeholder action icons"
```

---

### Task 13: Link, test, and validate

- [ ] **Step 1: Build the full plugin**

```bash
cd ~/streamdeck-the-lab
npm run build
```

- [ ] **Step 2: Link to Stream Deck for testing**

```bash
streamdeck link
```

Expected: Plugin appears in Stream Deck app under "The Lab" category.

- [ ] **Step 3: Test each button**

1. Add a Scene button — configure scene name — press — verify OBS switches
2. Add a Clip button — press — verify clip appears in toolkit
3. Add a Bug button — press — verify bug created
4. Repeat for all 8 actions
5. Verify live status updates on buttons (change something in toolkit, see button title update)

- [ ] **Step 4: Test error handling**

1. Stop stream-toolkit → all buttons should show "OFFLINE"
2. Start stream-toolkit → buttons reconnect and show live data
3. Set wrong API token → buttons should show "AUTH" or fail gracefully

- [ ] **Step 5: Validate and package**

```bash
streamdeck validate
streamdeck pack
```

Expected: creates `.streamDeckPlugin` installer file.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: complete Stream Deck plugin v1.0"
```

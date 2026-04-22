# Plugin behavior reference (decoded from pre-rebuild ZIP)

Source: `bin/plugin.js` from `assets/com.thelab.toolkit.streamDeckPlugin` at commit 68edcdd.
Decoded via `npx prettier --write` then manual reading. All 8 actions are `SingletonAction` subclasses registered with `streamDeck.actions.registerAction`.

---

## Global helpers (from `plugin.js` lines 8138–8240)

```js
// Defaults when global settings are not yet set
const DEFAULT_SETTINGS = { apiToken: "", host: "localhost", port: 4000 };

// HTTP base URL construction
function getBaseUrl(settings) {
  return `http://${settings.host || "localhost"}:${settings.port || 4000}`;
}

// All requests go through this single function
async function request(method, path, body) {
  const url = `${getBaseUrl(currentSettings$1)}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${currentSettings$1.apiToken}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  return res.json();
}
const apiGet  = (path)       => request("GET",   path);
const apiPost = (path, body) => request("POST",  path, body);
const apiPatch= (path, body) => request("PATCH", path, body);
```

**Auth:** Every request carries `Authorization: Bearer {globalSettings.apiToken}`. The `apiToken` comes from Elgato `getGlobalSettings`. If unset, an empty string is sent and the backend returns 401.

---

## Actions

### `com.thelab.toolkit.scene`

| Field | Value |
|-------|-------|
| **HTTP method** | `POST` |
| **Path (plugin.js)** | `/api/obs/scene` |
| **Path (current backend)** | `/api/obs/scene` — matches |
| **Body** | `{ "scene": settings.sceneName }` |
| **On key press, no scene set** | `ev.action.showAlert()` immediately |
| **On success** | `ev.action.showOk()` |
| **On failure** | `ev.action.showAlert()` |
| **Title (connected)** | Current scene name from WS event, or `"Scene"` if not yet received |
| **Title (offline)** | `"OFFLINE"` |
| **WS subscription** | Listens to `obs-scene-changed` → updates `this.currentScene`, calls `updateAll()` |

**Original logic (verbatim):**
```js
async onKeyDown(ev) {
  const scene = ev.payload.settings.sceneName;
  if (!scene) {
    await ev.action.showAlert();
    return;
  }
  try {
    await apiPost("/api/obs/scene", { scene });
    await ev.action.showOk();
  } catch {
    await ev.action.showAlert();
  }
}
```

**Backend notes:** `POST /api/obs/scene` expects `{ scene: string }`, returns `{ success: true, scene }` or `400`. Confirmed in `src/server/api/obs.ts`.

---

### `com.thelab.toolkit.clip`

| Field | Value |
|-------|-------|
| **HTTP method** | `POST` |
| **Path (plugin.js)** | `/api/clips` |
| **Path (current backend)** | `/api/clips` — matches |
| **Body** | `{ "tag": settings.tag \|\| "highlight", "session_date": new Date().toISOString().split("T")[0] }` |
| **On success** | `ev.action.showOk()` |
| **On failure** | `ev.action.showAlert()` |
| **Title (connected)** | `"N Clips"` — count of clips for today |
| **Title (offline)** | `"OFFLINE"` |
| **WS subscription** | Listens to `clip-created` → increments local `clipCount`, calls `updateAll()` |
| **Initial fetch** | On `_connected`: `GET /api/clips`, filters client-side by `c.session_date === today` |

**Original logic (verbatim):**
```js
async onKeyDown(ev) {
  const tag = ev.payload.settings.tag || "highlight";
  const sessionDate = new Date().toISOString().split("T")[0];
  try {
    await apiPost("/api/clips", { tag, session_date: sessionDate });
    await ev.action.showOk();
  } catch {
    await ev.action.showAlert();
  }
}
async fetchCount() {
  try {
    const data = await apiGet("/api/clips");
    const today = new Date().toISOString().split("T")[0];
    this.clipCount = data.filter((c) => c.session_date === today).length;
    this.updateAll();
  } catch {}
}
```

**Backend notes:**
- `POST /api/clips` body: current backend accepts `{ tag, note }` — `session_date` in plugin body is ignored server-side (server derives it internally). Use `{ tag }` in rebuild; `session_date` is harmless but redundant.
- `GET /api/clips` accepts optional `?session_date=` query param — rebuild could use `?session_date=today` to avoid client-side filtering. Either approach works.

---

### `com.thelab.toolkit.bug`

| Field | Value |
|-------|-------|
| **HTTP method** | `POST` |
| **Path (plugin.js)** | `/api/bugs` |
| **Path (current backend)** | `/api/issues` — **MISMATCH** (see below) |
| **Body** | `{ "title": settings.bugTitle \|\| "Stream Bug" }` |
| **On success** | `ev.action.showOk()` |
| **On failure** | `ev.action.showAlert()` |
| **Title (connected)** | `"N Bugs"` — count of open bugs |
| **Title (offline)** | `"OFFLINE"` |
| **WS subscription** | Listens to `bug-created`, `bug-updated`, `bug-deleted` → calls `fetchCount()` |
| **Count fetch (plugin.js)** | `GET /public/bugs`, filters `b.status === "open"` |
| **Count fetch (current backend)** | Use `GET /public/issues` — **MISMATCH** (see below) |

**Original logic (verbatim):**
```js
async onKeyDown(ev) {
  const title = ev.payload.settings.bugTitle || "Stream Bug";
  try {
    await apiPost("/api/bugs", { title });
    await ev.action.showOk();
  } catch {
    await ev.action.showAlert();
  }
}
async fetchCount() {
  try {
    const bugs = await apiGet("/public/bugs");
    this.openCount = bugs.filter((b) => b.status === "open").length;
    this.updateAll();
  } catch {}
}
```

**Backend discrepancies:**
1. **POST path:** plugin.js used `/api/bugs` — current backend exposes issues at `/api/issues`. Use `/api/issues` in rebuild.
2. **GET path:** plugin.js used `/public/bugs` — current backend exposes `/public/issues`. Use `/public/issues` in rebuild.
3. **WS events:** plugin.js listened to `bug-created/updated/deleted` — current backend broadcasts `issue-created`, `issue-updated`, `issue-deleted`. Use `issue-*` in rebuild.
4. **Body field:** matches — current backend `POST /api/issues` expects `{ title, description? }`.

---

### `com.thelab.toolkit.experiment`

| Field | Value |
|-------|-------|
| **HTTP method** | `PATCH` |
| **Path (plugin.js)** | `/api/stream-state` |
| **Path (current backend)** | `/api/stream-state` — matches |
| **Body (plugin.js)** | `{ "experiment_status": settings.action \|\| "in_progress" }` |
| **Body (current backend)** | `{ "challenge_status": ... }` — **MISMATCH** (see below) |
| **On success** | `ev.action.showOk()` |
| **On failure** | `ev.action.showAlert()` |
| **Title (connected)** | `"EMOJI TITLE[:8]"` or `"EMOJI Exp"` |
| **Title (offline)** | `"OFFLINE"` |
| **WS subscription** | Listens to `stream-state` → reads `data.experiment_status` + `data.experiment_title` |
| **Count fetch** | On `_connected`: `GET /public/stream-state` |

**Status emoji map:**
```js
const STATUS_EMOJI = {
  idle:        "⏸️",
  in_progress: "🔴",
  done:        "🟢",
  failed:      "❌",
};
```

**Display logic:**
```js
getDisplay() {
  const emoji = STATUS_EMOJI[this.status] || "⏸️";
  return this.title
    ? `${emoji} ${this.title.substring(0, 8)}`
    : `${emoji} Exp`;
}
```

**Key press logic:**
```js
async onKeyDown(ev) {
  const targetStatus = ev.payload.settings.action || "in_progress";
  try {
    await apiPatch("/api/stream-state", { experiment_status: targetStatus });
    await ev.action.showOk();
  } catch {
    await ev.action.showAlert();
  }
}
```

**Backend discrepancies:**
1. **PATCH body field:** plugin.js sends `experiment_status` — current backend column is `challenge_status` (renamed in migration `src/server/db/index.ts`). Use `challenge_status` in rebuild.
2. **PATCH body field:** plugin.js reads `experiment_title` from WS/public — current backend column is `challenge_title`. Use `challenge_title` in rebuild.
3. **Valid values:** `idle | in_progress | done | failed` — confirmed in `src/shared/types.ts` as `VALID_CHALLENGE_STATUS`.
4. **PI `action` setting values:** PI ships `running/success/failed/idle` — map `running` → `in_progress`, `success` → `done` in rebuild (or update PI).

---

### `com.thelab.toolkit.todo`

| Field | Value |
|-------|-------|
| **HTTP method** | `PATCH` |
| **Path (plugin.js)** | `/api/todos/:id` |
| **Path (current backend)** | `/api/progress/todos/:id` — **MISMATCH** (see below) |
| **Body** | `{ "done": 1 }` |
| **On success** | `ev.action.showOk()` |
| **On failure** | `ev.action.showAlert()` |
| **Title (connected)** | `"N Todos"` — count of todos where `done === 0` |
| **Title (offline)** | `"OFFLINE"` |
| **WS subscription** | Listens to any event matching `event.startsWith("todo-")` or `"todos-cleared"` → `fetchCount()` |
| **Count fetch** | `GET /public/todos`, filters `t.done === 0` |
| **Setting** | `todoId` — `"next"` (complete first undone) or numeric string ID |

**Original logic (verbatim):**
```js
async onKeyDown(ev) {
  const todoId = ev.payload.settings.todoId || "next";
  try {
    if (todoId === "next") {
      const todos = await apiGet("/public/todos");
      const next = todos.find((t) => t.done === 0);
      if (!next) {
        await ev.action.showAlert();
        return;
      }
      await apiPatch(`/api/todos/${next.id}`, { done: 1 });
    } else {
      await apiPatch(`/api/todos/${todoId}`, { done: 1 });
    }
    await ev.action.showOk();
  } catch {
    await ev.action.showAlert();
  }
}
async fetchCount() {
  try {
    const todos = await apiGet("/public/todos");
    this.openCount = todos.filter((t) => t.done === 0).length;
    this.updateAll();
  } catch {}
}
```

**Backend discrepancies:**
1. **PATCH path:** plugin.js used `/api/todos/:id` — current backend has todos under `/api/progress/todos/:id`. Use `/api/progress/todos/:id` in rebuild.
2. **GET path for list:** plugin.js used `/public/todos` — current backend has no `/public/todos` route. Use `GET /api/progress` and extract todos from the items array, or use `GET /public/progress` (no-auth endpoint). The progress response includes `items[].todos[]` arrays. Rebuild must adapt the "find next undone todo" logic accordingly.
3. **WS events:** plugin.js listened to `todo-*` — current backend broadcasts `progress-update` with `action: "todo-created"/"todo-updated"/"todo-deleted"`. Listen for `progress-update` and trigger a count refresh.
4. **`todos-cleared` event:** Does not exist in current backend. Ignore in rebuild.

---

### `com.thelab.toolkit.compile-pray`

| Field | Value |
|-------|-------|
| **HTTP method** | `POST` |
| **Path (plugin.js)** | `/api/actions/compile-pray` |
| **Path (current backend)** | `/api/actions/compile-pray` — matches |
| **Body** | `{}` (empty object) |
| **On success** | `ev.action.showOk()` |
| **On failure** | `ev.action.showAlert()` |
| **Title (connected, idle)** | `"Compile"` |
| **Title (offline)** | `"OFFLINE"` |
| **WS reaction** | On `compile-pray` event: sets title to `"🙏"`, then after 2000ms resets to `"Compile"` |

**WS reaction logic (verbatim):**
```js
onEvent((event) => {
  if (event === "compile-pray") {
    for (const a of this.actions) {
      a.setTitle("🙏");
      setTimeout(() => a.setTitle("Compile"), 2000);
    }
  }
  if (event === "_disconnected") {
    for (const a of this.actions) a.setTitle("OFFLINE");
  }
  if (event === "_connected") {
    for (const a of this.actions) a.setTitle("Compile");
  }
});
```

**Backend notes:** `POST /api/actions/compile-pray` broadcasts `compile-pray` with `{ timestamp }` and returns `{ triggered: true }`. Confirmed in `src/server/api/actions.ts`.

---

### `com.thelab.toolkit.roulette`

| Field | Value |
|-------|-------|
| **HTTP method** | `POST` |
| **Path (plugin.js)** | `/api/actions/roulette` |
| **Path (current backend)** | `/api/actions/roulette` — matches |
| **Body** | `{}` (empty object) |
| **On success** | `ev.action.showOk()` |
| **On failure** | `ev.action.showAlert()` (also fires on 429 cooldown response) |
| **Title (connected, idle)** | `"Roulette"` |
| **Title (offline)** | `"OFFLINE"` |
| **WS reaction: roulette-spin** | Sets title to `"🎰..."` |
| **WS reaction: roulette-result** | Sets title to `result.title.substring(0, 10)`, then after 3000ms resets to `"Roulette"` |

**Cooldown:** Enforced **server-side only** (in-memory, not persisted). Duration: **60 000ms (1 minute)**, defined as `const ROULETTE_COOLDOWN_MS = 60_000` in `src/server/api/actions.ts`. The plugin.js has **no client-side cooldown logic** — it simply fires the request and shows `showAlert()` when the server returns 429.

**WS reaction logic (verbatim):**
```js
onEvent((event, data) => {
  if (event === "roulette-spin") {
    for (const a of this.actions) a.setTitle("🎰...");
  }
  if (event === "roulette-result") {
    const result = data;
    const title = result?.title || "Done!";
    for (const a of this.actions) {
      a.setTitle(title.substring(0, 10));
      setTimeout(() => a.setTitle("Roulette"), 3000);
    }
  }
  if (event === "_disconnected") {
    for (const a of this.actions) a.setTitle("OFFLINE");
  }
  if (event === "_connected") {
    for (const a of this.actions) a.setTitle("Roulette");
  }
});
```

**Backend notes:** Backend also broadcasts `roulette-cooldown` event after each spin, but plugin.js does not consume it.

---

### `com.thelab.toolkit.milestone`

| Field | Value |
|-------|-------|
| **HTTP method** | `PATCH` |
| **Path (plugin.js)** | `/api/milestones/:id` |
| **Path (current backend)** | `/api/milestones/:id` — matches |
| **Body** | `{ "status": "completed" }` |
| **On success** | `ev.action.showOk()` |
| **On failure** | `ev.action.showAlert()` (including when no pending milestone found) |
| **Title (connected)** | `"N MS"` — count of milestones where `status === "pending"` |
| **Title (offline)** | `"OFFLINE"` |
| **WS subscription** | Listens to `milestone-trigger`, `milestone-created`, `milestone-updated`, `milestone-deleted` → `fetchCount()` |
| **Setting** | `milestoneId` — `"next"` (complete first pending) or numeric string ID |
| **Count fetch** | `GET /api/milestones`, filters `m.status === "pending"` |

**Original logic (verbatim):**
```js
async onKeyDown(ev) {
  const milestoneId = ev.payload.settings.milestoneId || "next";
  try {
    if (milestoneId === "next") {
      const milestones = await apiGet("/api/milestones");
      const next = milestones.find((m) => m.status === "pending");
      if (!next) {
        await ev.action.showAlert();
        return;
      }
      await apiPatch(`/api/milestones/${next.id}`, { status: "completed" });
    } else {
      await apiPatch(`/api/milestones/${milestoneId}`, { status: "completed" });
    }
    await ev.action.showOk();
  } catch {
    await ev.action.showAlert();
  }
}
```

**Backend notes:** `PATCH /api/milestones/:id` with `{ status: "completed" }` triggers the achievement overlay broadcast, optionally announces in chat, and sets `completed_at`. Confirmed in `src/server/api/milestones.ts`.

---

## Globals

- `host`, `port`, `apiToken` — sourced from Elgato `getGlobalSettings`.
- Defaults when unset: `host="localhost"`, `port=4000`, `apiToken=""`.
- If `apiToken` is empty, the WS connection is **not opened at all** (`connectWs` returns early). All buttons show `"OFFLINE"`.
- If `apiToken` is set but wrong, the backend closes the WS with code 4001 (`Unauthorized`), triggering a reconnect loop (5 000ms interval via `scheduleReconnect`).
- Settings are applied via `applySettings()` which calls `disconnectWs()` + `connectWs()` — any settings change triggers a full WS reconnect.

---

## WS

**URL:** `ws://{host}:{port}?overlay=1`

The plugin connects as an **overlay client** (`?overlay=1`), which the backend (`src/server/websocket/index.ts`) treats as read-only and does **not** require a token. This means the plugin receives all WS broadcasts but is not in `authenticatedClients`.

> **Note:** The plugin uses `?overlay=1` (not `?token={apiToken}`). If the backend ever restricts overlay connections, this will break. For the rebuild, keep `?overlay=1` to match shipped behavior.

**Reconnect:** 5 000ms delay after disconnect, via `setTimeout` in `scheduleReconnect`. No exponential backoff.

**Message format (received):** `{ event: string, data: unknown }` — JSON, parsed in the `message` event listener.

**WS events consumed by bug action:**
- plugin.js: `bug-created`, `bug-updated`, `bug-deleted`
- Current backend emits: `issue-created`, `issue-updated`, `issue-deleted`
- **Rebuild must use `issue-*` events.**

**All WS events consumed by any action:**

| Event (plugin.js) | Event (current backend) | Consumer |
|---|---|---|
| `obs-scene-changed` | `obs-scene-changed` | scene |
| `clip-created` | `clip-created` | clip |
| `bug-created` | `issue-created` | bug |
| `bug-updated` | `issue-updated` | bug |
| `bug-deleted` | `issue-deleted` | bug |
| `stream-state` | `stream-state` | experiment |
| `todo-*` (startsWith) | `progress-update` (action: `todo-*`) | todo |
| `todos-cleared` | _(does not exist)_ | todo |
| `compile-pray` | `compile-pray` | compile-pray |
| `roulette-spin` | `roulette-spin` | roulette |
| `roulette-result` | `roulette-result` | roulette |
| `milestone-trigger` | `milestone-trigger` | milestone |
| `milestone-created` | `milestone-created` | milestone |
| `milestone-updated` | `milestone-updated` | milestone |
| `milestone-deleted` | `milestone-deleted` | milestone |

---

## Cooldown

- **Only `roulette`** has a cooldown.
- **Duration:** 60 000ms (1 minute), constant `ROULETTE_COOLDOWN_MS = 60_000` in `src/server/api/actions.ts`.
- **Persisted:** No. In-memory variable `rouletteCooldownUntil` — resets on server restart.
- **Enforcement:** Server-side only. Returns HTTP 429 with `{ error: "...", remaining_seconds: N }`.
- **Plugin behavior:** No client-side cooldown tracking. Plugin sends the request; on 429, `catch {}` block fires `showAlert()`. That is the only visual feedback for "on cooldown".

---

## Summary of all backend discrepancies

| Action | plugin.js path/field | Current backend path/field | Use in rebuild |
|--------|---------------------|---------------------------|----------------|
| bug — POST | `/api/bugs` | `/api/issues` | `/api/issues` |
| bug — GET count | `/public/bugs` | `/public/issues` | `/public/issues` |
| bug — WS events | `bug-created/updated/deleted` | `issue-created/updated/deleted` | `issue-*` |
| experiment — PATCH body | `experiment_status` | `challenge_status` | `challenge_status` |
| experiment — WS/GET field | `experiment_status/title` | `challenge_status/title` | `challenge_status`, `challenge_title` |
| experiment — PI setting | `action: "running"/"success"` | n/a | Map `running`→`in_progress`, `success`→`done` |
| todo — PATCH | `/api/todos/:id` | `/api/progress/todos/:id` | `/api/progress/todos/:id` |
| todo — GET list | `/public/todos` | no route; use `/public/progress` | extract from `/public/progress`.items[].todos |
| todo — WS events | `todo-*`, `todos-cleared` | `progress-update` | listen `progress-update`, ignore `todos-cleared` |
| clip — POST body | `{ tag, session_date }` | `{ tag, note? }` | `{ tag }` (session_date ignored server-side) |

# Stream Deck Plugin: "The Lab Toolkit"

## Overview

A native Elgato Stream Deck plugin that connects to the stream-toolkit Electron app. Provides buttons with live status display for all major toolkit actions.

## Architecture

```
Stream Deck <-> Plugin (Node.js, SD SDK v2) <-> stream-toolkit (localhost:4000)
                                                  |-- HTTP API (trigger actions)
                                                  |-- WebSocket (receive live status)
```

The plugin is a standalone project, separate from the stream-toolkit codebase. It communicates exclusively via the existing HTTP API and WebSocket interface — no changes to stream-toolkit are required.

## Communication

### HTTP API (Actions)

All action calls use the Fixed API Token for authentication:
- Header: `Authorization: Bearer <token>`
- Base URL: `http://<host>:<port>/api`

### WebSocket (Live Status)

- URL: `ws://<host>:<port>?overlay=1`
- Receives JSON messages: `{ event: string, data: unknown }`
- Auto-reconnect on disconnect (2s delay)

## Buttons (Actions)

| Action ID | Label | HTTP Call | Live Status Source | Status Display |
|---|---|---|---|---|
| `scene` | Scene | `POST /api/obs/scene` `{ scene }` | `obs-scene-changed` | Current scene name |
| `clip` | Clip | `POST /api/clips` `{ tag, session_date }` | `clip-created` | Session clip count |
| `bug` | Bug | `POST /api/bugs` `{ title }` | `bug-created`, `bug-updated`, `bug-deleted` | Open bug count |
| `experiment` | Experiment | `PATCH /api/stream-state` `{ experiment_status }` | `stream-state` | Status emoji + title |
| `todo` | Todo | `PATCH /api/todos/:id` `{ done: 1 }` | `todo-*` | Open todo count |
| `compile-pray` | Compile | `POST /api/actions/compile-pray` | `compile-pray` | Flash animation on trigger |
| `roulette` | Roulette | `POST /api/actions/roulette` | `roulette-spin`, `roulette-result` | Spinning indicator |
| `milestone` | Milestone | `PATCH /api/milestones/:id` `{ status: "completed" }` | `milestone-trigger` | Pending count |

## Global Settings

Configured once via a global Property Inspector:

| Setting | Default | Description |
|---|---|---|
| `apiToken` | (empty) | Fixed API token from stream-toolkit Settings |
| `host` | `localhost` | stream-toolkit host |
| `port` | `4000` | stream-toolkit port |

## Per-Button Settings (Property Inspector)

Each button type has its own configuration UI:

- **Scene**: `sceneName` — which OBS scene to switch to
- **Clip**: `tag` — default clip tag (e.g. "highlight", "bug", "funny")
- **Bug**: `bugTitle` — default bug title template
- **Experiment**: `action` — toggle between start/stop/reset
- **Todo**: `todoId` — which todo to mark done (or "next" for the first open one)
- **Compile Pray**: no extra settings
- **Roulette**: no extra settings
- **Milestone**: `milestoneId` — which milestone to complete (or "next" for the first pending one)

## Live Status Update Flow

1. Plugin starts -> connects WebSocket to `ws://host:port?overlay=1`
2. On connect: fetches initial state via HTTP (e.g. `GET /public/bugs` for bug count)
3. On WebSocket event: updates internal state and calls `setTitle()` / `setImage()` on the corresponding button
4. On disconnect: auto-reconnect after 2 seconds, show "offline" indicator on buttons

## Project Structure

```
streamdeck-the-lab/
  com.thelab.toolkit.sdPlugin/
    manifest.json          -- Plugin metadata, action definitions
    bin/
      plugin.js            -- Main plugin entry (Node.js)
      actions/
        scene.js
        clip.js
        bug.js
        experiment.js
        todo.js
        compile-pray.js
        roulette.js
        milestone.js
      lib/
        api.js             -- HTTP client (shared)
        ws-client.js        -- WebSocket client (shared)
        settings.js         -- Global settings manager
    property-inspector/
      global.html           -- Global settings UI (token, host, port)
      scene.html            -- Scene button settings
      clip.html             -- Clip button settings
      bug.html              -- Bug button settings
      experiment.html       -- Experiment button settings
      todo.html             -- Todo button settings
      milestone.html        -- Milestone button settings
    images/
      plugin-icon.png       -- Plugin icon (144x144)
      actions/
        scene.png           -- Button icons (72x72 + 144x144 @2x)
        clip.png
        bug.png
        experiment.png
        todo.png
        compile-pray.png
        roulette.png
        milestone.png
```

## manifest.json Key Fields

```json
{
  "SDKVersion": 2,
  "Software": { "MinimumVersion": "6.0" },
  "Name": "The Lab Toolkit",
  "Description": "Stream Toolkit for GameDev Streaming",
  "Category": "The Lab",
  "Author": "nilsBit",
  "CodePath": "bin/plugin.js",
  "Actions": [
    {
      "UUID": "com.thelab.toolkit.scene",
      "Name": "Scene Switch",
      "Tooltip": "Switch OBS scene",
      "PropertyInspectorPath": "property-inspector/scene.html",
      "Icon": "images/actions/scene",
      "States": [{ "Image": "images/actions/scene" }]
    }
  ]
}
```

Each action follows this pattern in the manifest.

## Error Handling

- **Connection lost**: Show "OFFLINE" on all buttons, auto-reconnect
- **API error**: Flash button red briefly, log error
- **Invalid token**: Show "AUTH" on buttons, prompt to check settings
- **stream-toolkit not running**: Show "OFFLINE", retry connection every 5 seconds

## Constraints

- No paid services or dependencies — fully free
- Plugin must work on macOS and Windows
- Elgato Stream Deck SDK v2 (Node.js based)
- No changes to the existing stream-toolkit codebase required

# Stream Deck Plugin — Design Spec

**Date:** 2026-04-13  
**Status:** Approved

## Overview

A native Elgato Stream Deck plugin for Stream Toolkit ("The Lab"). Built with the `@elgato/streamdeck` SDK, auto-installed by the Electron app with zero manual configuration.

---

## Architecture

```
streamdeck-plugin/                        ← standalone npm project at repo root
  package.json                            ← @elgato/streamdeck SDK dependency
  tsconfig.json
  src/
    plugin.ts                             ← plugin entry point
    actions/
      clip.ts                             ← handles all 5 clip tag buttons
      compile-pray.ts                     ← triggers compile & pray alert
      bug-roulette.ts                     ← spins bug roulette, shows cooldown
      obs-scene.ts                        ← switches OBS scene (configurable)
      stream-status.ts                    ← shows LIVE/OFFLINE status
      open-bugs.ts                        ← shows open bug count
    api.ts                                ← HTTP client → localhost:4000/api
    websocket.ts                          ← WebSocket subscriber → localhost:4000/ws
  ui/
    obs-scene.html                        ← Property Inspector: scene dropdown
    global.html                           ← Global settings (token, base URL)
  icons/                                  ← button icons per action
  com.nilsr.stream-toolkit.sdPlugin/      ← build output (copied on install)
```

**Data Flow:**
```
Stream Deck Software
  ↕ WebSocket (Elgato SDK protocol)
Plugin (Node.js, runs inside Stream Deck)
  ↕ HTTP POST   → localhost:4000/api/*   (trigger actions)
  ↕ WebSocket   → localhost:4000/ws      (receive live state updates)
```

---

## Actions

### Clip Buttons (5 — one per tag, fixed)

| Action ID | Tag | Icon | Behavior |
|-----------|-----|------|----------|
| `com.nilsr.stream-toolkit.clip.highlight` | highlight | ⭐ | POST `/api/clips` `{tag: "highlight"}` → flash green on success |
| `com.nilsr.stream-toolkit.clip.fail`      | fail      | 💀 | POST `/api/clips` `{tag: "fail"}` → flash green on success |
| `com.nilsr.stream-toolkit.clip.funny`     | funny     | 😂 | POST `/api/clips` `{tag: "funny"}` → flash green on success |
| `com.nilsr.stream-toolkit.clip.tutorial`  | tutorial  | 📚 | POST `/api/clips` `{tag: "tutorial"}` → flash green on success |
| `com.nilsr.stream-toolkit.clip.bug`       | bug       | 🐛 | POST `/api/clips` `{tag: "bug"}` → flash green on success |

No Property Inspector needed — tag is fixed per button.

### Stream Actions

| Action ID | Behavior | State Feedback |
|-----------|----------|----------------|
| `com.nilsr.stream-toolkit.compile-pray` | POST `/api/actions/compile-pray` | brief flash on press |
| `com.nilsr.stream-toolkit.bug-roulette` | POST `/api/actions/roulette` | button label shows "Cooldown" and dims during 1-min cooldown |
| `com.nilsr.stream-toolkit.obs-scene` | POST `/api/obs/scene` `{scene}` | Property Inspector: loads available scenes from `GET /api/obs/scenes`, renders dropdown |

### Status Buttons (read-only display)

| Action ID | Display | Update Trigger |
|-----------|---------|----------------|
| `com.nilsr.stream-toolkit.stream-status` | `LIVE` (green title) / `OFFLINE` (red title) | WebSocket `stream-state` event + HTTP on init |
| `com.nilsr.stream-toolkit.open-bugs` | `🐛 3` (count of open bugs) | WebSocket `bug-created`, `bug-updated`, `bug-deleted` + HTTP on init |

All status buttons fetch initial state via HTTP on plugin startup, then stay current via WebSocket events.

---

## Electron Integration

### New IPC Channel

`streamdeck:install` → `{success: boolean, message: string}`

### Installer (`src/main/streamdeck-installer.ts`)

1. Locate Stream Deck plugins folder: `%APPDATA%\Elgato\StreamDeck\Plugins\`
2. If folder doesn't exist → return error "Stream Deck software not found"
3. Copy `streamdeck-plugin/com.nilsr.stream-toolkit.sdPlugin/` to plugins folder
4. Write `config.json` into plugin folder: `{token, baseUrl: "http://localhost:4000/api"}`
5. Return `{success: true}`

The API token is read from the existing fixed token in the database (same token shown in Settings).

### Settings Panel Addition

New section in `SettingsPanel.tsx` below the existing "Stream Deck API Token" section:

```
Stream Deck Plugin
  Status: ● Installiert  /  ○ Nicht installiert
  [Plugin installieren / aktualisieren]  ← calls streamdeck:install IPC
```

Status is checked on panel load via a new IPC call `streamdeck:status` that checks if the plugin folder exists in the Stream Deck plugins directory.

---

## Build Integration

```jsonc
// package.json
"scripts": {
  "build:streamdeck": "cd streamdeck-plugin && npm run build",
  "build": "... && npm run build:streamdeck"
}
```

During `npm run dev`: plugin is NOT rebuilt automatically. Developer clicks "Plugin installieren" in Settings after making plugin changes to test them.

During `npm run build` (production): plugin is built first, then bundled with the Electron app so the install button always has up-to-date plugin files.

---

## Configuration

On install, the Electron app writes `config.json` into the plugin folder:

```json
{
  "token": "<fixed-api-token>",
  "baseUrl": "http://localhost:4000/api"
}
```

The plugin reads this file on startup. No manual token entry required in Stream Deck software.

---

## Error Handling

- **Stream Toolkit not running:** Plugin shows "Offline" state on all status buttons, retries HTTP requests every 10 seconds
- **Stream Deck software not found:** Installer returns user-friendly error in Settings
- **Clip POST fails:** Button flashes red instead of green
- **Bug Roulette on cooldown:** API returns 429, button shows cooldown state

---

## Out of Scope

- Publishing to Stream Deck Marketplace
- Multiple simultaneous Stream Toolkit instances
- Mobile Stream Deck support

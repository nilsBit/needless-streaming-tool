# Stream Deck Plugin — Source Rebuild Design Spec

**Date:** 2026-04-22
**Status:** Proposed

## Context

The shipped Stream Deck plugin (`assets/com.thelab.toolkit.streamDeckPlugin`, ~81 KB ZIP) is committed as a binary blob. Its source is not in any branch of this repo. Any change — dropdown in the Scene Property Inspector, dependency bump, new action — is blocked until the source lives in version control.

This spec covers the **rebuild of the plugin source** to exact functional parity with the shipped ZIP, as a prerequisite for future work. Behavior-changing features (Scene-Dropdown + Wait-for-OBS UX) are explicitly out of scope and brainstormed separately after merge.

## Goal

A `streamdeck-plugin/` subproject in this repo whose build output is a `.streamDeckPlugin` ZIP identical in effect to the currently shipped binary, so existing user installations continue to work after an update.

## Non-Goals

- No new user-facing features. Property Inspector for the Scene action stays a plain text field; dropdown comes later.
- No UUID changes. UUIDs remain `com.thelab.toolkit.*` so existing Stream Deck button configurations on user machines stay bound after update.
- No dependency modernization beyond what `@elgato/streamdeck` pulls in transitively.

## Architecture

```
streamdeck-plugin/                                  ← own npm project, own package.json
  package.json                                      ← @elgato/streamdeck SDK
  tsconfig.json
  build.mjs                                         ← esbuild bundle + ZIP packaging
  src/
    plugin.ts                                       ← entry, registers all 8 actions
    api.ts                                          ← HTTP client → localhost:<port>/api
    websocket.ts                                    ← WS client → localhost:<port>/ws (for bug counter)
    actions/
      scene.ts
      clip.ts
      bug.ts
      experiment.ts
      todo.ts
      milestone.ts
      compile-pray.ts
      roulette.ts
  com.thelab.toolkit.sdPlugin/                      ← static manifest + assets + UI + build output
    manifest.json                                   ← Version bumped to 1.0.1.0
    package.json                                    ← minimal Elgato package descriptor
    bin/                                            ← build output target (gitignored)
      plugin.js
    ui/
      pi.html                                       ← shared Property Inspector (same structure as shipped)
      scene.html, clip.html, bug.html, experiment.html, todo.html, milestone.html   ← per-action snippets (cosmetic — not referenced by manifest, but shipped)
      global-settings.html                          ← global-only PI page
    imgs/
      plugin-icon.png, plugin-icon@2x.png
      actions/
        scene.png / scene@2x.png, clip, bug, experiment, todo, milestone, compile-pray, roulette (both @1x and @2x)
```

Images are copied 1:1 from the current ZIP (extracted once and committed).

## Actions (parity with shipped ZIP)

| UUID | Button behavior (on press) | Property Inspector fields |
|------|-----------------------------|---------------------------|
| `com.thelab.toolkit.scene` | Switch OBS scene via current stream-toolkit API | `sceneName` (text input, placeholder "z.B. Gameplay") |
| `com.thelab.toolkit.clip` | Mark clip with given tag | `tag` (text input) |
| `com.thelab.toolkit.bug` | Create bug + keep open-bug count in title via WS | `bugTitle` (text input) |
| `com.thelab.toolkit.experiment` | Update current experiment status | `action` (select: `running` / `success` / `failed` / `idle`) |
| `com.thelab.toolkit.todo` | Complete given todo (`next` = next open) | `todoId` (text input, "next" supported) |
| `com.thelab.toolkit.milestone` | Complete given milestone (`next` = next open) | `milestoneId` (text input, "next" supported) |
| `com.thelab.toolkit.compile-pray` | Trigger compile-pray alert | none |
| `com.thelab.toolkit.roulette` | Spin bug roulette; button dims + shows "Cooldown" during 60-second cooldown | none |

**Exact backend endpoints & request payloads are authoritative in the existing `bin/plugin.js` (bundled in the shipped ZIP).** Implementation step starts by extracting that file and decoding each action's HTTP call, then reimplements it 1:1 in the corresponding TS action class. Spec does not duplicate these details because guessing them creates drift; the bundled JS is source-of-truth for parity.

## Property Inspector

Single shared `ui/pi.html` for all 8 actions (referenced by every manifest entry). On load, it:

1. Reads its action's UUID from `inActionInfo` and shows the matching `<div class="section action-settings" id="settings-<key>">` block (hides the rest).
2. Loads per-action settings via Elgato `getSettings` / displays them via auto-filled form controls.
3. Loads global settings via `getGlobalSettings` and fills `apiToken` / `host` / `port`.
4. Debounced auto-save on every `input` / `change` event (global fields → `setGlobalSettings`; per-action → `setSettings`).
5. "Test connection" effect: after a global setting changes, fire `GET /api/health` with Bearer token — show green "Verbunden!" or red "Verbindung fehlgeschlagen." status box.

HTML skeleton mirrors the shipped `pi.html` (same CSS, same German labels, same behavior). Copy-paste allowed — it's the reference.

## Plugin Runtime (`src/plugin.ts`)

On `streamDeck.connect`, register all 8 action classes with `@elgato/streamdeck`. Each action class:

- Reads `globalSettings` (apiToken / host / port) — defaults to `localhost:4000` if unset.
- `onKeyDown` → performs its HTTP call via `api.ts` (adds `Authorization: Bearer <apiToken>` header).
- Success feedback: `setTitle` flash (e.g. green tick for 400 ms, then restore previous) — matches current shipped behavior.
- Failure feedback: red X flash; log via `streamDeck.logger`.

Bug action additionally: on `onWillAppear`, subscribe via `websocket.ts` to `bug-created` / `bug-deleted` events, keep current open-bug count in title.

Roulette action: maintains a module-level cooldown timestamp; during the 60-second window, `setTitle('Cooldown')` and `setState` to a dimmed state; on cooldown-expiry, restore.

## Build Pipeline

`streamdeck-plugin/build.mjs`:

1. `esbuild` bundles `src/plugin.ts` → `com.thelab.toolkit.sdPlugin/bin/plugin.js` (cjs, `target: node20`, external `@elgato/streamdeck` dependency bundled in).
2. `archiver` ZIPs the `com.thelab.toolkit.sdPlugin/` directory into `../assets/com.thelab.toolkit.streamDeckPlugin`.

`streamdeck-plugin/package.json` scripts:
- `build` → esbuild step only
- `package` → `build` + ZIP step

Root `package.json` additions:
- New script `build:plugin` → `npm --prefix streamdeck-plugin run package`
- Existing `build` script prepended with `build:plugin` so `npm run build` produces both the Electron app and a fresh plugin ZIP.
- New devDependency reference is *not* needed at the root — the subproject owns its own `node_modules`.

## Git & Binary Handling

- Before parity is verified: keep `assets/com.thelab.toolkit.streamDeckPlugin` in git (users on `main` still get a working plugin during this work).
- After parity verification passes: delete the binary from git and add `assets/com.thelab.toolkit.streamDeckPlugin` to `.gitignore`. From then on, the ZIP is built-on-demand and bundled by electron-builder from `assets/` at package time.
- `electron-builder.json` already lists `assets/**` — confirm the built ZIP is included.
- CI/local-dev: developer must run `npm run build:plugin` (or the umbrella `npm run build`) once before packaging; document in `streamdeck-plugin/README.md`.

## Parity Verification (manual, pre-merge)

Before deleting the old binary, verify each action by:

1. Build fresh ZIP via `npm run build:plugin`.
2. Uninstall existing plugin in Stream Deck app, drop-install the freshly built ZIP.
3. For each of the 8 actions: drag onto a deck slot, configure as before, press, confirm backend call + visible button feedback matches the previous behavior.
4. Confirm existing-config preservation: a button configured **before** the update still works without reconfiguration after the update (Stream Deck re-reads settings on restart).

Failure on any step = spec was wrong about that action's behavior; fix in implementation, re-verify.

## Versioning & Update Story

- Manifest `Version: "1.0.1.0"` (Elgato requires 4-part version).
- User installs update via existing onboarding flow (`POST /api/settings/streamdeck/install`) — Stream Deck detects higher version and prompts to update. Existing button bindings persist because UUIDs didn't change.

## Testing

No automated tests (per repo convention). Typecheck + lint + the manual verification above.

## Risks

- **Backend endpoint drift.** If a backend route the shipped plugin relies on has moved/renamed since April 14, parity fails for that action. Mitigation: verification step catches it; fix is to update the action class's URL.
- **Elgato SDK version mismatch.** The shipped `plugin.js` was bundled against some specific SDK version. New source bundles latest — behavior differences possible. Mitigation: manual verification covers the externally-observable surface; internal deltas are irrelevant.
- **Binary-in-git history.** Removing the ZIP from `main` leaves it in history forever. Acceptable — small (~81 KB) and not a secret.

## Out of Scope / Next

- Scene-Dropdown + Wait-for-OBS UX — separate brainstorm → spec → plan once this rebuild is merged.
- Any cleanup / consolidation of the per-action UI snippets (`ui/scene.html` etc.) currently bundled but unused by the manifest — keep as-is for parity.
- Adding new actions.

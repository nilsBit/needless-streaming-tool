# Stream Deck Plugin Rebuild — code complete, awaiting manual QA

> Project-state document for cross-machine continuity. Mirrors
> `~/.claude/projects/D--dev-stream-toolkit/memory/project_streamdeck_plugin_rebuild_in_progress.md`
> but lives in git so it's available on any device after `git pull`.
> Update both when state changes.

Stream Deck plugin source rebuild (plan: `docs/superpowers/plans/2026-04-22-streamdeck-plugin-rebuild.md`) is **code-complete and pushed to origin** as of 2026-04-23. The remaining work is hands-on manual QA on Stream Deck hardware, then cleanup.

**Why:** Pre-rebuild, plugin source was missing — only the shipped `.streamDeckPlugin` ZIP existed. Future plugin changes were blocked. The rebuild reconstructs source in `streamdeck-plugin/` subproject (esbuild + archiver pipeline) at exact functional parity with the shipped ZIP, decoded via `REBUILD-REFERENCE.md`.

## Current state (HEAD `683d717`)

Tasks 1-16 done across these commits (all on `main`):
- Tasks 1-8: scaffold, ZIP import, REBUILD-REFERENCE, api.ts, ws.ts, plugin.ts, scene.ts, clip.ts (pre-existing, baseline `3ff34e7`)
- Task 9 — `ec7289b` bug action (POST /api/issues, WS issue-*, count from /public/issues)
- Task 10 — `13cb57b` experiment action (PATCH /api/stream-state with challenge_status; PI value mapping running→in_progress, success→done)
- Task 11 — `eae4d2c` todo action (PATCH /api/progress/todos/:id, GET /public/progress with items[].todos[] flatten)
- Task 12 — `63c5418` milestone action (PATCH /api/milestones/:id with status: completed)
- Task 13 — `827bf73` compile-pray (POST /api/actions/compile-pray, WS-flash 🙏)
- Task 13.5 — `53a5057` race-fix: compile-pray flash respects connection state
- Task 14 — `74f1f23` roulette (POST /api/actions/roulette, NO client cooldown — server enforces)
- Task 15 — `0eb722b` build pipeline `streamdeck-plugin/build.mjs`. Required adding `experimentalDecorators: true` to `streamdeck-plugin/tsconfig.json` because `@elgato/streamdeck` SDK uses legacy decorator syntax that esbuild can't transform when targeting node20 directly.
- Task 16 — `683d717` root `package.json`: added `build:plugin` script + prepended to `build/build:mac/build:win/build:all` (deviation from plan: prepended to all 4 variants instead of only `build`, to prevent stale ZIPs in platform-specific installers).

## OPEN tasks

### Task 17 — Manual parity QA on Stream Deck hardware (REQUIRES USER)

1. In Elgato Stream Deck app: right-click "The Lab Toolkit" → Uninstall.
2. Double-click `assets/com.thelab.toolkit.streamDeckPlugin` (freshly built via `npm run build:plugin`) → install via Elgato dialog. **Note:** if pulling on a fresh device, the ZIP must be rebuilt locally — `cd streamdeck-plugin && npm install && npm run build:plugin`.
3. Restart Stream Deck app if needed.
4. Start app: `npm run dev`. Connect OBS + Twitch.
5. Drag each of 8 actions onto deck, configure PI, press, verify behavior:

| Action | PI setting | Expected behavior |
|---|---|---|
| `scene` | `sceneName = <OBS scene>` | OBS switches; title shows current scene / OFFLINE |
| `clip` | `tag = highlight` | Clip created; title `N Clips` |
| `bug` | `bugTitle = test bug` | Bug appears in Issues panel; title `🐛 N` updates live |
| `experiment` | `action = success` | Current experiment flips to `done`; title `🟢 …` |
| `todo` | `todoId = next` | Next open todo completed; title `N Todos` decrements |
| `milestone` | `milestoneId = next` | Next pending milestone completed |
| `compile-pray` | (no settings) | Overlay alert; title flashes 🙏 → "Compile" |
| `roulette` | (no settings) | Spins; title 🎰... → result; 60s server cooldown then pressable |

6. Verify existing-config preservation — UUIDs are verbatim, so old buttons should keep their settings without reconfiguration.

### Task 18 — Remove tracked binary + gitignore (after QA passes)

- `git rm --cached assets/com.thelab.toolkit.streamDeckPlugin` (file stays on disk)
- Append `assets/com.thelab.toolkit.streamDeckPlugin` to `.gitignore`
- **CHECK:** root `package.json` `build.files` currently lists `dist/**/*`, `src/overlays/**/*`, `node_modules/**/*` — `assets/` is NOT included. Production install button reads from `process.resourcesPath/assets/com.thelab.toolkit.streamDeckPlugin` (`src/server/api/settings.ts:184-189`). Either add `assets/com.thelab.toolkit.streamDeckPlugin` to `build.files` or add an `extraResources` entry mapping `assets/com.thelab.toolkit.streamDeckPlugin` → `assets/com.thelab.toolkit.streamDeckPlugin`. Verify with `npm run build` and inspect `release/win-unpacked/resources/app/assets/`.

### Task 19 — Final lint/typecheck + push

- Root `npm run typecheck && npm run lint`
- `git status` clean
- `git push origin main`

## Deferred polish items (non-blocking, surfaced by code reviewers)

These are NOT regressions vs the original plugin — most are improvements over the shipped behavior. Candidate cleanup pass post-QA:

- `experiment.ts`: rename module-level `status`/`title` to `challengeStatus`/`challengeTitle` for clarity (don't rename `settings.action` — that field name is in the shipped PI HTML and renaming would break parity).
- `todo.ts` / `milestone.ts`: explicit `Number(todoId)` + `isFinite` guard to short-circuit invalid PI input before hitting backend (currently relies on backend 404 → showAlert).
- `roulette.ts`: optional generation counter for spin/result race (theoretical, server cooldown 60s makes it unreachable today).
- `compile-pray.ts`: optional clear-prior-timer on rapid back-to-back events.
- All actions: shared `connectionState.ts` module instead of `let connected = false` per file (architectural smell, not a bug).
- `scene.ts`: cleanup unused `streamDeck` import (kept from earlier iteration; clip.ts/bug.ts already cleaner).

## Resume on another device

```bash
git pull origin main
cd streamdeck-plugin && npm install && npm run build:plugin
# fresh ZIP now at ../assets/com.thelab.toolkit.streamDeckPlugin
# proceed with Task 17 above
```

## Authoritative references

- `streamdeck-plugin/REBUILD-REFERENCE.md` — exact backend paths/events/bodies for all 8 actions, decoded from shipped `bin/plugin.js`. Source of truth when touching action code.
- Plan: `docs/superpowers/plans/2026-04-22-streamdeck-plugin-rebuild.md` (the architectural-corrections section starting at line ~299 OVERRIDES the old code blocks in tasks 4-14).
- Spec: `docs/superpowers/specs/2026-04-22-streamdeck-plugin-rebuild-design.md`

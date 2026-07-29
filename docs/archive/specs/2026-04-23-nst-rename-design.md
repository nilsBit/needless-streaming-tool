# Project Rename: "Needless Streaming Tool" (NST)

**Goal:** Rename the entire project from "The Lab" / "Stream Toolkit" to "Needless Streaming Tool" with short form "NST".

## Name Mapping

| Context | Old | New |
|---------|-----|-----|
| Full name | The Lab / Stream Toolkit | Needless Streaming Tool |
| Short name | The Lab | NST |
| Package name | stream-toolkit | needless-streaming-tool |
| App ID | com.thelab.stream-toolkit | com.nst.streaming-tool |
| SD Plugin name | The Lab Toolkit | NST Deck |
| SD Plugin UUID | com.thelab.toolkit | com.nst.deck |
| SD Action UUIDs | com.thelab.toolkit.{action} | com.nst.deck.{action} |
| SD Plugin ZIP | com.thelab.toolkit.streamDeckPlugin | com.nst.deck.streamDeckPlugin |
| SD Plugin dir | com.thelab.toolkit.sdPlugin | com.nst.deck.sdPlugin |
| Connection dir | ~/.thelab/ | ~/.nst/ |
| GitHub repo | nilsBit/stream-toolkit | nilsBit/needless-streaming-tool |
| Public SD repo | nilsBit/thelab-streamdeck-plugin | nilsBit/nst-streamdeck-plugin |
| Backup file | stream-toolkit-backup.json | nst-backup.json |
| User-Agent | stream-toolkit | needless-streaming-tool |

## Files to Modify

### Root configs
- `package.json` — name, description, appId
- `electron-builder.json` — appId, productName
- `CLAUDE.md` — project name and description

### Electron main process
- `src/main/main.ts` — window title
- `src/main/tray.ts` — tray tooltip

### Server
- `src/server/connection-file.ts` — `.thelab` → `.nst`
- `src/server/api/backup.ts` — backup filename
- `src/server/api/progress.ts` — User-Agent header
- `src/server/api/settings.ts` — plugin ZIP filename (2 locations)

### Renderer
- `src/renderer/index.html` — page title
- `src/renderer/src/App.tsx` — header text
- `src/renderer/src/i18n/translations.ts` — app.title, onboarding, streamdeck references
- `src/renderer/src/docs/help-en.ts` — help text
- `src/renderer/src/docs/help-de.ts` — help text
- `src/renderer/src/panels/SettingsPanel.tsx` — backup download filename

### Stream Deck plugin
- `streamdeck-plugin/package.json` — name, description
- `streamdeck-plugin/build.mjs` — SD_DIR, ZIP_OUT, zip.directory paths
- `streamdeck-plugin/README.md` — all references
- `streamdeck-plugin/.gitignore` — directory name
- `streamdeck-plugin/src/connection.ts` — `.thelab` → `.nst`
- `streamdeck-plugin/src/actions/*.ts` — all 8 action UUIDs
- `streamdeck-plugin/com.thelab.toolkit.sdPlugin/` — rename directory to `com.nst.deck.sdPlugin/`
- `streamdeck-plugin/com.nst.deck.sdPlugin/manifest.json` — UUID, Name, URL, Category, all action UUIDs
- `streamdeck-plugin/com.nst.deck.sdPlugin/package.json` — name
- `streamdeck-plugin/com.nst.deck.sdPlugin/ui/pi.html` — title, wizard text, action UUIDs, download URLs

### Documentation (active references only)
- `docs/superpowers/state/streamdeck-plugin-rebuild-state.md`

## Breaking Changes

- **Stream Deck buttons lose configuration** — UUID change means existing buttons must be reconfigured
- **GitHub repo URL changes** — must be renamed manually in GitHub Settings
- **Connection file path changes** — old `~/.thelab/connection.json` becomes `~/.nst/connection.json`

## Out of Scope

- Archived plan/spec documents (historical, not active code references)
- REBUILD-REFERENCE.md (historical decode reference, not active)
- Renaming the git repo directory on disk

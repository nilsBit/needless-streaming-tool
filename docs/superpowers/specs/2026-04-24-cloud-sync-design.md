# Cloud Sync (Dropbox) — Design Spec

**Goal:** Sync the app's SQLite database between two devices via a shared cloud folder (e.g. Dropbox). When the app starts on device B, it picks up where device A left off — including all stream data, settings, and UI preferences.

**Constraint:** Only one device runs the app at a time. No concurrent access.

## Sync Flow

### On App Start

1. Read sync config from `~/.nst/sync-config.json` (outside the DB — avoids chicken-and-egg).
2. If sync is disabled or no config: skip, start normally.
3. If sync path configured:
   a. Check if remote `stream.db` exists at `{syncPath}/stream.db`.
   b. If it exists: compare remote `sync-meta.json` timestamp vs local `sync-meta.json` timestamp. If either meta file is missing, fall back to comparing `stream.db` file mtime (handles crash scenarios where meta wasn't written).
   c. **Remote is newer:** Backup local DB to `data/stream.db.bak`, copy remote DB to `data/stream.db`. Run SQLite integrity check (`PRAGMA integrity_check`) on the copied file — if corrupt, restore `.bak` and warn.
   d. **Local is newer or no remote:** No copy needed.
4. Start server with the (possibly updated) local DB.

### On App Quit

All quit-path operations use **synchronous** fs calls (`fs.copyFileSync`, `fs.writeFileSync`) to guarantee completion before Electron exits. The DB file is typically <5MB, so blocking for <100ms is acceptable.

1. If sync enabled:
   a. Flush WAL: run `PRAGMA wal_checkpoint(TRUNCATE)` to ensure all data is in the main DB file (SQLite WAL mode keeps recent writes in `-wal`/`-shm` files that would not be copied otherwise).
   b. Copy `data/stream.db` to `{syncPath}/stream.db` (sync, not async).
   c. Write `{syncPath}/sync-meta.json`:
      ```json
      {
        "lastSync": "2026-04-24T15:30:00.000Z",
        "device": "MacBook-Pro",
        "appVersion": "0.1.0"
      }
      ```
      Device name via `os.hostname()`.
2. Also write local `data/sync-meta.json` with same content (for next-start comparison).

### Manual Sync

A "Jetzt synchronisieren" button in Settings triggers a safe copy to the remote folder. Since the DB is open and actively used by the server, use `database.backup(destination)` from better-sqlite3 (safe for live databases) instead of raw file copy. After backup completes, write `sync-meta.json`.

## Sync Config

Stored at `~/.nst/sync-config.json` (same directory as `connection.json`):

```json
{
  "enabled": true,
  "syncPath": "/Users/nils/Dropbox/NST"
}
```

This file is **not** in the SQLite DB because it's needed before the DB is loaded. It's read/written by the main process.

## UI Preferences Migration

Currently 4 keys are stored in `localStorage` and would not sync. Move them to the `settings` table in SQLite:

| localStorage key | settings table key | File |
|---|---|---|
| `dashboard-single-column` | `ui.single_column` | `src/renderer/src/App.tsx` |
| `dashboard-layout` | `ui.dashboard_layout` | `src/renderer/src/hooks/useDashboardLayout.ts` |
| `app-language` | `ui.language` | `src/renderer/src/i18n/LanguageContext.tsx` |
| `app-theme` | `ui.theme` | `src/renderer/src/i18n/ThemeContext.tsx` |

The renderer reads/writes these via API calls (`GET /api/settings/:key`, `PATCH /api/settings/:key`) instead of `localStorage`. On first load after migration, if the API returns no value, fall back to `localStorage` for a one-time migration, then write it to the DB.

**Note on `dashboard-layout`:** This is the most complex migration. The `useDashboardLayout` hook currently reads from `localStorage` synchronously in a `useState` initializer. After migration, the initial value comes from an async API call. The hook needs a loading state: initialize with a default layout, fetch from API on mount, then update state when the response arrives. The layout will briefly show the default before the synced layout loads — acceptable since it happens once per page load.

## Settings Panel — Cloud Sync Section

New section in `src/renderer/src/panels/SettingsPanel.tsx`:

- **Toggle:** Sync enabled/disabled
- **Folder picker:** Opens Electron `dialog.showOpenDialog({ properties: ['openDirectory'] })` via IPC
- **Status:** "Letzter Sync: 24.04.2026 15:30 (MacBook-Pro)" — read from `sync-meta.json`
- **Button:** "Jetzt synchronisieren" — triggers manual sync via API

### IPC for Folder Picker

The renderer can't open native dialogs directly. New IPC channel:

- Main process exposes `ipc.handle('select-sync-folder')` → opens folder dialog, returns path
- Renderer calls `ipcRenderer.invoke('select-sync-folder')` via a preload bridge

Since the app currently has `contextIsolation: true` and no preload script, this requires adding a preload script that exposes the IPC call.

## API Endpoints

New additions to existing settings router or a new sync router:

### `GET /api/sync/status`
Returns current sync state: `{ enabled, syncPath, lastSync, device }`.

### `POST /api/sync/trigger`
Triggers manual sync (copy DB to remote). Returns `{ success, lastSync }`.

### `GET /api/settings/:key`
Already exists or trivially added — reads a key from the `settings` table.

### `PATCH /api/settings/:key`
Already exists or trivially added — writes a key to the `settings` table.

## Files in Sync Folder

```
~/Dropbox/NST/
  stream.db        — The SQLite database
  sync-meta.json   — { lastSync, device, appVersion }
```

## Safety

- **Backup before overwrite:** Always create `stream.db.bak` before replacing the local DB.
- **Integrity check:** Run `PRAGMA integrity_check` on the remote DB before using it. If corrupt, keep local and show warning.
- **WAL checkpoint:** Always run `PRAGMA wal_checkpoint(TRUNCATE)` before copying the DB to ensure all data is in the main file.
- **Live DB copy:** Use `database.backup()` (better-sqlite3) for manual sync while the server is running. Use `fs.copyFileSync` for quit-path sync (DB connection is already closed or about to close).
- **No concurrent access:** The sync flow is strictly start/stop — never two apps writing the same file.
- **Sync path validation:** After folder selection, verify the path is writable (`fs.accessSync(path, fs.constants.W_OK)`). Show error if not.
- **Missing sync folder:** If the configured sync path no longer exists (Dropbox removed, folder deleted), show a warning in the Settings panel and skip sync gracefully.

## Files

**Created:**
- `src/server/sync.ts` — sync logic (copyToRemote, copyFromRemote, readSyncConfig, writeSyncConfig)
- `src/main/preload.ts` — preload script exposing IPC for folder picker

**Modified:**
- `src/main/main.ts` — call sync-from-remote before server start, sync-to-remote on quit, register IPC handler, add preload to BrowserWindow
- `src/server/index.ts` — register sync API routes
- `src/renderer/src/panels/SettingsPanel.tsx` — Cloud Sync UI section
- `src/renderer/src/App.tsx` — migrate `dashboard-single-column` to DB
- `src/renderer/src/hooks/useDashboardLayout.ts` — migrate `dashboard-layout` to DB
- `src/renderer/src/i18n/LanguageContext.tsx` — migrate `app-language` to DB
- `src/renderer/src/i18n/ThemeContext.tsx` — migrate `app-theme` to DB

## Out of Scope

- Real-time sync between devices
- Conflict resolution (newer file always wins)
- Syncing OAuth tokens (device-specific, stay in safeStorage)
- Syncing the connection.json (device-specific)
- Server-based sync (future enhancement)

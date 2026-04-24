# Cloud Sync Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sync the SQLite database between devices via a shared cloud folder (e.g. Dropbox), with UI preferences migrated from localStorage to the DB.

**Architecture:** Sync module reads/writes `~/.nst/sync-config.json` for config. On app start: copy remote DB if newer. On app quit: WAL checkpoint + sync copy to remote. Manual sync uses `database.backup()`. UI prefs migrated from localStorage to `settings` table via existing `/settings/get/:key` and `/settings/set` API.

**Tech Stack:** Existing — SQLite (better-sqlite3), Electron IPC, Express, React. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-04-24-cloud-sync-design.md`

**Important:** No automated tests. Verification via `npm run typecheck` and `npm run lint`. Nodemon auto-reloads — do NOT restart the app manually.

---

## File Structure

**Created:**

```
src/server/sync.ts              — sync logic: copyToRemote, copyFromRemote, readSyncConfig, writeSyncConfig
src/main/preload.ts             — preload script exposing IPC for folder picker
```

**Modified:**

```
src/main/main.ts                — sync-from-remote before server start, sync-to-remote on quit, IPC handler, preload
src/server/api/settings.ts      — add sync status + trigger endpoints (on existing settings router, no index.ts change needed)
src/renderer/src/panels/SettingsPanel.tsx — Cloud Sync UI section
src/renderer/src/App.tsx         — migrate single-column pref to DB
src/renderer/src/hooks/useDashboardLayout.ts — migrate layout to DB
src/renderer/src/i18n/LanguageContext.tsx — migrate language to DB
src/renderer/src/i18n/ThemeContext.tsx — migrate theme to DB
```

---

### Task 1: Sync module

**Files:**
- Create: `src/server/sync.ts`

- [ ] **Step 1: Create `src/server/sync.ts`**

```typescript
import fs from 'fs';
import path from 'path';
import os from 'os';
import Database from 'better-sqlite3';
import { getDb } from './db/index';
import { getUserDataPath } from './paths';

interface SyncConfig {
  enabled: boolean;
  syncPath: string;
}

interface SyncMeta {
  lastSync: string;
  device: string;
  appVersion: string;
}

const CONFIG_DIR = path.join(
  process.platform === 'win32'
    ? (process.env.APPDATA || os.homedir())
    : os.homedir(),
  '.nst'
);
const CONFIG_FILE = path.join(CONFIG_DIR, 'sync-config.json');

export function readSyncConfig(): SyncConfig | null {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return null;
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')) as SyncConfig;
  } catch {
    return null;
  }
}

/** Returns config only if enabled and has a path — used by sync operations */
function getActiveSyncConfig(): SyncConfig | null {
  const config = readSyncConfig();
  if (!config?.enabled || !config.syncPath) return null;
  return config;
}

export function writeSyncConfig(config: SyncConfig): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function getLocalDbPath(): string {
  return path.join(getUserDataPath(''), 'stream.db');
}

function readMeta(metaPath: string): SyncMeta | null {
  try {
    if (!fs.existsSync(metaPath)) return null;
    return JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as SyncMeta;
  } catch {
    return null;
  }
}

function writeMeta(metaPath: string): void {
  const meta: SyncMeta = {
    lastSync: new Date().toISOString(),
    device: os.hostname(),
    appVersion: '0.1.0',
  };
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
}

/**
 * Called BEFORE server starts. Copies remote DB to local if remote is newer.
 * Uses synchronous operations — this runs before the event loop matters.
 */
export function syncFromRemote(): { synced: boolean; error?: string } {
  const config = getActiveSyncConfig();
  if (!config) return { synced: false };

  const remoteDb = path.join(config.syncPath, 'stream.db');
  const remoteMeta = path.join(config.syncPath, 'sync-meta.json');
  const localDb = getLocalDbPath();
  const localMeta = path.join(getUserDataPath(''), 'sync-meta.json');

  if (!fs.existsSync(remoteDb)) return { synced: false };

  // Validate sync path is accessible
  try {
    fs.accessSync(config.syncPath, fs.constants.R_OK);
  } catch {
    return { synced: false, error: 'Sync folder not accessible' };
  }

  // Compare timestamps: meta first, fall back to file mtime
  const remoteMetaData = readMeta(remoteMeta);
  const localMetaData = readMeta(localMeta);

  let remoteTime: number;
  let localTime: number;

  if (remoteMetaData && localMetaData) {
    remoteTime = new Date(remoteMetaData.lastSync).getTime();
    localTime = new Date(localMetaData.lastSync).getTime();
  } else {
    remoteTime = fs.existsSync(remoteDb) ? fs.statSync(remoteDb).mtimeMs : 0;
    localTime = fs.existsSync(localDb) ? fs.statSync(localDb).mtimeMs : 0;
  }

  if (remoteTime <= localTime) return { synced: false };

  // Remote is newer — integrity check before copying
  try {
    const testDb = new Database(remoteDb, { readonly: true });
    const result = testDb.pragma('integrity_check') as Array<{ integrity_check: string }>;
    testDb.close();
    if (result[0]?.integrity_check !== 'ok') {
      return { synced: false, error: 'Remote DB failed integrity check' };
    }
  } catch (err) {
    return { synced: false, error: `Remote DB unreadable: ${err}` };
  }

  // Backup local DB
  if (fs.existsSync(localDb)) {
    fs.copyFileSync(localDb, localDb + '.bak');
  }

  // Copy remote to local
  try {
    fs.copyFileSync(remoteDb, localDb);
    if (fs.existsSync(remoteMeta)) {
      fs.copyFileSync(remoteMeta, localMeta);
    }
  } catch (err) {
    // Restore backup on copy failure
    if (fs.existsSync(localDb + '.bak')) {
      fs.copyFileSync(localDb + '.bak', localDb);
    }
    return { synced: false, error: `Copy failed, restored backup: ${err}` };
  }

  console.log(`[Sync] Pulled DB from remote (${remoteMetaData?.device || 'unknown'})`);
  return { synced: true };
}

/**
 * Called on app quit. Synchronous — must complete before process exits.
 * WAL checkpoint + copy to remote.
 */
export function syncToRemoteOnQuit(): void {
  const config = getActiveSyncConfig();
  if (!config) return;

  try {
    fs.accessSync(config.syncPath, fs.constants.W_OK);
  } catch {
    console.error('[Sync] Sync folder not writable, skipping');
    return;
  }

  const localDb = getLocalDbPath();
  const remoteDb = path.join(config.syncPath, 'stream.db');
  const remoteMeta = path.join(config.syncPath, 'sync-meta.json');
  const localMeta = path.join(getUserDataPath(''), 'sync-meta.json');

  try {
    // Flush WAL to main DB file
    getDb().pragma('wal_checkpoint(TRUNCATE)');
  } catch {
    console.error('[Sync] WAL checkpoint failed, syncing anyway');
  }

  try {
    fs.mkdirSync(config.syncPath, { recursive: true });
    fs.copyFileSync(localDb, remoteDb);
    writeMeta(remoteMeta);
    writeMeta(localMeta);
    console.log('[Sync] Pushed DB to remote');
  } catch (err) {
    console.error('[Sync] Failed to push DB:', err);
  }
}

/**
 * Manual sync (while server is running). Uses database.backup() for safety.
 */
export async function syncToRemoteManual(): Promise<{ success: boolean; lastSync?: string; error?: string }> {
  const config = getActiveSyncConfig();
  if (!config) return { success: false, error: 'Sync not configured' };

  try {
    fs.accessSync(config.syncPath, fs.constants.W_OK);
  } catch {
    return { success: false, error: 'Sync folder not writable' };
  }

  const remoteDb = path.join(config.syncPath, 'stream.db');
  const remoteMeta = path.join(config.syncPath, 'sync-meta.json');
  const localMeta = path.join(getUserDataPath(''), 'sync-meta.json');

  try {
    fs.mkdirSync(config.syncPath, { recursive: true });
    await getDb().backup(remoteDb);
    writeMeta(remoteMeta);
    writeMeta(localMeta);
    const meta = readMeta(remoteMeta);
    console.log('[Sync] Manual sync completed');
    return { success: true, lastSync: meta?.lastSync };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Get current sync status for the UI.
 */
export function getSyncStatus(): { enabled: boolean; syncPath?: string; lastSync?: string; device?: string; error?: string } {
  const config = readSyncConfig();
  if (!config) return { enabled: false };

  const localMeta = path.join(getUserDataPath(''), 'sync-meta.json');
  const meta = readMeta(localMeta);

  // Check if sync path is accessible
  let error: string | undefined;
  try {
    fs.accessSync(config.syncPath, fs.constants.W_OK);
  } catch {
    error = 'Sync folder not accessible';
  }

  return {
    enabled: true,
    syncPath: config.syncPath,
    lastSync: meta?.lastSync,
    device: meta?.device,
    error,
  };
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/server/sync.ts
git commit -m "feat(sync): add cloud sync module with read/write/backup logic

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Preload script + IPC for folder picker

**Files:**
- Create: `src/main/preload.ts`
- Modify: `src/main/main.ts`

- [ ] **Step 1: Create `src/main/preload.ts`**

```typescript
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  selectSyncFolder: () => ipcRenderer.invoke('select-sync-folder'),
});
```

- [ ] **Step 2: Modify `src/main/main.ts` — add preload, IPC handler, sync calls**

Add imports at the top:

```typescript
import { app, BrowserWindow, nativeImage, ipcMain, dialog } from 'electron';
import { syncFromRemote, syncToRemoteOnQuit } from '../server/sync';
```

Add preload to BrowserWindow config. Change the `webPreferences` in `createWindow()`:

```typescript
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
```

Add IPC handler inside `app.whenReady().then(...)`, before `apiToken = await startServer()`:

```typescript
  // IPC: folder picker for sync config
  ipcMain.handle('select-sync-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Sync-Ordner auswählen',
    });
    return result.canceled ? null : result.filePaths[0];
  });

  // Sync from remote before starting server
  const syncResult = syncFromRemote();
  if (syncResult.error) {
    console.warn(`[Sync] ${syncResult.error}`);
  } else if (syncResult.synced) {
    console.log('[Sync] Database updated from remote');
  }
```

Modify `before-quit` handler to add sync-to-remote:

```typescript
app.on('before-quit', () => {
  isQuitting = true;
  unregisterHotkeys();
  syncToRemoteOnQuit();
  deleteConnectionFile();
});
```

- [ ] **Step 3: Add TypeScript declaration for the preload API**

Create a type declaration so the renderer can use `window.electronAPI`. Add to `src/renderer/src/vite-env.d.ts`:

```typescript
interface ElectronAPI {
  selectSyncFolder: () => Promise<string | null>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
```

- [ ] **Step 4: Verify typecheck**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/main/preload.ts src/main/main.ts src/renderer/src/vite-env.d.ts
git commit -m "feat(sync): add preload script, IPC folder picker, sync on start/quit

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Sync API endpoints

**Files:**
- Modify: `src/server/api/settings.ts`

- [ ] **Step 1: Add sync endpoints to settings router**

In `src/server/api/settings.ts`, add these imports at the top:

```typescript
import { getSyncStatus, syncToRemoteManual, readSyncConfig, writeSyncConfig } from '../sync';
```

Add these routes before the `export default router` at the end of the file:

```typescript
// Cloud Sync
router.get('/sync/status', (_req, res) => {
  res.json(getSyncStatus());
});

router.post('/sync/trigger', async (_req, res) => {
  const result = await syncToRemoteManual();
  res.json(result);
});

router.get('/sync/config', (_req, res) => {
  const config = readSyncConfig();
  res.json(config || { enabled: false, syncPath: '' });
});

router.post('/sync/config', (req, res) => {
  const { enabled, syncPath } = req.body as { enabled?: boolean; syncPath?: string };
  writeSyncConfig({ enabled: !!enabled, syncPath: syncPath || '' });
  res.json({ success: true });
});
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/server/api/settings.ts
git commit -m "feat(sync): add sync status, trigger, and config API endpoints

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Cloud Sync UI in Settings Panel

**Files:**
- Modify: `src/renderer/src/panels/SettingsPanel.tsx`

- [ ] **Step 1: Add sync section to SettingsPanel**

Read the current file first to find the exact insertion point. Add the sync UI as a new section. The section needs:
- State for sync config and status
- Fetch sync status on mount
- Folder picker via `window.electronAPI?.selectSyncFolder()`
- Enable/disable toggle
- Manual sync button
- Status display

Add to the component's state declarations (near the other `useApi` calls):

```typescript
const { data: syncStatus, refetch: refetchSync } = useApi<{
  enabled: boolean; syncPath?: string; lastSync?: string; device?: string; error?: string;
}>('/settings/sync/status');
const [syncPath, setSyncPath] = useState('');
const [syncEnabled, setSyncEnabled] = useState(false);
const [syncing, setSyncing] = useState(false);
```

Add a useEffect to initialize from sync config:

```typescript
useEffect(() => {
  apiGet<{ enabled: boolean; syncPath: string }>('/settings/sync/config').then((cfg) => {
    if (cfg) {
      setSyncPath(cfg.syncPath || '');
      setSyncEnabled(cfg.enabled);
    }
  });
}, []);
```

Add the sync handlers:

```typescript
const handleSelectSyncFolder = async () => {
  const folder = await window.electronAPI?.selectSyncFolder();
  if (folder) {
    setSyncPath(folder);
    await apiPost('/settings/sync/config', { enabled: syncEnabled, syncPath: folder });
    refetchSync();
  }
};

const handleToggleSync = async (enabled: boolean) => {
  setSyncEnabled(enabled);
  await apiPost('/settings/sync/config', { enabled, syncPath });
  refetchSync();
};

const handleManualSync = async () => {
  setSyncing(true);
  const result = await apiPost<{ success: boolean; error?: string }>('/settings/sync/trigger', {});
  setSyncing(false);
  refetchSync();
  if (result?.success) {
    toast('Sync abgeschlossen');
  } else {
    toast(result?.error || 'Sync fehlgeschlagen');
  }
};
```

Add the JSX section (insert before the closing `</div>` of the panel, as a new section alongside the other settings sections):

```tsx
{/* Cloud Sync */}
<div className="config-section">
  <h3>☁️ Cloud Sync</h3>
  <div className="config-row">
    <label>Sync aktiviert</label>
    <input
      type="checkbox"
      checked={syncEnabled}
      onChange={(e) => handleToggleSync(e.target.checked)}
    />
  </div>
  <div className="config-row">
    <label>Sync-Ordner</label>
    <div style={{ display: 'flex', gap: 8, flex: 1 }}>
      <input
        type="text"
        value={syncPath}
        readOnly
        placeholder="Kein Ordner ausgewählt"
        style={{ flex: 1 }}
      />
      <button onClick={handleSelectSyncFolder}>Auswählen</button>
    </div>
  </div>
  {syncStatus?.lastSync && (
    <div className="config-row">
      <label>Letzter Sync</label>
      <span>
        {new Date(syncStatus.lastSync).toLocaleString('de-DE')}
        {syncStatus.device && ` (${syncStatus.device})`}
      </span>
    </div>
  )}
  {syncStatus?.error && (
    <div className="config-row" style={{ color: '#e74c3c' }}>
      <label>Fehler</label>
      <span>{syncStatus.error}</span>
    </div>
  )}
  <div className="config-row">
    <label />
    <button
      onClick={handleManualSync}
      disabled={!syncEnabled || !syncPath || syncing}
    >
      {syncing ? 'Synchronisiere...' : 'Jetzt synchronisieren'}
    </button>
  </div>
</div>
```

Also add the `apiGet` import if not already present:

```typescript
import { useApi, apiPost, apiFetch, getApiToken, apiGet } from '../hooks/useApi';
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/panels/SettingsPanel.tsx
git commit -m "feat(sync): add Cloud Sync section to Settings panel

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Migrate UI preferences from localStorage to DB

**Files:**
- Modify: `src/renderer/src/i18n/LanguageContext.tsx`
- Modify: `src/renderer/src/i18n/ThemeContext.tsx`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/hooks/useDashboardLayout.ts`

This task migrates 4 localStorage keys to the settings DB. Pattern for each: on mount, fetch from API; if no value, read localStorage (one-time migration), write to API; on change, write to API.

- [ ] **Step 1: Migrate `app-language` in LanguageContext.tsx**

Replace the file content:

```tsx
import React, { createContext, useContext, useState, useEffect } from 'react';
import { Lang, t, TranslationKey } from './translations';
import { apiGet, apiPost } from '../hooks/useApi';

interface LanguageContextType {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  lang: 'de',
  setLang: () => {},
  t: (key) => key,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('de');

  useEffect(() => {
    apiGet<{ value: string | null }>('/settings/get/ui.language').then((res) => {
      if (res?.value) {
        setLangState(res.value === 'en' ? 'en' : 'de');
      } else {
        // One-time migration from localStorage
        const saved = localStorage.getItem('app-language');
        if (saved) {
          const migrated = saved === 'en' ? 'en' : 'de';
          setLangState(migrated as Lang);
          apiPost('/settings/set', { key: 'ui.language', value: migrated });
          localStorage.removeItem('app-language');
        }
      }
    });
  }, []);

  const setLang = (newLang: Lang) => {
    setLangState(newLang);
    apiPost('/settings/set', { key: 'ui.language', value: newLang });
  };

  const translate = (key: TranslationKey) => t(key, lang);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t: translate }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() { return useContext(LanguageContext); }
```

- [ ] **Step 2: Migrate `app-theme` in ThemeContext.tsx**

Replace the file content:

```tsx
import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiGet, apiPost } from '../hooks/useApi';

type Theme = 'dark' | 'light';

interface ThemeContextType {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType>({ theme: 'dark', setTheme: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark');

  useEffect(() => {
    apiGet<{ value: string | null }>('/settings/get/ui.theme').then((res) => {
      if (res?.value) {
        const t = res.value as Theme;
        setThemeState(t);
        document.documentElement.setAttribute('data-theme', t);
      } else {
        // One-time migration from localStorage
        const saved = localStorage.getItem('app-theme') as Theme | null;
        if (saved) {
          setThemeState(saved);
          document.documentElement.setAttribute('data-theme', saved);
          apiPost('/settings/set', { key: 'ui.theme', value: saved });
          localStorage.removeItem('app-theme');
        } else {
          document.documentElement.setAttribute('data-theme', 'dark');
        }
      }
    });
  }, []);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    document.documentElement.setAttribute('data-theme', t);
    apiPost('/settings/set', { key: 'ui.theme', value: t });
  };

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() { return useContext(ThemeContext); }
```

- [ ] **Step 3: Migrate `dashboard-single-column` in App.tsx**

In `src/renderer/src/App.tsx`, find the `singleColumn` state initialization and update logic.

Replace the useState initializer:
```typescript
const [singleColumn, setSingleColumn] = useState(false);
```

Add a useEffect after it to load from DB:
```typescript
useEffect(() => {
  apiGet<{ value: string | null }>('/settings/get/ui.single_column').then((res) => {
    if (res?.value) {
      setSingleColumn(res.value === 'true');
    } else {
      const saved = localStorage.getItem('dashboard-single-column');
      if (saved) {
        setSingleColumn(saved === 'true');
        apiPost('/settings/set', { key: 'ui.single_column', value: saved });
        localStorage.removeItem('dashboard-single-column');
      }
    }
  });
}, []);
```

Find where `setSingleColumn` is called with `localStorage.setItem` and replace the localStorage call with the API call:
```typescript
apiPost('/settings/set', { key: 'ui.single_column', value: String(!singleColumn) });
```

Add `apiGet` and `apiPost` to the imports if not already there.

- [ ] **Step 4: Migrate `dashboard-layout` in useDashboardLayout.ts**

This is the most complex migration. The hook needs to load asynchronously but still work synchronously for the initial render.

Replace `loadLayout` and `saveLayout`:

```typescript
function loadLayout(): DashboardLayout {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function saveLayout(layout: DashboardLayout): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  // Also persist to DB for sync
  apiPost('/settings/set', { key: 'ui.dashboard_layout', value: JSON.stringify(layout) });
}
```

Add import at the top:
```typescript
import { apiGet, apiPost } from './useApi';
```

Inside `useDashboardLayout`, add a useEffect to load from DB on mount (one-time migration):

```typescript
useEffect(() => {
  apiGet<{ value: string | null }>('/settings/get/ui.dashboard_layout').then((res) => {
    if (res?.value) {
      try {
        const dbLayout = JSON.parse(res.value) as DashboardLayout;
        setLayout(dbLayout);
        // Also update localStorage as cache
        localStorage.setItem(STORAGE_KEY, res.value);
      } catch { /* ignore parse errors */ }
    } else {
      // One-time migration: push localStorage value to DB
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        apiPost('/settings/set', { key: 'ui.dashboard_layout', value: stored });
      }
    }
  });
}, []);
```

Also update `applyProfilePreset` to save to DB:

```typescript
export function applyProfilePreset(profile: string): void {
  // ... existing logic ...
  saveLayout(layout); // This now also writes to DB via the updated saveLayout
}
```

Add `useEffect` to the imports from React.

- [ ] **Step 5: Verify typecheck**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 6: Verify lint**

Run: `npm run lint`
Expected: No new errors

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/i18n/LanguageContext.tsx src/renderer/src/i18n/ThemeContext.tsx src/renderer/src/App.tsx src/renderer/src/hooks/useDashboardLayout.ts
git commit -m "feat(sync): migrate UI preferences from localStorage to SQLite settings

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

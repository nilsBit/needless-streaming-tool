import fs from 'fs';
import path from 'path';
import os from 'os';
import Database from 'better-sqlite3';
import { getDb } from './db/index';
import { getUserDataPath } from './paths';
import { isSecretSetting } from './secret-settings';

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

function getActiveSyncConfig(): SyncConfig | null {
  const config = readSyncConfig();
  if (!config?.enabled || !config.syncPath) return null;
  return config;
}

export function writeSyncConfig(config: SyncConfig): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
}

type SettingRow = { key: string; value: string };

/** The secret settings of a database file — what must not travel and must not be lost. */
function secretRows(file: string): SettingRow[] {
  if (!fs.existsSync(file)) return [];
  try {
    const db = new Database(file, { readonly: true });
    const rows = db.prepare('SELECT key, value FROM settings').all() as SettingRow[];
    db.close();
    return rows.filter((r) => isSecretSetting(r.key));
  } catch {
    return [];
  }
}

/** Removes tokens, the OBS password and the Discord webhook from a copy meant for the sync folder. */
function stripSecrets(file: string): void {
  const db = new Database(file);
  try {
    const remove = db.prepare('DELETE FROM settings WHERE key = ?');
    for (const row of secretRows(file)) remove.run(row.key);
    db.pragma('wal_checkpoint(TRUNCATE)');
  } finally {
    db.close();
  }
}

/** Puts this machine's secrets back into a database that came from the sync folder. */
function restoreSecrets(file: string, rows: SettingRow[]): void {
  if (rows.length === 0) return;
  const db = new Database(file);
  try {
    const put = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    for (const row of rows) put.run(row.key, row.value);
  } finally {
    db.close();
  }
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

export function syncFromRemote(): { synced: boolean; error?: string } {
  const config = getActiveSyncConfig();
  if (!config) return { synced: false };

  const remoteDb = path.join(config.syncPath, 'stream.db');
  const remoteMeta = path.join(config.syncPath, 'sync-meta.json');
  const localDb = getLocalDbPath();
  const localMeta = path.join(getUserDataPath(''), 'sync-meta.json');

  if (!fs.existsSync(remoteDb)) return { synced: false };

  try {
    fs.accessSync(config.syncPath, fs.constants.R_OK);
  } catch {
    return { synced: false, error: 'Sync folder not accessible' };
  }

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

  if (fs.existsSync(localDb)) {
    fs.copyFileSync(localDb, localDb + '.bak');
  }
  // The remote copy carries no secrets (see stripSecrets); this machine keeps its own.
  const ownSecrets = secretRows(localDb);

  try {
    fs.copyFileSync(remoteDb, localDb);
    restoreSecrets(localDb, ownSecrets);
    if (fs.existsSync(remoteMeta)) {
      fs.copyFileSync(remoteMeta, localMeta);
    }
  } catch (err) {
    if (fs.existsSync(localDb + '.bak')) {
      fs.copyFileSync(localDb + '.bak', localDb);
    }
    return { synced: false, error: `Copy failed, restored backup: ${err}` };
  }

  console.log(`[Sync] Pulled DB from remote (${remoteMetaData?.device || 'unknown'})`);
  return { synced: true };
}

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
    getDb().pragma('wal_checkpoint(TRUNCATE)');
  } catch {
    console.error('[Sync] WAL checkpoint failed, syncing anyway');
  }

  try {
    fs.mkdirSync(config.syncPath, { recursive: true });
    fs.copyFileSync(localDb, remoteDb);
    stripSecrets(remoteDb);
    writeMeta(remoteMeta);
    writeMeta(localMeta);
    console.log('[Sync] Pushed DB to remote');
  } catch (err) {
    console.error('[Sync] Failed to push DB:', err);
  }
}

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
    stripSecrets(remoteDb);
    writeMeta(remoteMeta);
    writeMeta(localMeta);
    const meta = readMeta(remoteMeta);
    console.log('[Sync] Manual sync completed');
    return { success: true, lastSync: meta?.lastSync };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export function getSyncStatus(): { enabled: boolean; syncPath?: string; lastSync?: string; device?: string; error?: string } {
  const config = readSyncConfig();
  if (!config) return { enabled: false };

  const localMeta = path.join(getUserDataPath(''), 'sync-meta.json');
  const meta = readMeta(localMeta);

  let error: string | undefined;
  if (config.enabled && config.syncPath) {
    try {
      fs.accessSync(config.syncPath, fs.constants.W_OK);
    } catch {
      error = 'Sync folder not accessible';
    }
  }

  return {
    enabled: config.enabled,
    syncPath: config.syncPath,
    lastSync: meta?.lastSync,
    device: meta?.device,
    error,
  };
}

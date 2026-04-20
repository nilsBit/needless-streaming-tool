import Database from 'better-sqlite3';
import path from 'path';
import { SCHEMA, SCHEMA_VERSION } from './schema';
import { getUserDataPath } from '../paths';

let db: Database.Database;

function getDbPath(): string {
  return path.join(getUserDataPath(''), 'stream.db');
}

export function initDatabase(dbPath?: string): Database.Database {
  const resolvedPath = dbPath || getDbPath();

  db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  // Migration: project_name Spalte zu stream_state (v2)
  try {
    db.prepare('SELECT project_name FROM stream_state LIMIT 1').get();
  } catch {
    db.exec('ALTER TABLE stream_state ADD COLUMN project_name TEXT');
    console.log('[DB] Migrated: added project_name to stream_state');
  }

  // Check schema version and run migrations if needed
  const versionRow = db.prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1').get() as { version: number } | undefined;
  const currentVersion = versionRow?.version || 0;

  if (currentVersion < SCHEMA_VERSION) {
    runMigrations(currentVersion, SCHEMA_VERSION);
  }

  console.log(`[DB] Initialized at ${resolvedPath} (schema v${SCHEMA_VERSION})`);
  return db;
}

function runMigrations(from: number, to: number) {
  if (from < 4) {
    // Milestones: add title, status, completed_at columns (idempotent)
    try { db.exec('ALTER TABLE milestones ADD COLUMN title TEXT NOT NULL DEFAULT \'\''); } catch {}
    try { db.exec('ALTER TABLE milestones ADD COLUMN status TEXT DEFAULT \'pending\''); } catch {}
    try { db.exec('ALTER TABLE milestones ADD COLUMN completed_at DATETIME'); } catch {}
    // Migrate existing milestones: use message as title, mark as completed
    db.exec(`UPDATE milestones SET title = COALESCE(message, level), status = 'completed', completed_at = created_at WHERE title = ''`);
    console.log('[DB] Migrated: milestones table updated with title, status, completed_at');
  }

  if (from < 5) {
    // Migrate hardcoded Notion clips database ID to settings
    const existing = db.prepare('SELECT value FROM settings WHERE key = ?').get('notion_clips_db') as { value: string } | undefined;
    if (!existing) {
      db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run('notion_clips_db', '063fe6bb48384ddfab0afebf32244308');
      console.log('[DB] Migrated: moved Notion clips DB ID to settings');
    }
  }

  if (from < 6) {
    try { db.exec('ALTER TABLE clips ADD COLUMN stream_timecode TEXT'); } catch {}
    try { db.exec('ALTER TABLE clips ADD COLUMN recording_timecode TEXT'); } catch {}
    try { db.exec('ALTER TABLE stream_state ADD COLUMN is_recording INTEGER DEFAULT 0'); } catch {}
    console.log('[DB] Migrated: added timecode columns to clips, is_recording to stream_state');
  }

  if (from < 7) {
    // Rename bugs → issues
    try {
      db.prepare('SELECT 1 FROM bugs LIMIT 1').get();
      db.exec('ALTER TABLE bugs RENAME TO issues');
      console.log('[DB] Migrated: renamed bugs → issues');
    } catch {}
    // Rename experiment_* → challenge_* in stream_state
    try {
      db.prepare('SELECT experiment_title FROM stream_state LIMIT 1').get();
      db.exec('ALTER TABLE stream_state RENAME COLUMN experiment_title TO challenge_title');
      db.exec('ALTER TABLE stream_state RENAME COLUMN experiment_status TO challenge_status');
      console.log('[DB] Migrated: renamed experiment_* → challenge_* in stream_state');
    } catch {}
  }

  if (from < 8) {
    try { db.exec('ALTER TABLE project_items ADD COLUMN time_spent INTEGER DEFAULT 0'); } catch {}
    console.log('[DB] Migrated: added time_spent to project_items');
  }

  if (from < 9) {
    try { db.exec('ALTER TABLE project_items ADD COLUMN external_id TEXT'); } catch {}
    console.log('[DB] Migrated: added external_id to project_items');
  }

  if (from < 10) {
    try { db.exec('ALTER TABLE clips ADD COLUMN confidence TEXT'); } catch {}
    console.log('[DB] Migrated: added confidence to clips');
  }

  if (from < 11) {
    try { db.exec('ALTER TABLE todos ADD COLUMN parent_id INTEGER'); } catch {}
    db.exec('DELETE FROM todos WHERE parent_id IS NULL');
    console.log('[DB] Migrated: added parent_id to todos, cleaned orphans');
  }

  if (from < 12) {
    try { db.exec('ALTER TABLE clips ADD COLUMN notion_page_id TEXT'); } catch {}
    console.log('[DB] Migrated: added notion_page_id to clips');
  }

  db.prepare('INSERT OR REPLACE INTO schema_version (version) VALUES (?)').run(to);
  console.log(`[DB] Migrated from v${from} to v${to}`);
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized');
  return db;
}

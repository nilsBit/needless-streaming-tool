import Database from 'better-sqlite3';
import path from 'path';
import { SCHEMA, SCHEMA_VERSION } from './schema';

let db: Database.Database;

function getDbPath(): string {
  // In Electron production: use app.getPath('userData')
  // In development: use cwd/data/
  try {
    const { app } = require('electron');
    if (app.isPackaged) {
      return path.join(app.getPath('userData'), 'stream.db');
    }
  } catch {}
  return path.join(process.cwd(), 'data', 'stream.db');
}

export function initDatabase(dbPath?: string): Database.Database {
  const resolvedPath = dbPath || getDbPath();

  db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

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
  // Future migrations go here:
  // if (from < 2) { db.exec('ALTER TABLE ...'); }

  db.prepare('INSERT OR REPLACE INTO schema_version (version) VALUES (?)').run(to);
  console.log(`[DB] Migrated from v${from} to v${to}`);
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized');
  return db;
}

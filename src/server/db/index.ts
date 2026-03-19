import Database from 'better-sqlite3';
import path from 'path';
import { SCHEMA } from './schema';

let db: Database.Database;

export function initDatabase(dbPath?: string): Database.Database {
  const resolvedPath = dbPath || path.join(process.cwd(), 'data', 'stream.db');

  db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  console.log(`[DB] Initialized at ${resolvedPath}`);
  return db;
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized');
  return db;
}

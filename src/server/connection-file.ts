import fs from 'fs';
import path from 'path';
import os from 'os';
import { getFixedToken } from './auth-token';

const DIR = path.join(
  process.platform === 'win32'
    ? (process.env.APPDATA || os.homedir())
    : os.homedir(),
  '.nst'
);
const FILE = path.join(DIR, 'connection.json');

export function writeConnectionFile(port: number): void {
  try {
    // Use the fixed token (persisted in DB, stable across restarts) — not the session token
    const token = getFixedToken();
    if (!token) {
      console.warn('[Connection] No fixed token available, skipping connection file');
      return;
    }
    // Owner-only: the file holds the fixed token, which opens the whole API.
    fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
    fs.writeFileSync(FILE, JSON.stringify({
      version: 1,
      token,
      port,
      pid: process.pid,
    }, null, 2), { mode: 0o600 });
    try { fs.chmodSync(DIR, 0o700); fs.chmodSync(FILE, 0o600); } catch { /* Windows: ACLs, no mode bits */ }
    console.log(`[Connection] Wrote ${FILE}`);
  } catch (err) {
    console.error('[Connection] Failed to write connection file:', err);
  }
}

export function deleteConnectionFile(): void {
  try {
    if (fs.existsSync(FILE)) {
      fs.unlinkSync(FILE);
      console.log(`[Connection] Deleted ${FILE}`);
    }
  } catch {
    /* best-effort cleanup */
  }
}

import crypto from 'crypto';
import { getDb } from './db/index';

// Session token — generated fresh on every app start (for Electron renderer)
let sessionToken: string = '';
// Fixed token — persisted in DB (for Stream Deck / external tools)
let fixedToken: string | null = null;

export function generateApiToken(): string {
  sessionToken = crypto.randomBytes(32).toString('hex');

  // Load or create fixed token from DB
  try {
    const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get('api_token') as { value: string } | undefined;
    if (row?.value) {
      fixedToken = row.value;
    } else {
      fixedToken = crypto.randomBytes(32).toString('hex');
      getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('api_token', fixedToken);
    }
    console.log(`[Auth] Fixed API token: ${fixedToken}`);
  } catch {
    // DB not ready yet — fixed token will be null
  }

  console.log(`[Auth] Session token generated`);
  return sessionToken;
}

export function getApiToken(): string {
  return sessionToken;
}

export function getFixedToken(): string | null {
  return fixedToken;
}

export function validateApiToken(token: string | undefined): boolean {
  if (!sessionToken) return true; // Not initialized yet
  if (token === sessionToken) return true;
  if (fixedToken && token === fixedToken) return true;
  return false;
}

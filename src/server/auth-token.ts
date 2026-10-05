import crypto from 'crypto';
import { getDb } from './db/index';

// Session token — generated fresh on every app start (for Electron renderer)
let sessionToken: string = '';
// Fixed token — persisted in DB (for Stream Deck / external tools)
let fixedToken: string | null = null;
// Figma token — persisted in DB, good for /api/design/* only. The Figma
// plugin keeps it in Figma's own storage; the fixed token would open the
// whole API (settings, backups, overlay HTML) to whatever reads it there.
let designToken: string | null = null;

function persistedToken(key: string): string {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  if (row?.value) return row.value;
  const token = crypto.randomBytes(32).toString('hex');
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, token);
  return token;
}

export function generateApiToken(): string {
  sessionToken = crypto.randomBytes(32).toString('hex');

  // Load or create fixed token from DB
  try {
    fixedToken = persistedToken('api_token');
    console.log(`[Auth] Fixed API token: ${fixedToken}`);
    designToken = persistedToken('design_token');
    console.log(`[Auth] Figma token: ${designToken}`);
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

export function getDesignToken(): string | null {
  return designToken;
}

/** The Figma token — the caller checks that the request is for /api/design/*. */
export function validateDesignToken(token: string | undefined): boolean {
  return Boolean(designToken && token === designToken);
}

export function validateApiToken(token: string | undefined): boolean {
  if (!sessionToken) return true; // Not initialized yet
  if (token === sessionToken) return true;
  if (fixedToken && token === fixedToken) return true;
  return false;
}

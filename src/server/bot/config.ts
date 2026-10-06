import { getDb } from '../db/index';
import { safeStorage } from 'electron';
import { BotConfig } from '../../shared/types';

function encryptToken(token: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(token).toString('base64');
  }
  return token;
}

/** Why the stored token is unusable, if it is — shown on the Twitch card. */
let tokenProblem: string | null = null;
export function botTokenProblem(): string | null {
  return tokenProblem;
}

function decryptToken(encrypted: string): string {
  // A token from before encryption was added is stored as it is and starts with "oauth:".
  if (encrypted.startsWith('oauth:')) { tokenProblem = null; return encrypted; }
  let available = false;
  try { available = safeStorage.isEncryptionAvailable(); } catch { /* not inside Electron */ }
  if (!available) {
    tokenProblem = 'Die Verschlüsselung des Systems ist nicht verfügbar, der gespeicherte Twitch-Token lässt sich nicht lesen.';
    return '';
  }
  try {
    const token = safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
    tokenProblem = null;
    return token;
  } catch {
    // The key lives in the system keychain. After an update of the app (a new
    // Electron binary) macOS asks once whether it may be used; a refused dialog
    // lands here. A fresh login stores the token under the new key.
    tokenProblem = 'Der gespeicherte Twitch-Token lässt sich nicht entschlüsseln – meist hat macOS den Zugriff auf den Schlüsselbund verweigert. Einmal neu mit Twitch anmelden.';
    return '';
  }
}

export function getBotConfig(): BotConfig | null {
  const db = getDb();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('twitch_config') as { value: string } | undefined;
  if (!row) return null;

  try {
    const stored = JSON.parse(row.value) as BotConfig;
    return {
      ...stored,
      oauth_token: decryptToken(stored.oauth_token),
    };
  } catch {
    return null;
  }
}

export function saveBotConfig(config: BotConfig): void {
  const db = getDb();
  const toStore = {
    ...config,
    oauth_token: encryptToken(config.oauth_token),
  };
  db.prepare(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'
  ).run('twitch_config', JSON.stringify(toStore));
}

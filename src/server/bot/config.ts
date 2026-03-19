import { getDb } from '../db/index';
import { safeStorage } from 'electron';

export interface BotConfig {
  channel: string;
  username: string;
  oauth_token: string;
}

function encryptToken(token: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(token).toString('base64');
  }
  return token;
}

function decryptToken(encrypted: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
    } catch {
      // Fallback: might be a plain-text token from before encryption was added
      return encrypted;
    }
  }
  return encrypted;
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

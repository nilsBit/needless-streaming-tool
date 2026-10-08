import { getDb } from '../db/index';
import { safeStorage } from 'electron';
import { BotConfig } from '../../shared/types';

// The token is encrypted and decrypted through the asynchronous safeStorage
// calls only. Since Electron 44 the synchronous `isEncryptionAvailable()`
// answers `false` on the Mac now and then although the keychain works, and a
// "no" at start-up kept the bot offline until the next start (08.10.). Both
// write the same `v10` format, so a token stored by the old code still reads.

/** Whether the keychain (macOS) or DPAPI (Windows) can be used. False outside Electron. */
async function encryptionAvailable(): Promise<boolean> {
  try {
    return await safeStorage.isAsyncEncryptionAvailable();
  } catch {
    return false; // not inside Electron
  }
}

async function encryptToken(token: string): Promise<string> {
  if (await encryptionAvailable()) {
    return (await safeStorage.encryptStringAsync(token)).toString('base64');
  }
  return token;
}

/** Why the stored token is unusable, if it is — shown on the Twitch card. */
let tokenProblem: string | null = null;
export function botTokenProblem(): string | null {
  return tokenProblem;
}

/** The decrypted token, kept in memory for the stored value it came from. */
let decrypted: { stored: string; token: string } | null = null;

function readStored(): BotConfig | null {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get('twitch_config') as { value: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.value) as BotConfig;
  } catch {
    return null;
  }
}

function writeStored(config: BotConfig): void {
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('twitch_config', JSON.stringify(config));
}

/**
 * Decrypts the stored token once and keeps it in memory, so `getBotConfig()`
 * can stay synchronous. Called before the bot connects.
 */
export async function loadBotToken(): Promise<void> {
  const stored = readStored();
  // A token from before encryption was added is stored as it is and starts with "oauth:".
  if (!stored?.oauth_token || stored.oauth_token.startsWith('oauth:')) {
    tokenProblem = null;
    return;
  }
  if (decrypted?.stored === stored.oauth_token) return;
  if (!(await encryptionAvailable())) {
    tokenProblem = 'Die Verschlüsselung des Systems ist nicht verfügbar, der gespeicherte Twitch-Token lässt sich nicht lesen.';
    return;
  }
  try {
    const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(Buffer.from(stored.oauth_token, 'base64'));
    decrypted = { stored: stored.oauth_token, token: result };
    tokenProblem = null;
    if (shouldReEncrypt) await saveBotConfig({ ...stored, oauth_token: result });
  } catch {
    // The key lives in the system keychain. After an update of the app (a new
    // Electron binary) macOS asks once whether it may be used; a refused dialog
    // lands here. A fresh login stores the token under the new key.
    tokenProblem = 'Der gespeicherte Twitch-Token lässt sich nicht entschlüsseln – meist hat macOS den Zugriff auf den Schlüsselbund verweigert. Einmal neu mit Twitch anmelden.';
  }
}

/** The stored config with the token in plain text — empty until `loadBotToken()` has read it. */
export function getBotConfig(): BotConfig | null {
  const stored = readStored();
  if (!stored) return null;
  const token = stored.oauth_token ?? '';
  return {
    ...stored,
    oauth_token: token.startsWith('oauth:') ? token : decrypted?.stored === token ? decrypted.token : '',
  };
}

export async function saveBotConfig(config: BotConfig): Promise<void> {
  const oauth_token = await encryptToken(config.oauth_token);
  writeStored({ ...config, oauth_token });
  decrypted = { stored: oauth_token, token: config.oauth_token };
  tokenProblem = null;
}

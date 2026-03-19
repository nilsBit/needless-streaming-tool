import { getDb } from '../db/index';

export interface BotConfig {
  channel: string;
  username: string;
  oauth_token: string;
}

export function getBotConfig(): BotConfig | null {
  const db = getDb();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('twitch_config') as { value: string } | undefined;
  if (!row) return null;

  try {
    return JSON.parse(row.value) as BotConfig;
  } catch {
    return null;
  }
}

export function saveBotConfig(config: BotConfig): void {
  const db = getDb();
  db.prepare(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'
  ).run('twitch_config', JSON.stringify(config));
}

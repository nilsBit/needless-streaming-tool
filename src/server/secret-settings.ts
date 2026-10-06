/**
 * Settings that are secrets. They never leave the machine through a backup
 * or the sync folder, a backup never brings foreign ones in, and the generic
 * settings routes neither read nor write them — each secret has its own route
 * that gives back at most a preview. (Security review of 2026-10-06, H1/M2.)
 */
const SECRET_KEYS = new Set(['api_token', 'design_token', 'notion_token', 'github_token', 'discord_live_webhook', 'obs_config', 'twitch_config']);

export function isSecretSetting(key: string): boolean {
  const k = key.toLowerCase();
  return SECRET_KEYS.has(k) || k.endsWith('_token') || k.endsWith('_secret') || k.includes('webhook') || k.includes('password');
}

/** The rows of a settings list that may travel. */
export function withoutSecrets<T extends { key?: unknown }>(rows: T[]): T[] {
  return rows.filter((row) => typeof row.key === 'string' && !isSecretSetting(row.key));
}

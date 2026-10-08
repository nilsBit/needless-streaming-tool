import { getDb } from '../db/index';

/**
 * How viewers earn the tool's own points (spec 2026-10-08-eigene-punkte).
 * Stored as JSON under `points_config`; a missing or broken value falls back
 * to the defaults field by field. 0 switches a source off.
 */
export interface PointsConfig {
  /** What the currency is called in chat and in the app. */
  currency: string;
  /** Points per watch tick for everyone in chat. */
  watch_points: number;
  /** Minutes between two watch ticks. */
  watch_minutes: number;
  /** Points for a chat message, at most once a minute per viewer. */
  chat_points: number;
  follow_points: number;
  /** Per sub, resub and gifted sub (to the one who gifts). */
  sub_points: number;
  /** To the raider. */
  raid_points: number;
  /** One point per this many bits. */
  bits_per_point: number;
  /** Logins that never earn: other bots in the channel. */
  bots: string[];
}

export const DEFAULT_POINTS_CONFIG: PointsConfig = {
  currency: 'Punkte',
  watch_points: 5,
  watch_minutes: 10,
  chat_points: 1,
  follow_points: 50,
  sub_points: 200,
  raid_points: 100,
  bits_per_point: 10,
  bots: ['streamelements', 'nightbot', 'moobot', 'streamlabs', 'soundalerts'],
};

const KEY = 'points_config';
const NUMBERS = ['watch_points', 'watch_minutes', 'chat_points', 'follow_points', 'sub_points', 'raid_points', 'bits_per_point'] as const;
const CURRENCY_MAX = 30;
const NUMBER_MAX = 1_000_000;

export function getPointsConfig(): PointsConfig {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(KEY) as { value: string } | undefined;
  let stored: Partial<PointsConfig> = {};
  try {
    const parsed: unknown = row ? JSON.parse(row.value) : {};
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) stored = parsed as Partial<PointsConfig>;
  } catch { /* the defaults */ }
  const config: PointsConfig = { ...DEFAULT_POINTS_CONFIG, bots: [...DEFAULT_POINTS_CONFIG.bots] };
  if (typeof stored.currency === 'string' && stored.currency.trim()) config.currency = stored.currency.trim();
  for (const key of NUMBERS) {
    const value = stored[key];
    if (Number.isInteger(value) && (value as number) >= 0) config[key] = value as number;
  }
  if (Array.isArray(stored.bots)) config.bots = stored.bots.filter((b): b is string => typeof b === 'string');
  return config;
}

/** Saves what is given, keeps the rest. An error names the first bad field. */
export function savePointsConfig(input: unknown): { config: PointsConfig } | { error: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'config must be an object' };
  const body = input as Record<string, unknown>;
  const next = getPointsConfig();
  if ('currency' in body) {
    if (typeof body.currency !== 'string' || !body.currency.trim()) return { error: 'currency must be a name' };
    if (body.currency.trim().length > CURRENCY_MAX) return { error: `currency is at most ${CURRENCY_MAX} characters` };
    next.currency = body.currency.trim();
  }
  for (const key of NUMBERS) {
    if (!(key in body)) continue;
    const value = body[key];
    if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > NUMBER_MAX) {
      return { error: `${key} must be a whole number from 0 to ${NUMBER_MAX}` };
    }
    next[key] = value as number;
  }
  if (next.watch_minutes === 0 && next.watch_points > 0) return { error: 'watch_minutes must be at least 1' };
  if ('bots' in body) {
    if (!Array.isArray(body.bots) || body.bots.some((b) => typeof b !== 'string')) return { error: 'bots must be a list of logins' };
    next.bots = [...new Set((body.bots as string[]).map((b) => b.trim().replace(/^@/, '').toLowerCase()).filter(Boolean))];
  }
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(KEY, JSON.stringify(next));
  return { config: next };
}

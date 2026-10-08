import { getDb } from '../db/index';
import { requestQuestCheck } from './schedule';

/**
 * Something that happened once and leaves no trace of its own — Twitch or
 * OBS connected, a stream sent, the wheel spun. Set where it happens; a quest
 * reads it (catalog.ts `flagged`).
 */
export function markQuestFlag(name: string): void {
  const key = `quest_flag_${name}`;
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  if (row?.value === '1') return;
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, '1');
  requestQuestCheck();
}

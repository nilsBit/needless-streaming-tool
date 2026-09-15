import { getDb } from '../db/index';
import { broadcast } from '../websocket/index';

/**
 * Follow Mode's settings: whether the Entry Card follows what is open in
 * Worldbuilder, whether the card is held, and how long an entry has to stay
 * open before the card switches.
 *
 * Kept apart from the polling in `follow.ts`, so that picking a card by hand —
 * which holds it — does not have to know about Worldbuilder at all.
 */

export interface FollowState {
  /** The streamer wants the card to follow Worldbuilder. */
  enabled: boolean;
  /** A card was picked or cleared by hand: what is open in Worldbuilder is ignored. */
  held: boolean;
  /** How long an entry must stay open before the card switches to it. */
  settleSeconds: number;
  /** Following needs Worldbuilder as the source — Notion has nothing open. */
  available: boolean;
}

const DEFAULT_SETTLE_SECONDS = 3;
export const MAX_SETTLE_SECONDS = 30;

function getSetting(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

function setSetting(key: string, value: string): void {
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

export function followState(): FollowState {
  const settle = getSetting('follow_settle_seconds');
  return {
    enabled: getSetting('follow_enabled') !== '0',
    held: getSetting('follow_held') === '1',
    settleSeconds: settle !== null && Number.isInteger(Number(settle)) ? Number(settle) : DEFAULT_SETTLE_SECONDS,
    available: getSetting('character_source') === 'worldbuilder',
  };
}

export function updateFollow(change: { enabled?: boolean; held?: boolean; settleSeconds?: number }): FollowState {
  if (change.enabled !== undefined) {
    setSetting('follow_enabled', change.enabled ? '1' : '0');
    // Switching following on means "follow now". A hold left over from before
    // would quietly say otherwise.
    if (change.enabled) setSetting('follow_held', '0');
  }
  if (change.held !== undefined) setSetting('follow_held', change.held ? '1' : '0');
  if (change.settleSeconds !== undefined) setSetting('follow_settle_seconds', String(change.settleSeconds));

  const state = followState();
  broadcast('follow-changed', state);
  return state;
}

/**
 * Holds the card. Picking or clearing it by hand does this — otherwise the
 * next look at Worldbuilder would undo the choice a second later.
 */
export function holdCard(): void {
  if (!followState().held) updateFollow({ held: true });
}

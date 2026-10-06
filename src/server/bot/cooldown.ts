import { chatMessagesLastMinute } from './chat-feed';
import { getDb } from '../db/index';

/**
 * When a chat command last answered, per key — and per key and viewer. In
 * memory on purpose: a restart forgiving every cooldown costs nothing.
 */
const lastAnswered = new Map<string, number>();
const lastAnsweredTo = new Map<string, number>();

/**
 * A command's cooldown is set for a quiet chat, where one answer stays on
 * screen for a while. In a busy chat it scrolls away in seconds, so the
 * command may answer again sooner: half as long from twenty messages a
 * minute, a quarter from sixty.
 */
export function paceFactor(messagesLastMinute: number): number {
  if (messagesLastMinute >= 60) return 0.25;
  if (messagesLastMinute >= 20) return 0.5;
  return 1;
}

/**
 * One viewer who just got the answer does not need it again for a good
 * while, whatever the chat does — this many times the command's cooldown,
 * and never under a minute. Somebody else may still ask once the command's
 * own cooldown is over.
 */
export const VIEWER_COOLDOWN_FACTOR = 4;
export const VIEWER_COOLDOWN_MIN_SECONDS = 60;

export interface CooldownContext {
  /** Lower-case login of who asked; without it only the command's own clock counts. */
  viewer?: string;
  now?: number;
  /** Chat's pace, 0 to 1 — looked up when not given. */
  pace?: number;
}

/**
 * Whether a command may answer now — and if it may, starts its cooldowns.
 *
 * Broadcaster and mods skip the cooldown and do not start it either. When the
 * streamer calls up `!story` to explain something, a viewer asking a moment
 * later should still get the answer.
 */
export function passCooldown(key: string, seconds: number, privileged: boolean, context: CooldownContext = {}): boolean {
  if (privileged) return true;

  const now = context.now ?? Date.now();
  const pace = context.pace ?? paceFactor(chatMessagesLastMinute(now));

  const last = lastAnswered.get(key);
  if (last !== undefined && now - last < seconds * 1000 * pace) return false;

  const viewerKey = context.viewer ? `${key}|${context.viewer.toLowerCase()}` : null;
  if (viewerKey) {
    const lastToViewer = lastAnsweredTo.get(viewerKey);
    const perViewer = Math.max(seconds * VIEWER_COOLDOWN_FACTOR, VIEWER_COOLDOWN_MIN_SECONDS) * 1000;
    if (lastToViewer !== undefined && now - lastToViewer < perViewer) return false;
    lastAnsweredTo.set(viewerKey, now);
  }

  lastAnswered.set(key, now);
  return true;
}

/** Built-ins that only tell something — the ones a cooldown fits. Actions (!vote, !sr, !hype) stay free. */
export const INFO_BUILTINS: ReadonlySet<string> = new Set(['challenge', 'progress', 'todo', 'issues', 'song', 'queue', 'rewardstats', 'uptime', 'commands', 'privacy']);

export const BUILTIN_COOLDOWN_DEFAULT = 15;
export const BUILTIN_COOLDOWN_MAX = 600;

/** The one cooldown for the informational built-ins (Settings → Chat Commands). */
export function builtinCooldownSeconds(): number {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get('builtin_cooldown_seconds') as { value: string } | undefined;
  const n = Number(row?.value);
  return Number.isInteger(n) && n >= 0 && n <= BUILTIN_COOLDOWN_MAX ? n : BUILTIN_COOLDOWN_DEFAULT;
}

/** For tests: every clock back to zero. */
export function resetCooldowns(): void {
  lastAnswered.clear();
  lastAnsweredTo.clear();
}

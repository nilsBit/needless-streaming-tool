/**
 * When a chat command last answered a viewer, per key. In memory on purpose: a
 * restart forgiving every cooldown costs nothing.
 */
const lastAnswered = new Map<string, number>();

/**
 * Whether a command may answer now — and if it may, starts its cooldown.
 *
 * Broadcaster and mods skip the cooldown and do not start it either. When the
 * streamer calls up `!story` to explain something, a viewer asking a moment
 * later should still get the answer.
 */
export function passCooldown(key: string, seconds: number, privileged: boolean, now = Date.now()): boolean {
  if (privileged) return true;

  const last = lastAnswered.get(key);
  if (last !== undefined && now - last < seconds * 1000) return false;

  lastAnswered.set(key, now);
  return true;
}

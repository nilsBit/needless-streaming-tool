/**
 * What the bot tells chat on its own, without being asked: a vote starting
 * and its result, where the wheel stopped, how the goal for today ended.
 *
 * Kept apart from bot/index so voting and the routes need not import the bot
 * (bot/index → commands → voting would close a ring). The bot plugs itself in
 * when it loads; until then — and in a test — nothing is said.
 */
let send: ((message: string) => void) | null = null;

export function setChatSender(sender: (message: string) => void): void {
  send = sender;
}

export function announce(message: string): void {
  send?.(message);
}

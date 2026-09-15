import { getDb } from '../db/index';
import { splitForChat } from './chat-message';
import { getCommandNames, triggerOf, VIEWER_COMMAND_KEYS } from './command-names';

/**
 * Text Commands: chat commands whose reply the streamer wrote in the app.
 *
 * Built-in commands compute their reply; these only ever say what was
 * written. That is the whole point — the story, the world and the stream get
 * explained once, and chat calls the explanation up whenever someone new
 * arrives.
 */

export interface TextCommand {
  id: number;
  trigger: string;
  response: string;
  cooldown_seconds: number;
  /** SQLite has no boolean. */
  enabled: number;
  created_at: string;
}

/** More messages than this is a wall of text, not an explanation. */
export const MAX_REPLY_MESSAGES = 3;
export const DEFAULT_COOLDOWN_SECONDS = 30;
const MAX_COOLDOWN_SECONDS = 3600;

const TRIGGER_PATTERN = /^![a-z0-9äöüß_-]{1,30}$/;

export interface Refusal {
  status: number;
  error: string;
  message: string;
}

/**
 * Checks a new or changed Text Command. `ownId` leaves the command itself out
 * of the duplicate check, so saving an unchanged trigger is not a collision.
 *
 * A trigger that a built-in already uses — renamed or not — is refused: the
 * bot tries built-ins first, so the Text Command would never answer.
 */
export function checkTextCommand(
  command: { trigger: string; response: string; cooldown_seconds: number },
  ownId?: number,
): Refusal | null {
  if (!TRIGGER_PATTERN.test(command.trigger)) {
    return {
      status: 400,
      error: 'invalid_trigger',
      message: 'Ein Befehl ist ein einzelnes Wort aus Buchstaben, Zahlen, - oder _, z. B. !story.',
    };
  }

  if (Object.values(getCommandNames()).includes(command.trigger)) {
    return { status: 409, error: 'trigger_taken', message: `${command.trigger} ist schon ein eingebauter Befehl.` };
  }

  const duplicate = getDb()
    .prepare('SELECT id FROM text_commands WHERE trigger = ? AND id IS NOT ?')
    .get(command.trigger, ownId ?? null);
  if (duplicate) {
    return { status: 409, error: 'trigger_taken', message: `${command.trigger} gibt es schon.` };
  }

  if (!command.response.trim()) {
    return { status: 400, error: 'response_required', message: 'Ohne Text gibt es nichts zu sagen.' };
  }

  if (splitForChat(command.response).length > MAX_REPLY_MESSAGES) {
    return {
      status: 400,
      error: 'too_long',
      message: `Die Antwort passt nicht in ${MAX_REPLY_MESSAGES} Chat-Nachrichten.`,
    };
  }

  const cooldown = command.cooldown_seconds;
  if (!Number.isInteger(cooldown) || cooldown < 0 || cooldown > MAX_COOLDOWN_SECONDS) {
    return {
      status: 400,
      error: 'invalid_cooldown',
      message: `Der Cooldown ist eine ganze Zahl Sekunden zwischen 0 und ${MAX_COOLDOWN_SECONDS}.`,
    };
  }

  return null;
}

export type ChatAnswer =
  | { replies: string[] }
  | { replies: null; reason: 'unknown' | 'disabled' | 'cooldown' | 'builtin' };

/**
 * When each Text Command last answered a viewer. In memory on purpose: a
 * restart forgiving every cooldown costs nothing.
 */
const lastAnswered = new Map<number, number>();

/**
 * What the bot says to a chat message that is not a computed built-in: a Text
 * Command, or the `!befehle` list.
 *
 * The bot and `/api/text-commands/try` both come through here, so what the
 * app shows when trying a command out is what chat gets.
 *
 * Broadcaster and mods skip the cooldown and do not start it either. When the
 * streamer calls up `!story` to explain something, a viewer asking a moment
 * later should still get the answer.
 */
export function answerChatMessage(message: string, privileged: boolean, now = Date.now()): ChatAnswer {
  const trigger = triggerOf(message);
  const names = getCommandNames();

  if (trigger === names.commands) return { replies: splitForChat(commandListReply(names)) };
  if (Object.values(names).includes(trigger)) return { replies: null, reason: 'builtin' };

  const command = getDb().prepare('SELECT * FROM text_commands WHERE trigger = ?').get(trigger) as
    | TextCommand
    | undefined;
  if (!command) return { replies: null, reason: 'unknown' };
  if (!command.enabled) return { replies: null, reason: 'disabled' };

  if (!privileged) {
    const last = lastAnswered.get(command.id);
    if (last !== undefined && now - last < command.cooldown_seconds * 1000) {
      return { replies: null, reason: 'cooldown' };
    }
    lastAnswered.set(command.id, now);
  }

  return { replies: splitForChat(command.response) };
}

/** The `!befehle` reply: the streamer's own explanations first, then what the app answers. */
function commandListReply(names: Record<string, string>): string {
  const own = (
    getDb().prepare('SELECT trigger FROM text_commands WHERE enabled = 1 ORDER BY trigger').all() as Array<{
      trigger: string;
    }>
  ).map((row) => row.trigger);
  const builtin = VIEWER_COMMAND_KEYS.map((key) => names[key]).filter(Boolean);

  const groups = own.length > 0 ? [own.join(' '), builtin.join(' ')] : [builtin.join(' ')];
  return `📜 Befehle: ${groups.join(' · ')}`;
}

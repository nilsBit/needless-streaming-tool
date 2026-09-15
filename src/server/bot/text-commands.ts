import { getDb } from '../db/index';
import { splitForChat, type ChatAnswer } from './chat-message';
import { checkCooldown, checkTrigger, type Refusal } from './command-names';
import { passCooldown } from './cooldown';

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

/** Checks a new or changed Text Command. `ownId` leaves the command itself out of the duplicate check. */
export function checkTextCommand(
  command: { trigger: string; response: string; cooldown_seconds: number },
  ownId?: number,
): Refusal | null {
  const trigger = checkTrigger(command.trigger, ownId === undefined ? undefined : { table: 'text_commands', id: ownId });
  if (trigger) return trigger;

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

  return checkCooldown(command.cooldown_seconds);
}

/** A Text Command's reply to a trigger, or null when no Text Command has it. */
export function answerTextCommand(trigger: string, privileged: boolean): ChatAnswer | null {
  const command = getDb().prepare('SELECT * FROM text_commands WHERE trigger = ?').get(trigger) as
    | TextCommand
    | undefined;
  if (!command) return null;
  if (!command.enabled) return { replies: null, reason: 'disabled' };

  if (!passCooldown(`text:${command.id}`, command.cooldown_seconds, privileged)) {
    return { replies: null, reason: 'cooldown' };
  }

  return { replies: splitForChat(command.response) };
}

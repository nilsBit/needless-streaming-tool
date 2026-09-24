import { getDb } from '../db/index';
import { getStreamTimecodes } from '../obs/index';
import { splitForChat, type ChatAnswer } from './chat-message';
import { describeCommand } from './command-list';
import { getCommandNames, triggerOf, VIEWER_COMMAND_KEYS } from './command-names';
import { answerLookupCommand } from './lookup-commands';
import { answerTextCommand } from './text-commands';

/**
 * What the bot says to a chat message that no side-effecting built-in claimed:
 * `!befehle`, `!uptime`, a Text Command, or a Lookup Command — tried in that
 * order.
 *
 * The bot and `/api/chat/try` both come through here, so what the app shows
 * when trying a command out is what chat gets.
 */
export async function answerChatMessage(message: string, privileged: boolean): Promise<ChatAnswer> {
  const trigger = triggerOf(message);
  const names = getCommandNames();

  if (trigger === names.commands) {
    // `!befehle <name>` explains one command instead of naming them all.
    const wanted = message.trim().split(/\s+/).slice(1).join(' ');
    if (wanted) {
      const command = describeCommand(wanted);
      return { replies: splitForChat(command ? `${command.trigger} — ${command.description}` : `❓ „${wanted.slice(0, 40)}“ kenne ich nicht. ${commandListReply(names)}`) };
    }
    return { replies: splitForChat(commandListReply(names)) };
  }
  if (trigger === names.uptime) return { replies: [await uptimeReply()] };
  if (Object.values(names).includes(trigger)) return { replies: null, reason: 'builtin' };

  return (
    answerTextCommand(trigger, privileged) ??
    (await answerLookupCommand(message, privileged)) ?? { replies: null, reason: 'unknown' }
  );
}

/** The `!befehle` reply: the streamer's own explanations, then lookups, then what the app computes. */
function commandListReply(names: Record<string, string>): string {
  const enabled = (table: 'text_commands' | 'lookup_commands') =>
    (getDb().prepare(`SELECT trigger FROM ${table} WHERE enabled = 1 ORDER BY trigger`).all() as Array<{ trigger: string }>)
      .map((row) => row.trigger);

  const groups = [
    enabled('text_commands'),
    enabled('lookup_commands'),
    VIEWER_COMMAND_KEYS.map((key) => names[key]).filter(Boolean),
  ].filter((group) => group.length > 0);

  return `📜 Befehle: ${groups.map((group) => group.join(' ')).join(' · ')} — was einer macht: ${names.commands} <Name>`;
}

/**
 * How long the stream has been live, from OBS's own stream timecode — counted
 * from going live, not from when this app happened to start.
 */
async function uptimeReply(): Promise<string> {
  const { stream_timecode } = await getStreamTimecodes();
  if (!stream_timecode) return '⏱️ Gerade wird nicht gestreamt.';

  const [hours = 0, minutes = 0] = stream_timecode.split(':').map(Number);
  return `⏱️ Live seit ${hours > 0 ? `${hours} Std. ` : ''}${minutes} Min.`;
}

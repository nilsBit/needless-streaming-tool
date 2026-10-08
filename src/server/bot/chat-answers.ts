import { getStreamTimecodes } from '../obs/index';
import { splitForChat, type ChatAnswer } from './chat-message';
import { commandList, describeCommand, featuredCommands, withAliases, type CommandGroup, type CommandInfo } from './command-list';
import { builtinKeyOf, canonicalTrigger, getCommandNames, triggerOf } from './command-names';
import { builtinCooldownSeconds, INFO_BUILTINS, passCooldown } from './cooldown';
import { answerLookupCommand } from './lookup-commands';
import { answerTextCommand } from './text-commands';
import { privacySentence } from '../privacy-text';
import { pointsReply, rewardsListReply } from '../points/chat';

/**
 * What the bot says to a chat message that no side-effecting built-in claimed:
 * `!befehle`, `!uptime`, a Text Command, or a Lookup Command — tried in that
 * order.
 *
 * The bot and `/api/chat/try` both come through here, so what the app shows
 * when trying a command out is what chat gets.
 */
export async function answerChatMessage(message: string, privileged: boolean, viewer?: string): Promise<ChatAnswer> {
  // A second name answers as the command it stands for.
  const typed = triggerOf(message);
  const trigger = canonicalTrigger(typed);
  const asTyped = trigger === typed ? message : message.replace(/^\s*\S+/, trigger);
  const names = getCommandNames();
  const builtin = builtinKeyOf(trigger, names);

  // The built-ins that only tell something share one cooldown (Settings → Chat Commands).
  if (builtin !== null && INFO_BUILTINS.has(builtin) && !passCooldown(`builtin:${builtin}`, builtinCooldownSeconds(), privileged, { viewer })) {
    return { replies: null, reason: 'cooldown' };
  }

  if (builtin === 'commands') {
    // `!befehle <name>` explains one command; `!befehle alle` and the groups list them.
    const wanted = asTyped.trim().split(/\s+/).slice(1).join(' ');
    const group = GROUP_WORDS[wanted.toLowerCase()];
    if (group !== undefined) return { replies: splitForChat(groupReply(group, names)) };
    if (wanted) {
      const command = describeCommand(wanted);
      return { replies: splitForChat(command ? `${withAliases(command)} — ${command.description}` : `❓ „${wanted.slice(0, 40)}“ kenne ich nicht. ${featuredReply(names)}`) };
    }
    return { replies: splitForChat(featuredReply(names)) };
  }
  if (builtin === 'uptime') return { replies: [await uptimeReply()] };
  // What the tool keeps about the viewer who asks — the same sentence as on the Twitch panel.
  if (builtin === 'privacy') return { replies: [privacySentence()] };
  if (builtin === 'points') return { replies: [pointsReply(asTyped, viewer)] };
  if (builtin === 'rewards_list') return { replies: [rewardsListReply()] };
  if (builtin !== null) return { replies: null, reason: 'builtin' };

  return (
    answerTextCommand(trigger, privileged, viewer) ??
    (await answerLookupCommand(asTyped, privileged, viewer)) ?? { replies: null, reason: 'unknown' }
  );
}

/** What a viewer may type after `!befehle` to get one group — or everything. */
const GROUP_WORDS: Record<string, CommandGroup | 'all'> = {
  alle: 'all', all: 'all',
  welt: 'lookup',
  texte: 'text', eigene: 'text',
  stream: 'builtin',
};

const GROUP_NAMES: Record<CommandGroup, string> = { text: 'Erklärt', lookup: 'Aus der Welt', builtin: 'Rund um den Stream' };

/** A lookup wants a name after it; the list says so. */
const typed = (command: CommandInfo) => (command.group === 'lookup' ? `${command.trigger} <Name>` : command.trigger);

/**
 * The plain `!befehle`: a handful a newcomer needs, and how to get the rest.
 * Thirty commands in one message is a wall nobody reads.
 */
function featuredReply(names: Record<string, string>): string {
  const list = commandList();
  const { triggers } = featuredCommands(list);
  const few = triggers.map((trigger) => list.find((command) => command.trigger === trigger)).filter((c): c is CommandInfo => Boolean(c));
  const lead = few.length ? `📜 Neu hier? ${few.map(typed).join(' · ')} — ` : '📜 ';
  return `${lead}alle Befehle: ${names.commands} alle · was einer macht: ${names.commands} <Name>`;
}

/** One group of commands, or all three — the old full list, on request. */
function groupReply(group: CommandGroup | 'all', names: Record<string, string>): string {
  const list = commandList();
  const groups = (group === 'all' ? (['text', 'lookup', 'builtin'] as CommandGroup[]) : [group])
    .map((g) => ({ name: GROUP_NAMES[g], commands: list.filter((command) => command.group === g) }))
    .filter((g) => g.commands.length > 0);
  if (groups.length === 0) return featuredReply(names);
  const body = groups.map((g) => `${g.name}: ${g.commands.map(withAliases).join(' ')}`).join(' · ');
  return `📜 ${body} — was einer macht: ${names.commands} <Name>`;
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

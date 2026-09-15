import { getDb } from '../db/index';

/**
 * The built-in chat commands: internal key → the trigger a viewer types.
 *
 * Triggers can be renamed in Settings (stored as `custom_commands`); keys never
 * change. The bot and the Settings panel both read this one list, so a command
 * added here can be renamed without touching anything else.
 */
export const DEFAULT_COMMANDS: Record<string, string> = {
  challenge: '!challenge',
  issues: '!issues',
  song: '!song',
  hype: '!hype',
  uptime: '!uptime',
  design: '!design',
  todo: '!todo',
  progress: '!progress',
  scene: '!scene',
  vote: '!vote',
  sr: '!sr',
  queue: '!queue',
  rewardstats: '!stats',
  character: '!figur',
  commands: '!befehle',
};

/**
 * Built-ins a viewer can use, in the order `!befehle` names them. `!scene` is
 * for mods and `!design` runs a poll, so neither is advertised to chat.
 */
export const VIEWER_COMMAND_KEYS = [
  'challenge',
  'progress',
  'todo',
  'character',
  'issues',
  'song',
  'sr',
  'queue',
  'vote',
  'hype',
  'rewardstats',
  'uptime',
] as const;

/** Built-in triggers with the streamer's renames applied. */
export function getCommandNames(): Record<string, string> {
  try {
    const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get('custom_commands') as { value: string } | undefined;
    if (row?.value) {
      const custom = JSON.parse(row.value) as Record<string, string>;
      return { ...DEFAULT_COMMANDS, ...custom };
    }
  } catch {}
  return { ...DEFAULT_COMMANDS };
}

/** "Story", "!story " and "!STORY" are the same trigger. */
export function normalizeTrigger(raw: string): string {
  const word = raw.trim().toLowerCase();
  return word.startsWith('!') ? word : `!${word}`;
}

/** The first word of a chat message, the way commands are matched. */
export function triggerOf(message: string): string {
  return message.trim().toLowerCase().split(/\s+/)[0] ?? '';
}

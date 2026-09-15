import { getDb } from '../db/index';

/**
 * The built-in chat commands: internal key → the trigger a viewer types.
 *
 * Triggers can be renamed in Settings (stored as `custom_commands`); keys never
 * change. The bot and the Settings panel both read this one list, so a command
 * added here can be renamed without touching anything else.
 *
 * `!figur` is not in here: it is a Lookup Command, configured in the app.
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

/** Why a command the streamer configures was not saved, in words for the panel. */
export interface Refusal {
  status: number;
  error: string;
  message: string;
}

const TRIGGER_PATTERN = /^![a-z0-9äöüß_-]{1,30}$/;
const MAX_COOLDOWN_SECONDS = 3600;

type ConfiguredTable = 'text_commands' | 'lookup_commands';

/**
 * Checks that a trigger is one word and nobody else answers to it.
 *
 * Built-ins, Text Commands and Lookup Commands share one namespace in chat:
 * the bot tries them in that order, so a second owner of a trigger would
 * simply never answer. `except` leaves the command being edited out.
 */
export function checkTrigger(trigger: string, except?: { table: ConfiguredTable; id: number }): Refusal | null {
  if (!TRIGGER_PATTERN.test(trigger)) {
    return {
      status: 400,
      error: 'invalid_trigger',
      message: 'Ein Befehl ist ein einzelnes Wort aus Buchstaben, Zahlen, - oder _, z. B. !story.',
    };
  }

  if (Object.values(getCommandNames()).includes(trigger)) {
    return { status: 409, error: 'trigger_taken', message: `${trigger} ist schon ein eingebauter Befehl.` };
  }

  const owners: Array<[ConfiguredTable, string]> = [
    ['text_commands', 'ein Erklär-Command'],
    ['lookup_commands', 'ein Nachschlage-Command'],
  ];
  for (const [table, owner] of owners) {
    const ownId = except?.table === table ? except.id : null;
    if (getDb().prepare(`SELECT 1 FROM ${table} WHERE trigger = ? AND id IS NOT ?`).get(trigger, ownId)) {
      return { status: 409, error: 'trigger_taken', message: `${trigger} ist schon ${owner}.` };
    }
  }

  return null;
}

export function checkCooldown(seconds: number): Refusal | null {
  if (Number.isInteger(seconds) && seconds >= 0 && seconds <= MAX_COOLDOWN_SECONDS) return null;
  return {
    status: 400,
    error: 'invalid_cooldown',
    message: `Der Cooldown ist eine ganze Zahl Sekunden zwischen 0 und ${MAX_COOLDOWN_SECONDS}.`,
  };
}

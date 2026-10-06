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
  issues: '!themen',
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
  shoutout: '!so',
  privacy: '!datenschutz',
};

/**
 * Fixed second names for a built-in, for viewers who look in English. They
 * can't be renamed, and no configured command may take them.
 */
export const COMMAND_ALIASES: Record<string, readonly string[]> = {
  privacy: ['!privacy'],
  commands: ['!commands', '!help'],
  // What the wheel's list was called before it became "Themen".
  issues: ['!issues'],
};

const ALIASES_KEY = 'command_aliases';

/**
 * Second names the streamer gave to commands: alias → the trigger it stands
 * for. `!socials` for `!links`, `!ort` for `!region` — one answer, two names.
 */
export function getAliases(): Record<string, string> {
  try {
    const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(ALIASES_KEY) as { value: string } | undefined;
    const parsed = row?.value ? JSON.parse(row.value) : {};
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** The trigger a typed word stands for: its own, unless it is an alias. */
export function canonicalTrigger(trigger: string): string {
  return getAliases()[trigger] ?? trigger;
}

/** The second names of one trigger, for lists. */
export function aliasesOf(trigger: string, aliases: Record<string, string> = getAliases()): string[] {
  return Object.entries(aliases).filter(([, target]) => target === trigger).map(([alias]) => alias).sort();
}

/** Whether a trigger is one a viewer can type today — built-in (by any name), Text or Lookup Command. */
export function triggerExists(trigger: string): boolean {
  if (builtinKeyOf(trigger) !== null) return true;
  const db = getDb();
  return Boolean(
    db.prepare('SELECT 1 FROM text_commands WHERE trigger = ?').get(trigger) ||
    db.prepare('SELECT 1 FROM lookup_commands WHERE trigger = ?').get(trigger),
  );
}

/**
 * Takes the whole alias map as the app sends it. Every alias must be a free
 * word, every target a command that exists; nothing is kept on a refusal.
 */
export function saveAliases(input: unknown): Refusal | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { status: 400, error: 'invalid_aliases', message: 'Erwartet wird eine Zuordnung Zweitname → Befehl.' };
  }
  const clean: Record<string, string> = {};
  for (const [rawAlias, rawTarget] of Object.entries(input as Record<string, unknown>)) {
    const alias = normalizeTrigger(rawAlias);
    const target = normalizeTrigger(String(rawTarget ?? ''));
    if (!TRIGGER_PATTERN.test(alias)) {
      return { status: 400, error: 'invalid_trigger', message: `„${rawAlias}“ ist kein Befehlswort — ein Wort aus Buchstaben, Zahlen, - oder _.` };
    }
    if (triggerExists(alias)) {
      return { status: 409, error: 'trigger_taken', message: `${alias} ist schon ein Befehl und kann kein Zweitname sein.` };
    }
    if (!triggerExists(target)) {
      return { status: 404, error: 'unknown_target', message: `${target} gibt es nicht — ein Zweitname braucht einen Befehl.` };
    }
    clean[alias] = target;
  }
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(ALIASES_KEY, JSON.stringify(clean));
  return null;
}

/**
 * Built-ins a viewer can use, in the order `!befehle` names them. `!scene` and
 * `!so` are for mods and `!design` runs a poll, so none is advertised to chat.
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
  'privacy',
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

/** Which built-in a trigger calls — by its name or one of its fixed second names. */
export function builtinKeyOf(trigger: string, names: Record<string, string> = getCommandNames()): string | null {
  for (const [key, name] of Object.entries(names)) {
    if (trigger === name || COMMAND_ALIASES[key]?.includes(trigger)) return key;
  }
  return null;
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

  if (builtinKeyOf(trigger) !== null) {
    return { status: 409, error: 'trigger_taken', message: `${trigger} ist schon ein eingebauter Befehl.` };
  }

  if (getAliases()[trigger]) {
    return { status: 409, error: 'trigger_taken', message: `${trigger} ist schon ein Zweitname von ${getAliases()[trigger]}.` };
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

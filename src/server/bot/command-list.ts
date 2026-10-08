import { getDb } from '../db/index';
import { aliasesOf, DEFAULT_COMMANDS, getAliases, getCommandNames, VIEWER_COMMAND_KEYS } from './command-names';
import { commandEnabled } from '../features';
import { privacyPanelBlock } from '../privacy-text';

/**
 * Every command a viewer can type, in one place: the streamer's own texts,
 * what is looked up in the world, and the built-ins. `!befehle` in chat, the
 * app's list and the text for a Twitch panel all read from here, so a command
 * is described once.
 *
 * A description is optional everywhere. What is stored wins; otherwise one is
 * derived — the first sentence of a Text Command's answer, the Art a Lookup
 * Command searches, a fixed sentence for a built-in. The app shows the derived
 * one as a placeholder, so nothing has to be filled in to read well.
 */

export type CommandGroup = 'text' | 'lookup' | 'builtin';

export interface CommandInfo {
  trigger: string;
  description: string;
  group: CommandGroup;
  /** Text and Lookup Commands: their row; built-ins: their key. */
  id: string;
  /** Whether the description is stored or derived — the app shows a derived one as a placeholder. */
  stored: boolean;
  /** Second names a viewer may type instead. */
  aliases: string[];
}

/** Built-ins a viewer can use. `!scene` (mods) and `!design` (a poll) stay out, as in `!befehle`. */
const BUILTIN_DESCRIPTIONS: Record<string, string> = {
  challenge: 'Sagt, welche Challenge gerade läuft und wie sie steht.',
  progress: 'Zeigt, wie weit das heutige Projekt gekommen ist.',
  todo: 'Nennt die nächste offene Aufgabe.',
  issues: 'Zählt die offenen Themen fürs Glücksrad.',
  song: 'Sagt, welcher Song gerade läuft.',
  sr: 'Wünscht sich einen Song: !sr <Link oder Titel>.',
  queue: 'Zeigt die nächsten Songwünsche.',
  vote: 'Stimmt in der laufenden Abstimmung ab: !vote <Nummer>.',
  hype: 'Treibt den Hype-Zähler hoch.',
  rewardstats: 'Zeigt deinen Stand in jeder Bestenliste: !stats, oder !stats <Name>.',
  uptime: 'Sagt, wie lange der Stream schon läuft.',
  privacy: 'Sagt, was das Tool über dich speichert, wie lange, und wie du es löschen lässt.',
  points: 'Zeigt deine Punkte, deinen Beitrag und deinen Platz: !punkte, oder !punkte <Name>.',
  rewards_list: 'Nennt, was du mit deinen Punkten einlösen kannst, und was es kostet.',
  redeem: 'Löst eine Belohnung mit deinen Punkten ein: !einlösen <Name>.',
  commands: 'Nennt die wichtigsten Befehle. „!befehle alle“ listet jeden, „!befehle <Name>“ erklärt einen.',
};

const DESCRIPTIONS_KEY = 'command_descriptions';

/** The streamer's own wording for a built-in, by command key. */
export function builtinDescriptions(): Record<string, string> {
  try {
    const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(DESCRIPTIONS_KEY) as { value: string } | undefined;
    const stored = row?.value ? JSON.parse(row.value) : {};
    return typeof stored === 'object' && stored !== null ? stored : {};
  } catch {
    return {};
  }
}

export function saveBuiltinDescriptions(descriptions: Record<string, string>): Record<string, string> {
  const clean: Record<string, string> = {};
  for (const [key, text] of Object.entries(descriptions)) {
    if (Object.prototype.hasOwnProperty.call(DEFAULT_COMMANDS, key) && typeof text === 'string' && text.trim()) {
      clean[key] = text.trim().slice(0, 300);
    }
  }
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(DESCRIPTIONS_KEY, JSON.stringify(clean));
  return clean;
}

/** The first sentence of an answer, short enough for a list. */
function firstSentence(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  const end = clean.search(/[.!?](\s|$)/);
  const sentence = end === -1 ? clean : clean.slice(0, end + 1);
  return sentence.length > 140 ? `${sentence.slice(0, 137)}…` : sentence;
}

export function derivedDescription(command: { group: CommandGroup; trigger: string; response?: string; art?: string; key?: string }): string {
  if (command.group === 'text') return firstSentence(command.response ?? '') || 'Antwortet mit einem festen Text.';
  if (command.group === 'lookup') return `Zeigt einen Eintrag der Art „${command.art}“ aus der Welt — z. B. ${command.trigger} <Name>.`;
  return BUILTIN_DESCRIPTIONS[command.key ?? ''] ?? 'Eingebauter Befehl.';
}

/** Every enabled command, in the order `!befehle` names them: own texts, lookups, built-ins. */
export function commandList(): CommandInfo[] {
  const db = getDb();
  const names = getCommandNames();
  const own = builtinDescriptions();
  const aliases = getAliases();

  const texts = db.prepare('SELECT id, trigger, response, description FROM text_commands WHERE enabled = 1 ORDER BY trigger')
    .all() as Array<{ id: number; trigger: string; response: string; description: string | null }>;
  const lookups = db.prepare('SELECT id, trigger, art, description FROM lookup_commands WHERE enabled = 1 ORDER BY trigger')
    .all() as Array<{ id: number; trigger: string; art: string; description: string | null }>;

  const list: CommandInfo[] = [];
  for (const row of texts) {
    list.push({
      trigger: row.trigger, group: 'text', id: String(row.id), stored: Boolean(row.description?.trim()),
      aliases: aliasesOf(row.trigger, aliases),
      description: row.description?.trim() || derivedDescription({ group: 'text', trigger: row.trigger, response: row.response }),
    });
  }
  for (const row of lookups) {
    list.push({
      trigger: row.trigger, group: 'lookup', id: String(row.id), stored: Boolean(row.description?.trim()),
      aliases: aliasesOf(row.trigger, aliases),
      description: row.description?.trim() || derivedDescription({ group: 'lookup', trigger: row.trigger, art: row.art }),
    });
  }
  for (const key of [...VIEWER_COMMAND_KEYS, 'commands']) {
    const trigger = names[key];
    if (!trigger || !commandEnabled(key)) continue;
    list.push({
      trigger, group: 'builtin', id: key, stored: Boolean(own[key]?.trim()),
      aliases: aliasesOf(trigger, aliases),
      description: own[key]?.trim() || derivedDescription({ group: 'builtin', trigger, key }),
    });
  }
  return list;
}

/** What one command does — for `!befehle <name>`; the name may come without its `!`, and may be a second name. */
export function describeCommand(name: string): CommandInfo | undefined {
  const typed = `!${name.trim().replace(/^!+/, '').toLowerCase()}`;
  const wanted = getAliases()[typed] ?? typed;
  return commandList().find((command) => command.trigger.toLowerCase() === wanted);
}

/** A trigger with its second names, the way lists print it: "!links (auch !socials)". */
export function withAliases(command: Pick<CommandInfo, 'trigger' | 'aliases'>): string {
  return command.aliases.length ? `${command.trigger} (auch ${command.aliases.join(', ')})` : command.trigger;
}

const FEATURED_KEY = 'command_featured';
/** How many a viewer reads at a glance. */
export const MAX_FEATURED = 6;

/**
 * The few commands `!befehle` names first — the streamer's pick, stored as
 * triggers. Until picked: the usual ways in, whichever of them exist.
 */
export function featuredCommands(list: CommandInfo[] = commandList()): { triggers: string[]; stored: boolean } {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(FEATURED_KEY) as { value: string } | undefined;
  const have = new Set(list.map((command) => command.trigger));
  if (row?.value) {
    try {
      const stored = (JSON.parse(row.value) as string[]).filter((trigger) => have.has(trigger));
      return { triggers: stored, stored: true };
    } catch {}
  }
  return { triggers: ['!welt', '!story', '!figur', '!discord'].filter((trigger) => have.has(trigger)), stored: false };
}

export function saveFeaturedCommands(input: unknown): { triggers: string[] } | { error: string; message: string } {
  if (!Array.isArray(input)) return { error: 'invalid_featured', message: 'Erwartet wird eine Liste von Befehlen.' };
  const have = new Set(commandList().map((command) => command.trigger));
  const triggers: string[] = [];
  for (const raw of input) {
    const trigger = `!${String(raw).trim().replace(/^!+/, '').toLowerCase()}`;
    if (trigger === '!') continue;
    if (!have.has(trigger)) return { error: 'unknown_command', message: `${trigger} steht nicht in der Liste.` };
    if (!triggers.includes(trigger)) triggers.push(trigger);
  }
  if (triggers.length > MAX_FEATURED) return { error: 'too_many', message: `Höchstens ${MAX_FEATURED} Befehle — mehr liest im Chat niemand.` };
  if (triggers.length) getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(FEATURED_KEY, JSON.stringify(triggers));
  else getDb().prepare('DELETE FROM settings WHERE key = ?').run(FEATURED_KEY);
  return { triggers: featuredCommands().triggers };
}

const GROUP_TITLE: Record<CommandGroup, string> = {
  text: 'ERKLÄRT',
  lookup: 'AUS DER WELT',
  builtin: 'RUND UM DEN STREAM',
};

/**
 * The list as plain text for a Twitch panel under the stream — no markup,
 * since a panel shows what it gets.
 */
export function panelText(): string {
  const list = commandList();
  const blocks = (['text', 'lookup', 'builtin'] as CommandGroup[])
    .map((group) => {
      const lines = list.filter((command) => command.group === group)
        .map((command) => `${withAliases(command)} — ${command.description}`);
      return lines.length ? [GROUP_TITLE[group], ...lines].join('\n') : '';
    })
    .filter(Boolean);
  // The panel ends with what the tool keeps about viewers — the one place a viewer would look.
  return ['Befehle im Chat', ...blocks, privacyPanelBlock()].join('\n\n').trim();
}

import { getDb } from '../db/index';
import { DEFAULT_COMMANDS, getCommandNames, VIEWER_COMMAND_KEYS } from './command-names';

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
}

/** Built-ins a viewer can use. `!scene` (mods) and `!design` (a poll) stay out, as in `!befehle`. */
const BUILTIN_DESCRIPTIONS: Record<string, string> = {
  challenge: 'Sagt, welche Challenge gerade läuft und wie sie steht.',
  progress: 'Zeigt, wie weit das heutige Projekt gekommen ist.',
  todo: 'Nennt die nächste offene Aufgabe.',
  issues: 'Zählt die offenen Punkte auf der Liste.',
  song: 'Sagt, welcher Song gerade läuft.',
  sr: 'Wünscht sich einen Song: !sr <Link oder Titel>.',
  queue: 'Zeigt die nächsten Songwünsche.',
  vote: 'Stimmt in der laufenden Abstimmung ab: !vote <Nummer>.',
  hype: 'Treibt den Hype-Zähler hoch.',
  rewardstats: 'Zeigt, wer die meisten Kanalpunkte eingelöst hat.',
  uptime: 'Sagt, wie lange der Stream schon läuft.',
  commands: 'Listet alle Befehle. „!befehle <Name>“ erklärt einen einzelnen.',
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

  const texts = db.prepare('SELECT id, trigger, response, description FROM text_commands WHERE enabled = 1 ORDER BY trigger')
    .all() as Array<{ id: number; trigger: string; response: string; description: string | null }>;
  const lookups = db.prepare('SELECT id, trigger, art, description FROM lookup_commands WHERE enabled = 1 ORDER BY trigger')
    .all() as Array<{ id: number; trigger: string; art: string; description: string | null }>;

  const list: CommandInfo[] = [];
  for (const row of texts) {
    list.push({
      trigger: row.trigger, group: 'text', id: String(row.id), stored: Boolean(row.description?.trim()),
      description: row.description?.trim() || derivedDescription({ group: 'text', trigger: row.trigger, response: row.response }),
    });
  }
  for (const row of lookups) {
    list.push({
      trigger: row.trigger, group: 'lookup', id: String(row.id), stored: Boolean(row.description?.trim()),
      description: row.description?.trim() || derivedDescription({ group: 'lookup', trigger: row.trigger, art: row.art }),
    });
  }
  for (const key of [...VIEWER_COMMAND_KEYS, 'commands']) {
    const trigger = names[key];
    if (!trigger) continue;
    list.push({
      trigger, group: 'builtin', id: key, stored: Boolean(own[key]?.trim()),
      description: own[key]?.trim() || derivedDescription({ group: 'builtin', trigger, key }),
    });
  }
  return list;
}

/** What one command does — for `!befehle <name>`; the name may come without its `!`. */
export function describeCommand(name: string): CommandInfo | undefined {
  const wanted = `!${name.trim().replace(/^!+/, '').toLowerCase()}`;
  return commandList().find((command) => command.trigger.toLowerCase() === wanted);
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
        .map((command) => `${command.trigger} — ${command.description}`);
      return lines.length ? [GROUP_TITLE[group], ...lines].join('\n') : '';
    })
    .filter(Boolean);
  return ['Befehle im Chat', ...blocks].join('\n\n').trim();
}

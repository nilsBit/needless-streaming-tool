import { getDb } from '../db/index';
import { fold } from '../fold';
import { getActiveEntry, toCard, type EntryCard } from '../api/active-entry';
import { isWorldbuilderAvailable, loadEntriesFromWorld, toEntry, type EntryDetail } from '../api/worldbuilder';
import { CHAT_MESSAGE_LIMIT, type ChatAnswer } from './chat-message';
import { checkCooldown, checkTrigger, triggerOf, type Refusal } from './command-names';
import { passCooldown } from './cooldown';

/**
 * Lookup Commands: chat commands that find an entry of one Worldbuilder Art by
 * name — `!figur Mila`, `!ort Saldor` — and answer with a short description.
 *
 * Viewers ask "who is that?" all stream long. The answer is already written
 * down in the world; this lets chat read it without the streamer stopping.
 *
 * Each command points at an Art **by name**, the way the Schaufenster speaks:
 * Arten are user data, and what one world calls "Region" another calls "Ort".
 *
 * Answers go through the Entry Card, so a field the streamer hid from stream
 * stays out of chat as well.
 */

export interface LookupCommand {
  id: number;
  trigger: string;
  art: string;
  cooldown_seconds: number;
  /** SQLite has no boolean. */
  enabled: number;
  created_at: string;
}

/** Checks a new or changed Lookup Command. `ownId` leaves the command itself out of the duplicate check. */
export function checkLookupCommand(
  command: { trigger: string; art: string; cooldown_seconds: number },
  ownId?: number,
): Refusal | null {
  const trigger = checkTrigger(command.trigger, ownId === undefined ? undefined : { table: 'lookup_commands', id: ownId });
  if (trigger) return trigger;

  if (!command.art.trim()) {
    return { status: 400, error: 'art_required', message: 'In welcher Art soll gesucht werden?' };
  }

  return checkCooldown(command.cooldown_seconds);
}

/**
 * What a Lookup Command says to a chat message, or null when no Lookup Command
 * has this trigger.
 *
 * The cooldown is per name: asking for Mila and then for Selma is two
 * questions, asking for Mila twice is spam.
 */
export async function answerLookupCommand(message: string, privileged: boolean): Promise<ChatAnswer | null> {
  const command = getDb().prepare('SELECT * FROM lookup_commands WHERE trigger = ?').get(triggerOf(message)) as
    | LookupCommand
    | undefined;
  if (!command) return null;
  if (!command.enabled) return { replies: null, reason: 'disabled' };

  const query = message.trim().split(/\s+/).slice(1).join(' ');
  if (!passCooldown(`lookup:${command.id}:${fold(query)}`, command.cooldown_seconds, privileged)) {
    return { replies: null, reason: 'cooldown' };
  }

  return { replies: [await lookUp(command, query)] };
}

const WORLD_CLOSED = '📖 Die Welt ist gerade nicht geöffnet — frag gleich noch mal.';

async function lookUp(command: LookupCommand, query: string): Promise<string> {
  // The command alone asks "what is on screen right now" — when that is of its Art.
  if (!query) {
    const active = getActiveEntry();
    if (active && active.art === command.art) return describeActive(toCard(active));
  }

  const entries = await entriesOf(command.art);
  if (!entries) return WORLD_CLOSED;
  if (!query) return listing(command, entries);

  const match = findEntry(entries, query);
  if (match.length === 1) return describe(match[0]);
  if (match.length > 1) return candidates(command, match);

  // Never repeats what the viewer typed: the bot must not be a way to make it
  // say anything at all in chat.
  return `🤷 Kenne ich (noch) nicht — ${command.trigger} ohne Namen zeigt, was es gibt.`;
}

/** How long an Art's entries are reused. A busy chat must not fetch the world per message. */
const INDEX_TTL_MS = 30_000;
const index = new Map<string, { at: number; entries: EntryDetail[] }>();

/** The entries chat may find in an Art, or null when the world cannot be asked. */
async function entriesOf(art: string): Promise<EntryDetail[] | null> {
  // Checked before the cache: a closed Worldbuilder should read as closed, not
  // keep answering from what it said half a minute ago.
  if (!isWorldbuilderAvailable()) return null;

  const cached = index.get(art);
  if (cached && Date.now() - cached.at < INDEX_TTL_MS) return cached.entries;

  // Discarded entries are already left out by the loader.
  const entries = await loadEntriesFromWorld(art);
  if (!Array.isArray(entries)) return null;

  index.set(art, { at: Date.now(), entries });
  return entries;
}

/**
 * The entries a query means: every entry with exactly that name or alias if
 * there is one, otherwise every entry whose name or alias contains it.
 *
 * Exact first, so "Mila" finds Mila even though Milana contains her name.
 */
function findEntry(entries: EntryDetail[], query: string): EntryDetail[] {
  const wanted = fold(query);
  const names = (entry: EntryDetail) => [entry.titel, ...entry.zweitnamen].map(fold);

  const exact = entries.filter((entry) => names(entry).includes(wanted));
  if (exact.length > 0) return exact;
  return entries.filter((entry) => names(entry).some((name) => name.includes(wanted)));
}

function describe(entry: EntryDetail): string {
  const card = toCard(toEntry(entry, { artColor: null, world: null, image: null }));
  const head = `📖 ${card.title}${card.alias ? ` („${card.alias}“)` : ''}${card.role ? ` · ${card.role}` : ''}`;
  return oneMessage(`${head} — ${card.body || 'noch ohne Beschreibung.'}`);
}

function describeActive(card: EntryCard): string {
  const role = card.role ? ` · ${card.role}` : '';
  const about = card.body ? ` — ${card.body}` : '';
  return oneMessage(`👥 Gerade in Arbeit: ${card.title}${role}${about}`);
}

const MAX_CANDIDATES = 5;

function candidates(command: LookupCommand, found: EntryDetail[]): string {
  const shown = found.slice(0, MAX_CANDIDATES).map((entry) => entry.titel);
  const more = found.length - shown.length;
  return oneMessage(
    `🔎 Mehrere Treffer: ${shown.join(', ')}${more > 0 ? ` (+${more})` : ''} — z. B. ${command.trigger} ${shown[0]}`,
  );
}

function listing(command: LookupCommand, entries: EntryDetail[]): string {
  if (entries.length === 0) return `📖 Unter „${command.art}“ steht noch nichts in der Welt.`;
  const names = entries.map((entry) => entry.titel).join(', ');
  return oneMessage(`📖 ${command.art} — schreib ${command.trigger} <Name>: ${names}`);
}

/** A lookup answers in exactly one message. Longer text is cut between words and says so. */
function oneMessage(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= CHAT_MESSAGE_LIMIT) return flat;

  const room = CHAT_MESSAGE_LIMIT - 1;
  const space = flat.lastIndexOf(' ', room);
  return `${flat.slice(0, space > 0 ? space : room).trimEnd()}…`;
}

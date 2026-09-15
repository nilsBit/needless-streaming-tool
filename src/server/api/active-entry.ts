import fs from 'fs';
import path from 'path';
import { getDb } from '../db/index';
import { broadcast } from '../websocket/index';
import { getUserDataPath } from '../paths';
import { fold } from '../fold';
import { notionFetch } from './notion-sync';
import { holdCard } from './follow-state';
import { portraitHeaders } from './worldbuilder';
import type { Character } from './characters';

/**
 * The Active Entry: the one thing in the world the Overlay shows right now —
 * a character, but just as well a place, a guild or a concept.
 *
 * It is kept as a whole snapshot, not an id, so the Overlay keeps rendering
 * when the source goes slow or away mid-stream.
 *
 * What reaches the Overlay is not the snapshot but an Entry Card built from
 * it here, with every Hidden Field already left out. A spoiler the streamer
 * switched off never travels to a browser source, and never into chat.
 */

export interface EntryField {
  name: string;
  value: string;
}

export interface Entry {
  id: string;
  /** Decides whether time is banked back: only Notion takes anything in. */
  source: 'notion' | 'worldbuilder';
  title: string;
  art: string;
  artColor: string | null;
  maturity: string | null;
  aliases: string[];
  text: string | null;
  /** In the order the world keeps them. */
  fields: EntryField[];
  image: string | null;
  world: string | null;
}

/** What the Overlay may show of an Entry. */
export interface EntryCard {
  id: string;
  title: string;
  art: string;
  artColor: string | null;
  maturity: string | null;
  alias: string | null;
  role: string | null;
  /** Alias and role as one line under the title. */
  aliasLine: string | null;
  body: string | null;
  facts: EntryField[];
  image: string | null;
  world: string | null;
}

/** The parts of an Entry that are not fields but can be kept off stream just the same. */
export const TEXT = '@text';
export const ALIASES = '@aliases';
export const IMAGE = '@image';

/** Fields the card gives a place of their own instead of listing them as facts. */
const ROLE = 'Rolle';
const SHORT = 'Kurzbeschreibung';

function getSetting(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value || null;
}

function setSetting(key: string, value: string): void {
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

/** Which Art counts as characters. */
export function characterArt(): string {
  return getSetting('worldbuilder_art') || 'Figur';
}

// ---------- Hidden Fields ----------

export function hiddenFieldsOf(entryId: string): string[] {
  const rows = getDb()
    .prepare('SELECT field FROM hidden_entry_fields WHERE entry_id = ? ORDER BY field')
    .all(entryId) as Array<{ field: string }>;
  return rows.map((row) => row.field);
}

/**
 * Replaces the Hidden Fields of one Entry.
 *
 * Takes effect on screen at once: switching a spoiler off mid-stream is exactly
 * when this gets used.
 */
export function setHiddenFields(entryId: string, fields: string[]): string[] {
  const db = getDb();
  const unique = [...new Set(fields.map((field) => field.trim()).filter(Boolean))];
  db.transaction(() => {
    db.prepare('DELETE FROM hidden_entry_fields WHERE entry_id = ?').run(entryId);
    const insert = db.prepare('INSERT INTO hidden_entry_fields (entry_id, field) VALUES (?, ?)');
    for (const field of unique) insert.run(entryId, field);
  })();

  const active = getActiveEntry();
  if (active?.id === entryId) announce(active);
  return hiddenFieldsOf(entryId);
}

// ---------- Cards ----------

/**
 * The Entry Card: what may be shown, arranged for the Lexikon page.
 *
 * The body is the short description when there is one to show, otherwise the
 * entry's text — hiding the Kurzbeschreibung lets the text step in, which the
 * panel shows before anything goes on screen.
 */
export function toCard(entry: Entry): EntryCard {
  const hidden = new Set(hiddenFieldsOf(entry.id));
  const shown = entry.fields.filter((field) => field.value.trim() !== '' && !hidden.has(field.name));
  const valueOf = (name: string) => shown.find((field) => field.name === name)?.value ?? null;

  // An alias already part of the title ("Selma „Silberzunge“ Farrow") is not repeated.
  const alias = hidden.has(ALIASES)
    ? null
    : (entry.aliases.find((name) => !fold(entry.title).includes(fold(name))) ?? null);
  const role = valueOf(ROLE);
  const aliasText = alias && (entry.art === characterArt() ? `genannt ${alias}` : `auch: ${alias}`);

  return {
    id: entry.id,
    title: entry.title,
    art: entry.art,
    artColor: entry.artColor,
    maturity: entry.maturity,
    alias,
    role,
    aliasLine: [aliasText, role].filter(Boolean).join(' · ') || null,
    body: valueOf(SHORT) ?? (hidden.has(TEXT) ? null : entry.text?.trim() || null),
    facts: shown.filter((field) => field.name !== ROLE && field.name !== SHORT),
    image: hidden.has(IMAGE) ? null : entry.image,
    world: entry.world,
  };
}

/** The shape the Stream Deck and older overlays still read. */
export function toLegacyCharacter(entry: Entry): Character {
  const card = toCard(entry);
  return { id: card.id, name: card.title, role: card.role, status: card.maturity, summary: card.body, image: card.image };
}

/** A Character as an Entry — for Notion, and for snapshots from before Entries existed. */
export function characterToEntry(character: Character, source: Entry['source']): Entry {
  return {
    id: character.id,
    source,
    title: character.name,
    art: characterArt(),
    artColor: null,
    maturity: character.status,
    aliases: [],
    text: null,
    fields: [
      ...(character.role ? [{ name: ROLE, value: character.role }] : []),
      ...(character.summary ? [{ name: SHORT, value: character.summary }] : []),
    ],
    image: character.image,
    world: null,
  };
}

// ---------- The Active Entry ----------

export function getActiveEntry(): Entry | null {
  const raw = getSetting('active_entry');
  if (raw) {
    try {
      return JSON.parse(raw) as Entry;
    } catch {
      return null;
    }
  }

  // Pinned before Entries existed: that Active Character still shows.
  const legacy = getSetting('active_character');
  if (!legacy) return null;
  try {
    return characterToEntry(JSON.parse(legacy) as Character, 'notion');
  } catch {
    return null;
  }
}

export function activeCard(): EntryCard | null {
  const entry = getActiveEntry();
  return entry ? toCard(entry) : null;
}

export function activeCharacter(): Character | null {
  const entry = getActiveEntry();
  return entry ? toLegacyCharacter(entry) : null;
}

export function activeSince(): string | null {
  return getSetting('active_entry_since') ?? getSetting('active_character_since');
}

/** Tells every listener. `character-changed` stays for the shipped Stream Deck plugin. */
function announce(entry: Entry | null): void {
  broadcast('entry-changed', entry ? toCard(entry) : null);
  broadcast('character-changed', entry ? toLegacyCharacter(entry) : null);
}

/**
 * Puts an Entry on the Overlay: banks the time spent on the previous one,
 * copies the portrait locally, stores the snapshot and tells every listener.
 *
 * Shared by the panel, the Stream Deck's cycle button, the older character
 * route and Follow Mode, so all of them behave the same — time tracking
 * included. Anything but Follow Mode is a pick by hand, and holds the card.
 */
export async function pinEntry(entry: Entry, by: 'hand' | 'follow' = 'hand'): Promise<Entry> {
  await flushTrackedTime();

  let pinned = entry;
  // No source's URL is fit to reach an overlay directly — Notion's expires,
  // Worldbuilder's needs a token the browser will not send.
  if (entry.image) {
    const cached = await cachePortrait(entry.id, entry.image);
    // Falling back to the original only helps for Notion, whose URL at least
    // works for an hour. A Worldbuilder URL an overlay cannot follow would put
    // a broken image on stream, so it drops to no portrait at all.
    const fallback = portraitHeaders(entry.image) ? null : entry.image;
    pinned = { ...entry, image: cached ?? fallback };
  }

  setSetting('active_entry', JSON.stringify(pinned));
  setSetting('active_entry_since', String(Date.now()));
  getDb().prepare('DELETE FROM settings WHERE key = ?').run('active_character');
  announce(pinned);
  if (by === 'hand') holdCard();
  return pinned;
}

/** Clears the Overlay. That is a choice by hand too, and holds the empty card. */
export async function clearActiveEntry(): Promise<void> {
  await flushTrackedTime();
  getDb().prepare('DELETE FROM settings WHERE key IN (?, ?)').run('active_entry', 'active_character');
  announce(null);
  holdCard();
}

/**
 * Adds the minutes since the Entry was pinned to its Notion page, then clears
 * the clock.
 *
 * Only for Notion: Worldbuilder has no way in, by design. Failure here must
 * never block picking an Entry — anything that goes wrong is logged and
 * swallowed, and the clock is reset either way so a broken write can't be
 * counted twice.
 */
async function flushTrackedTime(): Promise<void> {
  const active = getActiveEntry();
  const since = activeSince();
  getDb().prepare('DELETE FROM settings WHERE key IN (?, ?)').run('active_entry_since', 'active_character_since');
  if (!active || !since || active.source !== 'notion') return;

  const minutes = Math.round((Date.now() - Number(since)) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 1) return;

  try {
    const pageRes = await notionFetch(`/v1/pages/${active.id}`, { method: 'GET' });
    if (!pageRes.ok) return;
    const page = (await pageRes.json()) as { properties?: Record<string, { number?: number | null }> };
    const previous = page.properties?.['Zeit investiert (Min)']?.number ?? 0;

    await notionFetch(`/v1/pages/${active.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        properties: { 'Zeit investiert (Min)': { number: previous + minutes } },
      }),
    });
    console.log(`[Entries] +${minutes} min auf ${active.title}`);
  } catch (err) {
    console.warn('[Entries] Zeit konnte nicht nach Notion geschrieben werden:', err);
  }
}

// ---------- Portraits ----------

export const CHARACTER_IMAGE_DIR = getUserDataPath('character-images');

const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

/**
 * Copies a portrait onto disk.
 *
 * Both sources need this, for different reasons. Notion's file URLs are signed
 * and expire after about an hour, and a pinned Entry can stay on screen far
 * longer than that. Worldbuilder's never expire, but they sit behind a token
 * and refuse cross-origin reads — an overlay in OBS cannot follow one.
 *
 * Returns a local path served by /public/character-image, or null so the
 * caller can fall back to whatever the source gave.
 */
async function cachePortrait(entryId: string, url: string): Promise<string | null> {
  const safeId = entryId.replace(/[^a-zA-Z0-9-]/g, '');
  if (!safeId) return null;
  try {
    // Worldbuilder wants its token; Notion's signed URL carries its own
    // credentials and gets no header.
    const res = await fetch(url, { headers: portraitHeaders(url) });
    if (!res.ok) return null;
    const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const ext = EXTENSION_BY_TYPE[type];
    if (!ext) return null;

    fs.mkdirSync(CHARACTER_IMAGE_DIR, { recursive: true });
    // Drop older copies of this entry so switching portraits doesn't pile up.
    for (const existing of fs.readdirSync(CHARACTER_IMAGE_DIR)) {
      if (existing.startsWith(`${safeId}.`)) fs.unlinkSync(path.join(CHARACTER_IMAGE_DIR, existing));
    }
    const filename = `${safeId}.${ext}`;
    fs.writeFileSync(path.join(CHARACTER_IMAGE_DIR, filename), Buffer.from(await res.arrayBuffer()));
    return `/public/character-image/${filename}`;
  } catch (err) {
    console.warn('[Entries] Porträt konnte nicht zwischengespeichert werden:', err);
    return null;
  }
}

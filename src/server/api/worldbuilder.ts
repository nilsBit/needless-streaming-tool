import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Character } from './characters';
import type { Entry } from './active-entry';

/**
 * Reads the world out of Worldbuilder — the desktop tool where the world this
 * stream is about actually gets written.
 *
 * Three things read it: the character list (as the second source next to
 * Notion — which one is used is a setting, and Notion stays untouched), the
 * Entries the Overlay can show, and Lookup Commands, which let chat look up
 * any entry by name.
 *
 * ## How it connects
 *
 * Worldbuilder opens a read-only HTTP window ("Schaufenster") on loopback and
 * drops its port and token in `~/.worldbuilder/anschluss.json` — the same shape
 * as the `~/.nst/connection.json` this app writes for the Stream Deck.
 *
 * There is no write path on the other side, by design. Anything that should go
 * back into the world travels as a file through Worldbuilder's own import,
 * where it gets matched and reported rather than guessed at.
 *
 * ## Vocabulary
 *
 * The far side speaks German because its domain language is German — `titel`,
 * `art`, `reifegrad`. Translation into `Entry` and `Character` happens here, at
 * the edge. Lookup Commands read the far side's shape as it is.
 */

/**
 * Where Worldbuilder announces itself.
 *
 * `WORLDBUILDER_ANSCHLUSS` redirects it — not for production, but so an
 * end-to-end run can point both halves at a scratch file instead of the real
 * one a running app may own.
 */
function connectionFile(): string {
  return process.env.WORLDBUILDER_ANSCHLUSS || path.join(os.homedir(), '.worldbuilder', 'anschluss.json');
}

/**
 * A stream must not stall because another app is busy. Two seconds is far more
 * than loopback ever needs and still short enough to fall back within a beat.
 */
const TIMEOUT_MS = 2000;

interface Connection {
  version: number;
  port: number;
  token: string;
  pid: number;
}

/** Why the world could not be read, in the shape `characters.ts` already maps to HTTP. */
export type WorldFailure = { error: string; message?: string; status?: number };

/** An entry as the Schaufenster lists it. */
interface EntryListItem {
  id: string;
  titel: string;
  art: string;
  reifegrad: string;
}

/** One entry in full. */
export interface EntryDetail extends EntryListItem {
  zweitnamen: string[];
  text: string;
  werte: Record<string, string>;
  hatBild: boolean;
}

/** An Art of the open world, with the color the streamer gave it there. */
export interface WorldArt {
  name: string;
  color: string | null;
}

const NOT_RUNNING: WorldFailure = { error: 'worldbuilder_not_running', message: 'Worldbuilder läuft nicht.' };
const NO_WORLD: WorldFailure = { error: 'worldbuilder_no_world', message: 'In Worldbuilder ist keine Welt offen.' };

function readConnection(): Connection | null {
  try {
    const raw = JSON.parse(fs.readFileSync(connectionFile(), 'utf8')) as Connection;
    if (typeof raw?.port !== 'number' || typeof raw?.token !== 'string') return null;
    return raw;
  } catch {
    return null;
  }
}

/** True when Worldbuilder has announced itself. Cheap enough to call per request. */
export function isWorldbuilderAvailable(): boolean {
  return readConnection() !== null;
}

async function get(connection: Connection, route: string): Promise<Response> {
  return fetch(`http://127.0.0.1:${connection.port}${route}`, {
    headers: { Authorization: `Bearer ${connection.token}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

/**
 * Maps a failed request to something the panel can explain.
 *
 * A refused connection is the ordinary case, not an incident: Worldbuilder is
 * simply closed, or was started without its window opened. It must read as
 * "not running", never as an error the streamer has to debug mid-stream.
 */
function asFailure(err: unknown): WorldFailure {
  const message = err instanceof Error ? err.message : String(err);
  if (err instanceof Error && err.name === 'TimeoutError') {
    return { error: 'worldbuilder_timeout', message: 'Worldbuilder antwortet nicht.' };
  }
  return {
    error: 'worldbuilder_unreachable',
    message: `Worldbuilder ist nicht erreichbar (${message}).`,
  };
}

/** The world currently open over there, for the panel to show. */
export async function loadWorld(): Promise<{ name: string } | WorldFailure> {
  const connection = readConnection();
  if (!connection) return NOT_RUNNING;
  try {
    const res = await get(connection, '/welt');
    if (res.status === 503) return NO_WORLD;
    if (!res.ok) return { error: 'worldbuilder_error', status: res.status };
    return (await res.json()) as { name: string };
  } catch (err) {
    return asFailure(err);
  }
}

/**
 * The Arten of the open world.
 *
 * Arten are user data over there: one world says "Region" where another says
 * "Ort". Whatever points at an Art by name needs to offer the ones that exist.
 */
export async function loadArtenFromWorld(): Promise<WorldArt[] | WorldFailure> {
  const connection = readConnection();
  if (!connection) return NOT_RUNNING;
  try {
    const res = await get(connection, '/arten');
    if (res.status === 503) return NO_WORLD;
    if (!res.ok) return { error: 'worldbuilder_error', status: res.status };
    return ((await res.json()) as Array<{ name: string; farbe?: string }>).map((art) => ({
      name: art.name,
      color: art.farbe || null,
    }));
  } catch (err) {
    return asFailure(err);
  }
}

/**
 * Reads every entry of one Art in full.
 *
 * The list route carries only what a list needs, so the body of each entry is
 * fetched separately — an extra round trip per entry, all of it on loopback.
 * For the dozens of entries an Art holds that is far below noticeable, and it
 * keeps the far side from having to ship the full text of a four-thousand-entry
 * world to answer a list request.
 */
export async function loadEntriesFromWorld(kind: string): Promise<EntryDetail[] | WorldFailure> {
  const connection = readConnection();
  if (!connection) return NOT_RUNNING;

  try {
    const res = await get(connection, `/eintraege?art=${encodeURIComponent(kind)}`);
    if (res.status === 503) return NO_WORLD;
    if (!res.ok) return { error: 'worldbuilder_error', status: res.status };

    const list = (await res.json()) as EntryListItem[];
    const details = await Promise.all(
      list.map(async (item) => {
        const one = await get(connection, `/eintrag/${item.id}`);
        return one.ok ? ((await one.json()) as EntryDetail) : null;
      }),
    );

    return details.filter((d): d is EntryDetail => d !== null);
  } catch (err) {
    return asFailure(err);
  }
}

/**
 * Every entry of one Art as an Entry — with its Art's color and the world's
 * name, which the Entry Card shows and the Schaufenster keeps on other routes.
 */
export async function loadWorldEntries(art: string): Promise<Entry[] | WorldFailure> {
  const connection = readConnection();
  if (!connection) return NOT_RUNNING;

  const [details, arten, world] = await Promise.all([loadEntriesFromWorld(art), loadArtenFromWorld(), loadWorld()]);
  if (!Array.isArray(details)) return details;

  const artColor = Array.isArray(arten) ? (arten.find((a) => a.name === art)?.color ?? null) : null;
  const worldName = 'name' in world ? world.name : null;
  return details.map((detail) =>
    toEntry(detail, { artColor, world: worldName, image: detail.hatBild ? imageUrl(connection, detail.id) : null }),
  );
}

/** A Schaufenster entry as an Entry. The extras live on other routes over there. */
export function toEntry(
  detail: EntryDetail,
  extras: { artColor: string | null; world: string | null; image: string | null },
): Entry {
  return {
    id: detail.id,
    source: 'worldbuilder',
    title: detail.titel,
    art: detail.art,
    artColor: extras.artColor,
    maturity: detail.reifegrad ?? null,
    aliases: detail.zweitnamen ?? [],
    text: detail.text || null,
    // Field order is the world's order — the Schaufenster sends them sorted.
    fields: Object.entries(detail.werte ?? {}).map(([name, value]) => ({ name, value })),
    image: extras.image,
    world: extras.world,
  };
}

/**
 * Not a URL the browser can follow: the Schaufenster wants a token and refuses
 * cross-origin reads. It is fetched and copied locally before it ever reaches
 * an overlay.
 */
function imageUrl(connection: Connection, id: string): string {
  return `http://127.0.0.1:${connection.port}/bild/${id}`;
}

/** Reads every entry of one kind and turns it into a Character. */
export async function loadCharactersFromWorld(kind: string): Promise<Character[] | WorldFailure> {
  const connection = readConnection();
  if (!connection) return NOT_RUNNING;

  const entries = await loadEntriesFromWorld(kind);
  if (!Array.isArray(entries)) return entries;
  return entries.map((entry) => toCharacter(connection, entry));
}

/**
 * A world entry as the older character API wants it.
 *
 * `status` is the entry's Reifegrad — Worldbuilder grades how settled a thing
 * is (Idee, Entwurf, Kanon, Verworfen) rather than tracking workflow state, and
 * that is exactly what is worth showing on stream.
 *
 * `role` prefers a field literally named "Rolle" and falls back to the entry's
 * kind. Fields are user data over there — a world may not have one, and then
 * "Figur" is a truer answer than an empty line.
 *
 * `summary` prefers a field named "Kurzbeschreibung" for the same reason: an
 * imported world describes its characters there and leaves `text` empty. When
 * both exist, the field wins — it was written to be short, `text` was not.
 */
function toCharacter(connection: Connection, entry: EntryDetail): Character {
  return {
    id: entry.id,
    name: entry.titel,
    role: entry.werte['Rolle'] ?? entry.art ?? null,
    status: entry.reifegrad ?? null,
    summary: entry.werte['Kurzbeschreibung'] || entry.text || null,
    image: entry.hatBild ? imageUrl(connection, entry.id) : null,
  };
}

/**
 * The auth header a portrait URL needs.
 *
 * Worldbuilder's image route is behind the same token as everything else, so
 * the plain fetch that works for a Notion URL does not work here.
 */
export function portraitHeaders(url: string): Record<string, string> | undefined {
  const connection = readConnection();
  if (!connection || !url.startsWith(`http://127.0.0.1:${connection.port}/`)) return undefined;
  return { Authorization: `Bearer ${connection.token}` };
}

import { Router, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { getDb } from '../db/index';
import { broadcast } from '../websocket/index';
import { notionFetch } from './notion-sync';
import { getUserDataPath } from '../paths';

/**
 * Characters live in Notion, not in this database — Notion is where the story
 * is written, so it stays the source of truth.
 *
 * The one thing kept locally is the *active* character: a snapshot of what the
 * overlay should show right now. Storing a snapshot rather than an id means the
 * overlay renders without reaching Notion on every request, and keeps showing
 * the right thing if Notion is slow or the token expires mid-stream.
 */

const router = Router();

export interface Character {
  id: string;
  name: string;
  role: string | null;
  status: string | null;
  summary: string | null;
  image: string | null;
}

function getSetting(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value || null;
}

function setSetting(key: string, value: string): void {
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

/** Notion property shapes we read. Everything else on a page is ignored. */
interface NotionProps {
  [key: string]: {
    type?: string;
    title?: Array<{ plain_text?: string }>;
    rich_text?: Array<{ plain_text?: string }>;
    select?: { name?: string } | null;
    files?: Array<{ file?: { url?: string }; external?: { url?: string } }>;
  };
}

function plainText(prop: NotionProps[string] | undefined): string | null {
  if (!prop) return null;
  const parts = prop.title ?? prop.rich_text;
  if (!parts?.length) return null;
  const text = parts.map((p) => p.plain_text ?? '').join('').trim();
  return text || null;
}

function firstFileUrl(prop: NotionProps[string] | undefined): string | null {
  const file = prop?.files?.[0];
  return file?.file?.url ?? file?.external?.url ?? null;
}

/**
 * Notion's API cannot create real database templates, so the Notion side keeps
 * a "▸ Vorlage" row per database to duplicate from. Those rows are scaffolding,
 * not characters, and must never reach the panel or the overlay.
 */
function isTemplate(name: string): boolean {
  return name.trimStart().startsWith('▸');
}

/**
 * A row with no title is an empty row Notion created on a stray click. There is
 * nothing to put on screen for it, so it never reaches the panel.
 */
function hasName(page: { properties?: NotionProps }): boolean {
  return plainText(page.properties?.['Name']) !== null;
}

function toCharacter(page: { id: string; properties?: NotionProps }): Character {
  const props = page.properties ?? {};
  return {
    id: page.id,
    name: plainText(props['Name']) ?? 'Ohne Namen',
    role: props['Rolle']?.select?.name ?? null,
    status: props['Status']?.select?.name ?? null,
    summary: plainText(props['Kurzbeschreibung']),
    image: firstFileUrl(props['Bild']),
  };
}

/** Why the character list could not be produced, in a form routes can map to HTTP. */
type LoadFailure = { error: string; message?: string; status?: number };

function isFailure(result: Character[] | LoadFailure): result is LoadFailure {
  return !Array.isArray(result);
}

/** Reads the Notion database, dropping templates and empty rows. */
async function loadCharacters(): Promise<Character[] | LoadFailure> {
  const dbId = getSetting('notion_characters_db');
  if (!dbId) {
    return { error: 'no_database', message: 'Keine Figuren-Datenbank konfiguriert.' };
  }
  try {
    const notionRes = await notionFetch(`/v1/databases/${dbId}/query`, {
      method: 'POST',
      body: JSON.stringify({ page_size: 100 }),
    });
    if (!notionRes.ok) return { error: 'notion_error', status: notionRes.status };

    const data = (await notionRes.json()) as { results?: Array<{ id: string; properties?: NotionProps }> };
    return (data.results ?? [])
      .filter(hasName)
      .map(toCharacter)
      .filter((c) => !isTemplate(c.name));
  } catch (err) {
    if (err instanceof Error && err.message === 'no_token') {
      return { error: 'no_token', message: 'Kein Notion-Token hinterlegt.' };
    }
    return { error: 'notion_unreachable' };
  }
}

function sendFailure(res: Response, failure: LoadFailure): void {
  const status = failure.error === 'no_database' || failure.error === 'no_token' ? 400 : 502;
  res.status(status).json(failure);
}

// GET / — the character list straight from Notion
router.get('/', async (_req, res) => {
  const result = await loadCharacters();
  if (isFailure(result)) { sendFailure(res, result); return; }
  res.json(result);
});

export const CHARACTER_IMAGE_DIR = getUserDataPath('character-images');

const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

/**
 * Copies a character portrait out of Notion and onto disk.
 *
 * Notion's file URLs are signed and expire after about an hour. A pinned
 * character can stay on screen far longer than that, so the snapshot must not
 * point at Notion — by the time a long stream ends, that URL is dead. Returns a
 * local path served by /public/character-image, or null so the caller can fall
 * back to whatever Notion gave us.
 */
async function cachePortrait(characterId: string, url: string): Promise<string | null> {
  const safeId = characterId.replace(/[^a-zA-Z0-9-]/g, '');
  if (!safeId) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const ext = EXTENSION_BY_TYPE[type];
    if (!ext) return null;

    fs.mkdirSync(CHARACTER_IMAGE_DIR, { recursive: true });
    // Drop older copies of this character so switching portraits doesn't pile up.
    for (const existing of fs.readdirSync(CHARACTER_IMAGE_DIR)) {
      if (existing.startsWith(`${safeId}.`)) fs.unlinkSync(path.join(CHARACTER_IMAGE_DIR, existing));
    }
    const filename = `${safeId}.${ext}`;
    fs.writeFileSync(path.join(CHARACTER_IMAGE_DIR, filename), Buffer.from(await res.arrayBuffer()));
    return `/public/character-image/${filename}`;
  } catch (err) {
    console.warn('[Characters] Portrait konnte nicht zwischengespeichert werden:', err);
    return null;
  }
}

/** The active character as the overlay sees it, or null when none is set. */
export function getActiveCharacter(): Character | null {
  const raw = getSetting('active_character');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Character;
  } catch {
    return null;
  }
}

router.get('/active', (_req, res) => {
  res.json({ character: getActiveCharacter(), since: getSetting('active_character_since') });
});

/**
 * Adds the minutes since the character was pinned to its Notion page, then
 * clears the clock.
 *
 * Failure here must never block picking a character — the stream keeps running
 * even when Notion does not. Anything that goes wrong is logged and swallowed,
 * and the clock is reset either way so a broken write can't be counted twice.
 */
async function flushTrackedTime(): Promise<void> {
  const active = getActiveCharacter();
  const since = getSetting('active_character_since');
  getDb().prepare('DELETE FROM settings WHERE key = ?').run('active_character_since');
  if (!active || !since) return;

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
    console.log(`[Characters] +${minutes} min auf ${active.name}`);
  } catch (err) {
    console.warn('[Characters] Zeit konnte nicht nach Notion geschrieben werden:', err);
  }
}

// POST /active — pin a character to the overlay. The client sends the whole
// character so the snapshot never needs a Notion round trip.
router.post('/active', async (req, res) => {
  const { id, name, role, status, summary, image } = req.body ?? {};
  if (typeof id !== 'string' || !id.trim()) {
    res.status(400).json({ error: 'id_required' });
    return;
  }
  if (typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'name_required' });
    return;
  }
  const character: Character = {
    id: id.trim(),
    name: name.trim(),
    role: typeof role === 'string' ? role : null,
    status: typeof status === 'string' ? status : null,
    summary: typeof summary === 'string' ? summary : null,
    image: typeof image === 'string' ? image : null,
  };
  res.json({ character: await pin(character) });
});

/**
 * Puts a character on the overlay: banks the time spent on the previous one,
 * caches the portrait, stores the snapshot and tells every listener.
 *
 * Shared by the panel (POST /active) and the Stream Deck (POST /cycle) so both
 * routes behave identically — including the time tracking.
 */
async function pin(character: Character): Promise<Character> {
  await flushTrackedTime();

  // Notion's signed URL outlives neither a long stream nor a restart.
  if (character.image) {
    character.image = (await cachePortrait(character.id, character.image)) ?? character.image;
  }

  setSetting('active_character', JSON.stringify(character));
  setSetting('active_character_since', String(Date.now()));
  broadcast('character-changed', character);
  return character;
}

/**
 * POST /cycle — advance to the next character, wrapping at the end.
 *
 * Exists for the Stream Deck, which has one button and no way to pick from a
 * list. Deliberately takes no arguments: the button needs no configuration and
 * keeps working when characters are added or removed in Notion.
 */
router.post('/cycle', async (_req, res) => {
  const result = await loadCharacters();
  if (isFailure(result)) { sendFailure(res, result); return; }
  if (result.length === 0) {
    res.status(404).json({ error: 'no_characters' });
    return;
  }

  const active = getActiveCharacter();
  const current = active ? result.findIndex((c) => c.id === active.id) : -1;
  // Unknown or absent current character starts the cycle at the top.
  const next = result[(current + 1) % result.length];

  res.json({ character: await pin(next), position: (current + 1) % result.length + 1, total: result.length });
});

router.delete('/active', async (_req, res) => {
  await flushTrackedTime();
  getDb().prepare('DELETE FROM settings WHERE key = ?').run('active_character');
  broadcast('character-changed', null);
  res.json({ success: true });
});

export default router;

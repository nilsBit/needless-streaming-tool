import { Router, Response } from 'express';
import { getDb } from '../db/index';
import { notionFetch } from './notion-sync';
import { loadCharactersFromWorld, loadWorld, loadWorldEntries } from './worldbuilder';
import {
  activeCharacter,
  activeSince,
  characterArt,
  characterToEntry,
  clearActiveEntry,
  getActiveEntry,
  pinEntry,
  toLegacyCharacter,
  type Entry,
} from './active-entry';

/**
 * Characters are never authored here — they are read from wherever the story
 * is being written, and one of them is put on screen.
 *
 * That used to be Notion by definition. It is now a choice between two sources
 * (see `character_source`): Notion, and Worldbuilder — the desktop world-builder
 * on this machine, which needs no account and is where this stream's world
 * actually gets written. Notion stays the default so an existing setup is
 * unaffected.
 *
 * Since the Overlay shows any Entry, a Character is just an Entry of the
 * character Art. These routes keep the character-shaped API that the Stream
 * Deck plugin and older overlays speak; the Active Entry behind them lives in
 * `active-entry.ts`.
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

/** Why a list could not be produced, in a form routes can map to HTTP. */
export type LoadFailure = { error: string; message?: string; status?: number };

export function isFailure<T>(result: T[] | LoadFailure): result is LoadFailure {
  return !Array.isArray(result);
}

/**
 * Where characters come from.
 *
 * Notion stays the default so an existing setup keeps behaving exactly as it
 * did. Worldbuilder is the local alternative: the same world, on this machine,
 * with no account behind it.
 */
type CharacterSource = 'notion' | 'worldbuilder';

export function characterSource(): CharacterSource {
  return getSetting('character_source') === 'worldbuilder' ? 'worldbuilder' : 'notion';
}

/** The character list from whichever source is configured. */
async function loadCharacters(): Promise<Character[] | LoadFailure> {
  return characterSource() === 'worldbuilder'
    ? loadCharactersFromWorld(characterArt())
    : loadFromNotion();
}

/** Reads the Notion database, dropping templates and empty rows. */
export async function loadFromNotion(): Promise<Character[] | LoadFailure> {
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

/**
 * Something the streamer has to fix (400), or something that is simply not
 * there right now (503), or a source that answered badly (502).
 *
 * Worldbuilder being closed is the middle case on purpose. It is not a
 * misconfiguration and not a fault — it is a program that is not running, and
 * starting it is the whole remedy.
 */
const NEEDS_CONFIGURATION = ['no_database', 'no_token'];
const NOT_RIGHT_NOW = ['worldbuilder_not_running', 'worldbuilder_no_world', 'worldbuilder_timeout'];

export function sendFailure(res: Response, failure: LoadFailure): void {
  const status = NEEDS_CONFIGURATION.includes(failure.error)
    ? 400
    : NOT_RIGHT_NOW.includes(failure.error)
      ? 503
      : 502;
  res.status(status).json(failure);
}

// GET / — the character list from whichever source is configured
router.get('/', async (_req, res) => {
  const result = await loadCharacters();
  if (isFailure(result)) { sendFailure(res, result); return; }
  res.json(result);
});

/**
 * GET /source — which source is in use, and what it is currently attached to.
 *
 * Worth its own route because picking characters out of the wrong world is a
 * mistake that only shows up on stream. The panel can name the world before
 * anything goes on screen.
 */
router.get('/source', async (_req, res) => {
  const source = characterSource();
  if (source !== 'worldbuilder') {
    res.json({ source, configured: !!getSetting('notion_characters_db') });
    return;
  }

  const world = await loadWorld();
  res.json({
    source,
    kind: characterArt(),
    world: 'name' in world ? world.name : null,
    ...('error' in world ? { error: world.error, message: world.message } : {}),
  });
});

// POST /source — switch between Notion and Worldbuilder.
router.post('/source', (req, res) => {
  const { source, kind } = req.body ?? {};
  if (source !== 'notion' && source !== 'worldbuilder') {
    res.status(400).json({ error: 'source_invalid', message: "notion oder worldbuilder." });
    return;
  }
  setSetting('character_source', source);
  if (typeof kind === 'string' && kind.trim()) setSetting('worldbuilder_art', kind.trim());
  res.json({ source, kind: characterArt() });
});

router.get('/active', (_req, res) => {
  res.json({ character: activeCharacter(), since: activeSince() });
});

// POST /active — pin a character to the overlay. The client sends the whole
// character so the snapshot never needs a round trip to the source.
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
  const pinned = await pinEntry(characterToEntry(character, characterSource()));
  res.json({ character: toLegacyCharacter(pinned) });
});

/** The characters to cycle through, as full Entries where the source has them. */
async function loadCycle(): Promise<Entry[] | LoadFailure> {
  if (characterSource() === 'worldbuilder') return loadWorldEntries(characterArt());
  const characters = await loadFromNotion();
  return isFailure(characters) ? characters : characters.map((c) => characterToEntry(c, 'notion'));
}

/**
 * POST /cycle — advance to the next character, wrapping at the end.
 *
 * Exists for the Stream Deck, which has one button and no way to pick from a
 * list. Deliberately takes no arguments: the button needs no configuration and
 * keeps working when characters are added or removed at the source.
 */
router.post('/cycle', async (_req, res) => {
  const result = await loadCycle();
  if (isFailure(result)) { sendFailure(res, result); return; }
  if (result.length === 0) {
    res.status(404).json({ error: 'no_characters' });
    return;
  }

  const active = getActiveEntry();
  const current = active ? result.findIndex((entry) => entry.id === active.id) : -1;
  // Unknown or absent current character starts the cycle at the top.
  const position = (current + 1) % result.length;
  const pinned = await pinEntry(result[position]);

  res.json({ character: toLegacyCharacter(pinned), position: position + 1, total: result.length });
});

router.delete('/active', async (_req, res) => {
  await clearActiveEntry();
  res.json({ success: true });
});

export default router;

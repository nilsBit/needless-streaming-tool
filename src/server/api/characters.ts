import { Router } from 'express';
import { getDb } from '../db/index';
import { broadcast } from '../websocket/index';
import { notionFetch } from './notion-sync';

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

// GET / — the character list straight from Notion
router.get('/', async (_req, res) => {
  const dbId = getSetting('notion_characters_db');
  if (!dbId) {
    res.status(400).json({ error: 'no_database', message: 'Keine Figuren-Datenbank konfiguriert.' });
    return;
  }
  try {
    const notionRes = await notionFetch(`/v1/databases/${dbId}/query`, {
      method: 'POST',
      body: JSON.stringify({ page_size: 100 }),
    });
    if (!notionRes.ok) {
      res.status(502).json({ error: 'notion_error', status: notionRes.status });
      return;
    }
    const data = (await notionRes.json()) as { results?: Array<{ id: string; properties?: NotionProps }> };
    res.json((data.results ?? []).map(toCharacter));
  } catch (err) {
    if (err instanceof Error && err.message === 'no_token') {
      res.status(400).json({ error: 'no_token', message: 'Kein Notion-Token hinterlegt.' });
      return;
    }
    res.status(502).json({ error: 'notion_unreachable' });
  }
});

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
  // Bank the time spent on whoever was pinned before switching.
  await flushTrackedTime();

  setSetting('active_character', JSON.stringify(character));
  setSetting('active_character_since', String(Date.now()));
  broadcast('character-changed', character);
  res.json({ character });
});

router.delete('/active', async (_req, res) => {
  await flushTrackedTime();
  getDb().prepare('DELETE FROM settings WHERE key = ?').run('active_character');
  broadcast('character-changed', null);
  res.json({ success: true });
});

export default router;

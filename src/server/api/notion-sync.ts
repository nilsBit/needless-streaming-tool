import { getDb } from '../db/index';
import { NotionDatabase, NotionPage, NotionDatabaseCheck } from '../../shared/types';

const NOTION_VERSION = '2022-06-28';

function getNotionToken(): string | null {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get('notion_token') as { value: string } | undefined;
  return row?.value || null;
}

function getNotionClipsDbId(): string | null {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get('notion_clips_db') as { value: string } | undefined;
  return row?.value || null;
}

// --- Rate limiter: max 3 concurrent Notion requests, one 500ms retry on 429 ---
let active = 0;
const queue: Array<() => void> = [];

function acquire(): Promise<void> {
  return new Promise((resolve) => {
    if (active < 3) { active++; resolve(); return; }
    queue.push(() => { active++; resolve(); });
  });
}

function release(): void {
  active--;
  const next = queue.shift();
  if (next) next();
}

async function notionFetch(path: string, init: RequestInit & { method: string }): Promise<Response> {
  const token = getNotionToken();
  if (!token) throw new Error('no_token');
  await acquire();
  try {
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    };
    let res = await fetch(`https://api.notion.com${path}`, { ...init, headers });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 500));
      res = await fetch(`https://api.notion.com${path}`, { ...init, headers });
    }
    return res;
  } finally {
    release();
  }
}

// Required schema: property name → Notion property type descriptor
export const REQUIRED_PROPERTIES: Record<string, Record<string, unknown>> = {
  'Clip': { title: {} },
  'Tag': { select: { options: [] } },
  'Session': { date: {} },
  'Zeitstempel': { rich_text: {} },
  'Notiz': { rich_text: {} },
  'Synced': { checkbox: {} },
};

function computeMissingProperties(dbProps: Record<string, { type?: string }>): string[] {
  const missing: string[] = [];
  for (const [name, spec] of Object.entries(REQUIRED_PROPERTIES)) {
    const actual = dbProps[name];
    if (!actual) { missing.push(name); continue; }
    const expectedType = Object.keys(spec)[0]; // 'title', 'select', 'date', 'rich_text', 'checkbox'
    if (actual.type !== expectedType) missing.push(name);
  }
  return missing;
}

function extractTitle(titleArr: Array<{ plain_text?: string }> | undefined): string {
  if (!titleArr || titleArr.length === 0) return '(ohne Titel)';
  return titleArr.map((t) => t.plain_text || '').join('') || '(ohne Titel)';
}

function extractIcon(icon: { type?: string; emoji?: string; external?: { url: string }; file?: { url: string } } | null | undefined): string | null {
  if (!icon) return null;
  if (icon.type === 'emoji' && icon.emoji) return icon.emoji;
  if (icon.type === 'external' && icon.external?.url) return icon.external.url;
  if (icon.type === 'file' && icon.file?.url) return icon.file.url;
  return null;
}

export async function listDatabases(): Promise<NotionDatabase[]> {
  const res = await notionFetch('/v1/search', {
    method: 'POST',
    body: JSON.stringify({ filter: { value: 'database', property: 'object' }, page_size: 100 }),
  });
  if (!res.ok) throw new Error(res.status === 401 ? 'token_invalid' : `notion_error_${res.status}`);
  const data = await res.json();
  const results: NotionDatabase[] = [];
  for (const db of data.results || []) {
    results.push({
      id: db.id,
      title: extractTitle(db.title),
      icon: extractIcon(db.icon),
      url: db.url,
      missing_properties: computeMissingProperties(db.properties || {}),
    });
  }
  return results;
}

export async function listPages(): Promise<NotionPage[]> {
  const res = await notionFetch('/v1/search', {
    method: 'POST',
    body: JSON.stringify({ filter: { value: 'page', property: 'object' }, page_size: 100 }),
  });
  if (!res.ok) throw new Error(res.status === 401 ? 'token_invalid' : `notion_error_${res.status}`);
  const data = await res.json();
  const results: NotionPage[] = [];
  for (const page of data.results || []) {
    // Page-Titles leben in properties, suche die title-Property
    let title = '(ohne Titel)';
    for (const prop of Object.values(page.properties || {}) as Array<{ type: string; title?: Array<{ plain_text?: string }> }>) {
      if (prop.type === 'title' && prop.title) { title = extractTitle(prop.title); break; }
    }
    results.push({ id: page.id, title, icon: extractIcon(page.icon), url: page.url });
  }
  return results;
}

export async function createDatabase(parentPageId: string, title: string): Promise<{ id: string; title: string; url: string }> {
  const res = await notionFetch('/v1/databases', {
    method: 'POST',
    body: JSON.stringify({
      parent: { type: 'page_id', page_id: parentPageId },
      title: [{ type: 'text', text: { content: title } }],
      properties: REQUIRED_PROPERTIES,
    }),
  });
  if (!res.ok) {
    if (res.status === 404 || res.status === 403) throw new Error('no_parent_access');
    if (res.status === 401) throw new Error('token_invalid');
    throw new Error(`notion_error_${res.status}`);
  }
  const data = await res.json();
  return { id: data.id, title: extractTitle(data.title), url: data.url };
}

export async function healDatabase(databaseId: string): Promise<{ added: string[]; renamed?: { from: string; to: string } }> {
  const getRes = await notionFetch(`/v1/databases/${databaseId}`, { method: 'GET' });
  if (!getRes.ok) {
    if (getRes.status === 404) throw new Error('db_gone');
    if (getRes.status === 401) throw new Error('token_invalid');
    throw new Error(`notion_error_${getRes.status}`);
  }
  const data = await getRes.json();
  const dbProps: Record<string, { type?: string }> = data.properties || {};
  const missing = computeMissingProperties(dbProps);
  if (missing.length === 0) return { added: [] };

  const patchProps: Record<string, unknown> = {};
  let renamed: { from: string; to: string } | undefined;

  for (const name of missing) {
    const spec = REQUIRED_PROPERTIES[name];
    const expectedType = Object.keys(spec)[0];
    // Notion allows only one title property per DB. If we need a title and one
    // already exists under a different name, rename it instead of adding a new one.
    if (expectedType === 'title') {
      const existingTitle = Object.entries(dbProps).find(([, p]) => p.type === 'title');
      if (existingTitle && existingTitle[0] !== name) {
        patchProps[existingTitle[0]] = { name };
        renamed = { from: existingTitle[0], to: name };
        continue;
      }
    }
    patchProps[name] = spec;
  }

  const patchRes = await notionFetch(`/v1/databases/${databaseId}`, {
    method: 'PATCH',
    body: JSON.stringify({ properties: patchProps }),
  });
  if (!patchRes.ok) {
    const body = await patchRes.text().catch(() => '');
    throw new Error(`notion_error_${patchRes.status}: ${body.slice(0, 300)}`);
  }
  return { added: missing, renamed };
}

export async function checkDatabase(): Promise<NotionDatabaseCheck> {
  const token = getNotionToken();
  if (!token) return { ok: false, error: 'token_invalid' };
  const dbId = getNotionClipsDbId();
  if (!dbId) return { ok: false, error: 'no_db' };
  try {
    const res = await notionFetch(`/v1/databases/${dbId}`, { method: 'GET' });
    if (res.status === 401) return { ok: false, error: 'token_invalid' };
    if (res.status === 404) return { ok: false, error: 'db_gone' };
    if (!res.ok) return { ok: false, error: 'db_gone' };
    const data = await res.json();
    const missing = computeMissingProperties(data.properties || {});
    if (missing.length > 0) return { ok: false, missing_properties: missing };
    return { ok: true };
  } catch {
    return { ok: false, error: 'db_gone' };
  }
}

interface ClipRow {
  id: number;
  tag: string;
  note: string | null;
  session_date: string;
  created_at: string;
}

export async function syncClipToNotion(clip: ClipRow): Promise<boolean> {
  const token = getNotionToken();
  if (!token) { console.log('[Notion] No token configured — skipping sync'); return false; }
  const dbId = getNotionClipsDbId();
  if (!dbId) { console.log('[Notion] No clips database ID configured — skipping sync'); return false; }

  const time = new Date(clip.created_at + 'Z').toLocaleTimeString('de-DE', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  try {
    const res = await notionFetch('/v1/pages', {
      method: 'POST',
      body: JSON.stringify({
        parent: { database_id: dbId },
        properties: {
          'Clip': { title: [{ text: { content: `${clip.tag} — ${time}` } }] },
          'Tag': { select: { name: clip.tag } },
          'Session': { date: { start: clip.session_date } },
          'Zeitstempel': { rich_text: [{ text: { content: time } }] },
          'Notiz': clip.note
            ? { rich_text: [{ text: { content: clip.note } }] }
            : { rich_text: [] },
          'Synced': { checkbox: true },
        },
      }),
    });
    if (res.ok) {
      const data = await res.json();
      getDb().prepare('UPDATE clips SET notion_page_id = ? WHERE id = ?').run(data.id, clip.id);
      console.log(`[Notion] Synced clip ${clip.id} → page ${data.id}`);
      return true;
    } else {
      const err = await res.json().catch(() => ({}));
      console.error(`[Notion] Sync failed:`, err.message || err);
      return false;
    }
  } catch (err) {
    console.error('[Notion] Sync error:', err);
    return false;
  }
}

# Clip Moments: Notion-DB-Picker + Panel-Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Non-technical Streamer sollen ihre Notion-Clip-Datenbank per Picker auswählen (oder auto-generieren lassen), Clips werden automatisch gesynct mit sichtbarem Status pro Clip, und das ClipsPanel wird visuell aufgeräumt.

**Architecture:** Backend bekommt neue Notion-REST-Helper (listDatabases/listPages/createDatabase/healDatabase/checkDatabase) und Auto-Sync-Hooks in `clips.ts`. Frontend bekommt zwei neue geteilte Komponenten (`NotionDatabasePicker`, `ClipSyncBadge`), die in Onboarding + Settings ersetzen/ersetzen, und der `ClipsPanel` wird mit Tag-Breakdown, Card-Styling und Sync-Badges aufgewertet. Schema-Migration v11→v12 fügt `clips.notion_page_id TEXT` hinzu.

**Tech Stack:** TypeScript, Electron, React, Vite, Express, better-sqlite3, ws. Notion REST API v1 (2022-06-28).

**Spec:** `docs/superpowers/specs/2026-04-20-clip-moments-notion-db-picker-design.md`

**Conventions:**
- Projekt hat keine Automated Tests — Verifikation per `npm run typecheck` und `npm run lint`. Manuelle QA am Ende.
- Direkte Commits auf `main` sind vom Nutzer für dieses Projekt freigegeben.
- Commits folgen conventional commits.

---

## File Map

**Neu:**
- `src/renderer/src/components/NotionDatabasePicker.tsx`
- `src/renderer/src/components/ClipSyncBadge.tsx`

**Geändert:**
- `src/server/db/schema.ts` — `SCHEMA_VERSION` von 11 → 12
- `src/server/db/index.ts` — neue Migration `from < 12`
- `src/shared/types.ts` — `Clip.notion_page_id` + neue Notion-Types
- `src/server/api/notion-sync.ts` — neue Helper + Queue + Update von `notion_page_id`
- `src/server/api/settings.ts` — neue Endpoints
- `src/server/api/clips.ts` — Auto-Sync-Gating, PATCH-Sync-Hook, `/sync`-Filter, WS-Events
- `src/server/auto-clips.ts` — markiert Auto-Clips damit `createClip` nicht sofort syncet (via Tag-Prefix, bereits vorhanden)
- `src/renderer/src/i18n/translations.ts` — neue Keys, alte entfernen
- `src/renderer/src/components/onboarding/NotionStep.tsx` — auf `NotionDatabasePicker` umstellen
- `src/renderer/src/panels/SettingsPanel.tsx` — Notion-Sektion auf `NotionDatabasePicker` umstellen
- `src/renderer/src/panels/ClipsPanel.tsx` — Auto-Sync-Toggle, Tag-Breakdown, Card-Style, Sync-Badges
- `src/renderer/src/index.css` — neue Styles

---

## Task 1: DB-Migration v11 → v12 (`clips.notion_page_id`) + Shared Types

**Files:**
- Modify: `src/server/db/schema.ts`
- Modify: `src/server/db/index.ts`
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Bump schema version**

Edit `src/server/db/schema.ts` line 1:

```ts
export const SCHEMA_VERSION = 12;
```

- [ ] **Step 2: Add migration block**

In `src/server/db/index.ts`, add a new migration branch right after the `from < 11` block, before the `INSERT OR REPLACE INTO schema_version` at the end of `runMigrations`:

```ts
  if (from < 12) {
    try { db.exec('ALTER TABLE clips ADD COLUMN notion_page_id TEXT'); } catch {}
    console.log('[DB] Migrated: added notion_page_id to clips');
  }
```

- [ ] **Step 3: Extend Clip type + add new Notion types**

Edit `src/shared/types.ts`. Change the `Clip` interface (line ~78):

```ts
export interface Clip {
  id: number;
  tag: string;
  note: string | null;
  session_date: string;
  stream_timecode: string | null;
  recording_timecode: string | null;
  confidence: 'high' | 'medium' | null;
  notion_page_id: string | null;
  created_at: string;
}
```

Append at the end of the file:

```ts
export interface NotionDatabase {
  id: string;
  title: string;
  icon: string | null;
  url: string;
  missing_properties: string[];
}

export interface NotionPage {
  id: string;
  title: string;
  icon: string | null;
  url: string;
}

export type NotionDatabaseCheck =
  | { ok: true }
  | { ok: false; missing_properties: string[] }
  | { ok: false; error: 'token_invalid' | 'db_gone' | 'no_db' };
```

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck
```

Expected: passes. If any file consuming `Clip` complains about missing `notion_page_id`, that file probably destructures — leave it (most consumers treat Clip as a whole).

- [ ] **Step 5: Commit**

```bash
git add src/server/db/schema.ts src/server/db/index.ts src/shared/types.ts
git commit -m "feat(notion): add notion_page_id to clips + shared types for db picker"
```

---

## Task 2: Backend — Notion-API-Helper in `notion-sync.ts`

**Files:**
- Modify: `src/server/api/notion-sync.ts`

- [ ] **Step 1: Add shared request helper + rate limiter**

Replace the entire content of `src/server/api/notion-sync.ts` with the content from Steps 1–5 below. Start at the top with imports + token/db-id getters (keep existing):

```ts
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
```

- [ ] **Step 2: Add required schema + property-delta helper**

Append to the same file:

```ts
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
```

- [ ] **Step 3: Add listDatabases + listPages**

Append:

```ts
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
```

- [ ] **Step 4: Add createDatabase + healDatabase + checkDatabase**

Append:

```ts
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

export async function healDatabase(databaseId: string): Promise<{ added: string[] }> {
  const getRes = await notionFetch(`/v1/databases/${databaseId}`, { method: 'GET' });
  if (!getRes.ok) {
    if (getRes.status === 404) throw new Error('db_gone');
    if (getRes.status === 401) throw new Error('token_invalid');
    throw new Error(`notion_error_${getRes.status}`);
  }
  const data = await getRes.json();
  const missing = computeMissingProperties(data.properties || {});
  if (missing.length === 0) return { added: [] };
  const patchProps: Record<string, unknown> = {};
  for (const name of missing) patchProps[name] = REQUIRED_PROPERTIES[name];
  const patchRes = await notionFetch(`/v1/databases/${databaseId}`, {
    method: 'PATCH',
    body: JSON.stringify({ properties: patchProps }),
  });
  if (!patchRes.ok) throw new Error(`notion_error_${patchRes.status}`);
  return { added: missing };
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
```

- [ ] **Step 5: Update existing syncClipToNotion**

Replace the existing `ClipRow` interface and `syncClipToNotion` function at the bottom of the file with this version that also sets `notion_page_id`:

```ts
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
```

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck
```

Expected: passes.

- [ ] **Step 7: Commit**

```bash
git add src/server/api/notion-sync.ts
git commit -m "feat(notion): add db list/create/heal/check helpers + rate-limited fetch"
```

---

## Task 3: Backend — Neue Notion-Settings-Endpoints

**Files:**
- Modify: `src/server/api/settings.ts`

- [ ] **Step 1: Import new helpers**

At the top of `src/server/api/settings.ts`, replace the existing import block's settings-related section. After the `import { DEFAULT_HOTKEYS } from '../../shared/types';` line, add:

```ts
import { listDatabases, listPages, createDatabase, healDatabase, checkDatabase } from './notion-sync';
```

- [ ] **Step 2: Add GET /notion/databases**

After the existing `router.post('/notion/database', ...)` handler (around line 93), insert:

```ts
router.get('/notion/databases', async (_req, res) => {
  try {
    const dbs = await listDatabases();
    res.json(dbs);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'no_token' || msg === 'token_invalid') {
      res.status(401).json({ error: msg });
    } else {
      res.status(502).json({ error: 'notion_error', details: msg });
    }
  }
});

router.get('/notion/pages', async (_req, res) => {
  try {
    const pages = await listPages();
    res.json(pages);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'no_token' || msg === 'token_invalid') {
      res.status(401).json({ error: msg });
    } else {
      res.status(502).json({ error: 'notion_error', details: msg });
    }
  }
});

router.post('/notion/database/create', async (req, res) => {
  const { parent_page_id, title } = req.body as { parent_page_id?: string; title?: string };
  if (!parent_page_id) { res.status(400).json({ error: 'parent_page_id required' }); return; }
  try {
    const created = await createDatabase(parent_page_id, (title && title.trim()) || 'Stream Clips');
    getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('notion_clips_db', created.id);
    // Auto-Sync-Default on first configuration
    const existingAutoSync = getDb().prepare('SELECT value FROM settings WHERE key = ?').get('notion_auto_sync') as { value: string } | undefined;
    if (!existingAutoSync) {
      getDb().prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('notion_auto_sync', 'true');
    }
    res.json(created);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'no_parent_access') res.status(403).json({ error: msg });
    else if (msg === 'token_invalid' || msg === 'no_token') res.status(401).json({ error: msg });
    else res.status(502).json({ error: 'notion_error', details: msg });
  }
});

router.post('/notion/database/heal', async (req, res) => {
  const { database_id } = req.body as { database_id?: string };
  if (!database_id) { res.status(400).json({ error: 'database_id required' }); return; }
  try {
    const result = await healDatabase(database_id);
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'db_gone') res.status(404).json({ error: msg });
    else if (msg === 'token_invalid' || msg === 'no_token') res.status(401).json({ error: msg });
    else res.status(502).json({ error: 'notion_error', details: msg });
  }
});

router.get('/notion/database/check', async (_req, res) => {
  const result = await checkDatabase();
  res.json(result);
});
```

- [ ] **Step 3: Also set `notion_auto_sync` default when saving an existing DB via picker**

Modify the existing `router.post('/notion/database', ...)` block (lines ~82–93) to set the default auto-sync setting after saving:

```ts
router.post('/notion/database', (req, res) => {
  const { database_id } = req.body;
  if (database_id === undefined) { res.status(400).json({ error: 'database_id required' }); return; }
  if (database_id) {
    // Clean up: accept full Notion URLs or just the ID
    const cleanId = database_id.replace(/[-]/g, '').replace(/.*\/([a-f0-9]{32}).*/, '$1');
    getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('notion_clips_db', cleanId);
    const existingAutoSync = getDb().prepare('SELECT value FROM settings WHERE key = ?').get('notion_auto_sync') as { value: string } | undefined;
    if (!existingAutoSync) {
      getDb().prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('notion_auto_sync', 'true');
    }
  } else {
    getDb().prepare('DELETE FROM settings WHERE key = ?').run('notion_clips_db');
  }
  res.json({ success: true });
});
```

- [ ] **Step 4: Typecheck + Lint**

```bash
npm run typecheck
npm run lint
```

Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add src/server/api/settings.ts
git commit -m "feat(notion): add /notion/databases /pages /create /heal /check endpoints"
```

---

## Task 4: Backend — Auto-Sync-Gating + PATCH-Hook + Sync-Filter + WS-Events

**Files:**
- Modify: `src/server/api/clips.ts`

- [ ] **Step 1: Add auto-sync gate helper**

At the top of `src/server/api/clips.ts`, replace the import block:

```ts
import { Router } from 'express';
import { getDb } from '../db/index';
import { broadcast } from '../websocket/index';
import { syncClipToNotion } from './notion-sync';
import { getStreamTimecodes } from '../obs/index';

function isAutoSyncEnabled(): boolean {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get('notion_auto_sync') as { value: string } | undefined;
  return row?.value === 'true';
}

function maybeAutoSync(clip: { id: number; tag: string; note: string | null; session_date: string; created_at: string }): void {
  if (!isAutoSyncEnabled()) return;
  if (clip.tag.startsWith('auto-')) return;
  syncClipToNotion(clip).then((ok) => {
    if (ok) {
      const updated = getDb().prepare('SELECT * FROM clips WHERE id = ?').get(clip.id);
      if (updated) broadcast('clip-updated', updated);
    } else {
      broadcast('clip-sync-failed', { id: clip.id });
    }
  }).catch(() => { broadcast('clip-sync-failed', { id: clip.id }); });
}
```

- [ ] **Step 2: Update createClip to use the gate**

Replace the existing `createClip` function (lines ~7–31). Change `syncClipToNotion(clip).catch(() => {});` to `maybeAutoSync(clip);`, and include `notion_page_id` in the return type:

```ts
export async function createClip(tag: string, note?: string | null, confidence?: string | null): Promise<{ id: number; tag: string; note: string | null; session_date: string; stream_timecode: string | null; recording_timecode: string | null; confidence: string | null; notion_page_id: string | null; created_at: string } | null> {
  try {
    const sessionDate = new Date().toISOString().split('T')[0];
    const { stream_timecode, recording_timecode } = await getStreamTimecodes();

    const result = getDb().prepare(
      'INSERT INTO clips (tag, note, session_date, stream_timecode, recording_timecode, confidence) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(tag, note || null, sessionDate, stream_timecode, recording_timecode, confidence || null);

    const clip = getDb().prepare('SELECT * FROM clips WHERE id = ?').get(result.lastInsertRowid) as {
      id: number; tag: string; note: string | null; session_date: string;
      stream_timecode: string | null; recording_timecode: string | null; confidence: string | null;
      notion_page_id: string | null; created_at: string;
    };
    broadcast('clip-created', clip);
    maybeAutoSync(clip);
    return clip;
  } catch (err) {
    console.error('[Clips] createClip failed:', err);
    return null;
  }
}
```

- [ ] **Step 3: Auto-sync on auto-clip confirm in PATCH**

Replace the PATCH handler (lines ~132–154):

```ts
router.patch('/:id', (req, res) => {
  const { tag, note } = req.body;
  const db = getDb();

  const existing = db.prepare('SELECT * FROM clips WHERE id = ?').get(req.params.id) as
    | { id: number; tag: string; note: string | null; session_date: string; created_at: string; notion_page_id: string | null }
    | undefined;
  if (!existing) { res.status(404).json({ error: 'Clip not found' }); return; }

  const fields: string[] = [];
  const values: unknown[] = [];

  if (tag !== undefined) { fields.push('tag = ?'); values.push(tag); }
  if (note !== undefined) { fields.push('note = ?'); values.push(note); }

  if (fields.length === 0) { res.status(400).json({ error: 'No fields to update' }); return; }

  values.push(req.params.id);
  db.prepare(`UPDATE clips SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  const clip = db.prepare('SELECT * FROM clips WHERE id = ?').get(req.params.id) as {
    id: number; tag: string; note: string | null; session_date: string; created_at: string; notion_page_id: string | null;
  };

  broadcast('clip-updated', clip);

  // If auto-clip was just confirmed (tag lost the auto- prefix) and not yet synced, sync now.
  const wasAutoClip = existing.tag.startsWith('auto-');
  const isNowConfirmed = !clip.tag.startsWith('auto-');
  if (wasAutoClip && isNowConfirmed && !clip.notion_page_id) {
    maybeAutoSync(clip);
  }

  res.json(clip);
});
```

- [ ] **Step 4: Filter /clips/sync to NULL-only**

In the same file, replace the `router.post('/sync', ...)` block (lines ~101–120):

```ts
router.post('/sync', async (req, res) => {
  let sessionDate = (req.query.session_date || req.body.session_date) as string;
  if (sessionDate === 'today') sessionDate = new Date().toISOString().split('T')[0];
  if (!sessionDate) { res.status(400).json({ error: 'session_date required' }); return; }

  const clips = getDb().prepare(
    'SELECT * FROM clips WHERE session_date = ? AND notion_page_id IS NULL ORDER BY created_at ASC'
  ).all(sessionDate) as Array<{ id: number; tag: string; note: string | null; session_date: string; created_at: string }>;

  if (clips.length === 0) { res.json({ session_date: sessionDate, total: 0, synced: 0, failed: 0 }); return; }

  let synced = 0;
  let failed = 0;
  for (const clip of clips) {
    const ok = await syncClipToNotion(clip);
    if (ok) {
      synced++;
      const updated = getDb().prepare('SELECT * FROM clips WHERE id = ?').get(clip.id);
      if (updated) broadcast('clip-updated', updated);
    } else {
      failed++;
      broadcast('clip-sync-failed', { id: clip.id });
    }
  }

  res.json({ session_date: sessionDate, total: clips.length, synced, failed });
});
```

- [ ] **Step 5: Typecheck + Lint**

```bash
npm run typecheck
npm run lint
```

Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/server/api/clips.ts
git commit -m "feat(clips): gate auto-sync on setting + tag, add PATCH confirm sync, filter re-sync"
```

---

## Task 5: i18n — neue Keys + alte Step-Keys entfernen

**Files:**
- Modify: `src/renderer/src/i18n/translations.ts`

- [ ] **Step 1: Remove obsolete notion.stepN keys**

In `src/renderer/src/i18n/translations.ts`, delete these lines (the obsolete 6-step onboarding list and related keys):
- `'notion.step1'`
- `'notion.step2'`
- `'notion.step3'`
- `'notion.step4'`
- `'notion.step5'`
- `'notion.step6'`
- `'notion.db_placeholder'`

Keep `'notion.title'`, `'notion.desc'`, `'notion.token_saved'`, `'notion.complete'`.

- [ ] **Step 2: Add new keys**

In the same file, add after the remaining notion keys:

```ts
  'notion.picker.title': { de: 'Wähle deine Clip-Datenbank', en: 'Pick your clip database' },
  'notion.picker.create': { de: 'Neue Datenbank für mich erstellen', en: 'Create a new database for me' },
  'notion.picker.refresh': { de: 'Erneut suchen', en: 'Refresh' },
  'notion.picker.manual': { de: 'Manuell: ID oder URL einfügen', en: 'Manual: paste ID or URL' },
  'notion.picker.ready': { de: 'Datenbank bereit', en: 'Database ready' },
  'notion.picker.schema_ok': { de: 'Schema: alle Properties OK', en: 'Schema: all properties OK' },
  'notion.picker.schema_fix': { de: '{n} Properties fehlen — Reparieren', en: '{n} properties missing — Fix' },
  'notion.picker.schema_missing_chip': { de: '{n} fehlend', en: '{n} missing' },
  'notion.picker.other': { de: 'Andere wählen', en: 'Pick another' },
  'notion.picker.open_in_notion': { de: 'DB in Notion öffnen', en: 'Open DB in Notion' },
  'notion.picker.empty_title': { de: 'Noch keine Datenbank erreichbar', en: 'No databases reachable yet' },
  'notion.picker.empty_help_intro': { de: 'So verbindest du eine:', en: 'Here is how to connect one:' },
  'notion.picker.empty_help_1': { de: 'Öffne eine Seite in Notion', en: 'Open any page in Notion' },
  'notion.picker.empty_help_2': { de: '„…" → „Add connections"', en: '"…" → "Add connections"' },
  'notion.picker.empty_help_3': { de: 'Wähle deine Stream-Toolkit-Integration', en: 'Pick your Stream Toolkit integration' },
  'notion.picker.create_name': { de: 'Name', en: 'Name' },
  'notion.picker.create_parent': { de: 'Unter welcher Notion-Seite?', en: 'Under which Notion page?' },
  'notion.picker.create_button': { de: 'Erstellen', en: 'Create' },
  'notion.picker.create_cancel': { de: 'Abbrechen', en: 'Cancel' },
  'notion.picker.create_empty_pages': { de: 'Noch keine Seite erreichbar — verbinde die Integration erst mit einer Notion-Seite.', en: 'No page reachable yet — first connect the integration to a Notion page.' },
  'notion.picker.error_token': { de: 'Token ungültig — bitte prüfen', en: 'Token invalid — please check' },
  'notion.picker.error_db_gone': { de: 'Datenbank nicht mehr verfügbar', en: 'Database no longer available' },
  'notion.picker.error_generic': { de: 'Notion-Fehler — später nochmal versuchen', en: 'Notion error — try again later' },
  'notion.picker.token_needed': { de: 'Token speichern, um Datenbanken zu sehen', en: 'Save token to see databases' },
  'clips.auto_sync_label': { de: 'Auto-Sync', en: 'Auto-sync' },
  'clips.auto_sync_on': { de: 'An', en: 'On' },
  'clips.auto_sync_off': { de: 'Aus', en: 'Off' },
  'clips.re_sync': { de: 'Re-Sync', en: 'Re-sync' },
  'clips.sync_status.pending': { de: 'Wartet auf Sync', en: 'Waiting for sync' },
  'clips.sync_status.syncing': { de: 'Synchronisiert…', en: 'Syncing…' },
  'clips.sync_status.synced': { de: 'In Notion — klicken zum Öffnen', en: 'In Notion — click to open' },
  'clips.sync_status.failed': { de: 'Sync fehlgeschlagen — klicken für Retry', en: 'Sync failed — click to retry' },
```

`{n}` wird im Component via `String.replace('{n}', String(n))` ersetzt — das Projekt hat keine Interpolations-Library.

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: passes. Falls existing code auf `notion.step*` zugreift, wird das in den folgenden Tasks entfernt — vorerst ist ein `cannot find key` möglich (String-Key-Lookup). Falls Typecheck scheitert: weiter zu Task 6 (NotionStep refactor entfernt die Referenzen).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/i18n/translations.ts
git commit -m "feat(i18n): add notion picker + clip sync keys, remove old step list"
```

---

## Task 6: Frontend — `NotionDatabasePicker` Komponente

**Files:**
- Create: `src/renderer/src/components/NotionDatabasePicker.tsx`

- [ ] **Step 1: Create the component file**

Write `src/renderer/src/components/NotionDatabasePicker.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { useApi, apiPost, apiGet } from '../hooks/useApi';
import { useTranslation } from '../i18n/LanguageContext';
import { useToast } from '../i18n/ToastContext';
import { NotionDatabase, NotionPage, NotionDatabaseCheck } from '../../../shared/types';

interface Props {
  onConfigured?: () => void;
  compact?: boolean;
}

type Phase = 'loading' | 'picker' | 'empty' | 'configured' | 'creating' | 'token_missing';

export default function NotionDatabasePicker({ onConfigured, compact }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: tokenInfo } = useApi<{ configured: boolean }>('/settings/notion');
  const { data: dbInfo, refetch: refetchDb } = useApi<{ configured: boolean; database_id: string | null }>('/settings/notion/database');

  const [phase, setPhase] = useState<Phase>('loading');
  const [databases, setDatabases] = useState<NotionDatabase[]>([]);
  const [pages, setPages] = useState<NotionPage[]>([]);
  const [check, setCheck] = useState<NotionDatabaseCheck | null>(null);
  const [manualId, setManualId] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [newName, setNewName] = useState('Stream Clips');
  const [selectedParent, setSelectedParent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadDatabases = async () => {
    setPhase('loading');
    try {
      const dbs = await apiGet<NotionDatabase[]>('/settings/notion/databases');
      if (!dbs) { setPhase('empty'); return; }
      setDatabases(dbs);
      setPhase(dbs.length > 0 ? 'picker' : 'empty');
    } catch { setPhase('empty'); }
  };

  const loadCheck = async () => {
    const c = await apiGet<NotionDatabaseCheck>('/settings/notion/database/check');
    setCheck(c);
  };

  useEffect(() => {
    if (!tokenInfo?.configured) { setPhase('token_missing'); return; }
    if (dbInfo?.configured) {
      setPhase('configured');
      loadCheck();
    } else {
      loadDatabases();
    }
  }, [tokenInfo?.configured, dbInfo?.configured]);

  const pickDatabase = async (db: NotionDatabase) => {
    setBusy(true);
    const ok = await apiPost('/settings/notion/database', { database_id: db.id });
    if (!ok) { toast.error(t('error.action_failed')); setBusy(false); return; }
    if (db.missing_properties.length > 0) {
      await apiPost('/settings/notion/database/heal', { database_id: db.id });
    }
    toast.success(t('notion.picker.ready'));
    setBusy(false);
    refetchDb();
    onConfigured?.();
  };

  const pickManual = async () => {
    const cleaned = manualId.trim();
    if (!cleaned) return;
    setBusy(true);
    const ok = await apiPost('/settings/notion/database', { database_id: cleaned });
    if (!ok) { toast.error(t('error.action_failed')); setBusy(false); return; }
    setManualId('');
    setShowManual(false);
    setBusy(false);
    refetchDb();
    onConfigured?.();
  };

  const openCreate = async () => {
    const ps = await apiGet<NotionPage[]>('/settings/notion/pages');
    setPages(ps || []);
    setSelectedParent(ps && ps.length > 0 ? ps[0].id : null);
    setPhase('creating');
  };

  const submitCreate = async () => {
    if (!selectedParent) return;
    setBusy(true);
    const ok = await apiPost('/settings/notion/database/create', { parent_page_id: selectedParent, title: newName || 'Stream Clips' });
    setBusy(false);
    if (!ok) { toast.error(t('error.action_failed')); return; }
    toast.success(t('notion.picker.ready'));
    refetchDb();
    onConfigured?.();
  };

  const healNow = async () => {
    const dbId = dbInfo?.database_id;
    if (!dbId) return;
    setBusy(true);
    const ok = await apiPost('/settings/notion/database/heal', { database_id: dbId });
    setBusy(false);
    if (!ok) { toast.error(t('error.action_failed')); return; }
    toast.success(t('notion.picker.ready'));
    loadCheck();
  };

  const unlinkDatabase = async () => {
    await apiPost('/settings/notion/database', { database_id: '' });
    refetchDb();
    setCheck(null);
    loadDatabases();
  };

  const fmt = (key: string, n: number) => t(key).replace('{n}', String(n));

  if (phase === 'token_missing') {
    return <div className="notion-picker-empty">{t('notion.picker.token_needed')}</div>;
  }

  if (phase === 'loading') {
    return <div className="notion-picker-loading">…</div>;
  }

  if (phase === 'configured') {
    const dbId = dbInfo?.database_id;
    const schemaOk = check && 'ok' in check && check.ok === true;
    const schemaMissing = check && 'ok' in check && check.ok === false && 'missing_properties' in check ? check.missing_properties : null;
    const hardError = check && 'ok' in check && check.ok === false && 'error' in check ? check.error : null;
    return (
      <div className={`notion-picker configured ${compact ? 'compact' : ''}`}>
        <div className="notion-picker-current">
          <span className="notion-picker-icon">📊</span>
          <span className="notion-picker-title">{dbId ? `${dbId.substring(0, 8)}…${dbId.substring(24)}` : ''}</span>
          {schemaOk && <span className="notion-picker-badge ok">✓ {t('notion.picker.ready')}</span>}
          {schemaMissing && <span className="notion-picker-badge warn">⚠ {fmt('notion.picker.schema_fix', schemaMissing.length)}</span>}
          {hardError === 'db_gone' && <span className="notion-picker-badge error">{t('notion.picker.error_db_gone')}</span>}
          {hardError === 'token_invalid' && <span className="notion-picker-badge error">{t('notion.picker.error_token')}</span>}
        </div>
        {schemaOk && <p className="notion-picker-sub">{t('notion.picker.schema_ok')}</p>}
        <div className="notion-picker-actions">
          {schemaMissing && <button onClick={healNow} disabled={busy}>🔧</button>}
          <button onClick={unlinkDatabase} disabled={busy}>{t('notion.picker.other')}</button>
        </div>
      </div>
    );
  }

  if (phase === 'creating') {
    return (
      <div className={`notion-picker creating ${compact ? 'compact' : ''}`}>
        <h4>{t('notion.picker.create')}</h4>
        <label>
          {t('notion.picker.create_name')}
          <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} />
        </label>
        {pages.length === 0 ? (
          <p className="notion-picker-hint">{t('notion.picker.create_empty_pages')}</p>
        ) : (
          <fieldset className="notion-picker-pages">
            <legend>{t('notion.picker.create_parent')}</legend>
            {pages.map((p) => (
              <label key={p.id} className="notion-picker-page-option">
                <input type="radio" name="parent" checked={selectedParent === p.id} onChange={() => setSelectedParent(p.id)} />
                <span>{p.icon || '📄'} {p.title}</span>
              </label>
            ))}
          </fieldset>
        )}
        <div className="notion-picker-actions">
          <button onClick={() => loadDatabases()} disabled={busy}>{t('notion.picker.create_cancel')}</button>
          <button onClick={submitCreate} disabled={busy || !selectedParent || pages.length === 0}>{t('notion.picker.create_button')}</button>
        </div>
      </div>
    );
  }

  if (phase === 'empty') {
    return (
      <div className={`notion-picker empty ${compact ? 'compact' : ''}`}>
        <h4>{t('notion.picker.empty_title')}</h4>
        <p>{t('notion.picker.empty_help_intro')}</p>
        <ol>
          <li>{t('notion.picker.empty_help_1')}</li>
          <li>{t('notion.picker.empty_help_2')}</li>
          <li>{t('notion.picker.empty_help_3')}</li>
        </ol>
        <div className="notion-picker-actions">
          <button onClick={loadDatabases} disabled={busy}>🔄 {t('notion.picker.refresh')}</button>
          <button onClick={openCreate} disabled={busy}>➕ {t('notion.picker.create')}</button>
        </div>
      </div>
    );
  }

  // phase === 'picker'
  return (
    <div className={`notion-picker picker ${compact ? 'compact' : ''}`}>
      <div className="notion-picker-header">
        <h4>{t('notion.picker.title')}</h4>
        <button className="notion-picker-refresh" onClick={loadDatabases} disabled={busy} title={t('notion.picker.refresh')}>🔄</button>
      </div>
      <button className="notion-picker-create-btn" onClick={openCreate} disabled={busy}>➕ {t('notion.picker.create')}</button>
      <ul className="notion-picker-list">
        {databases.map((db) => (
          <li key={db.id} className="notion-picker-item" onClick={() => !busy && pickDatabase(db)}>
            <span className="notion-picker-icon">{db.icon || '📊'}</span>
            <span className="notion-picker-title">{db.title}</span>
            {db.missing_properties.length > 0 && <span className="notion-picker-badge warn">⚠ {fmt('notion.picker.schema_missing_chip', db.missing_properties.length)}</span>}
          </li>
        ))}
      </ul>
      <div className="notion-picker-manual-toggle">
        {showManual ? (
          <div className="notion-picker-manual-input">
            <input type="text" placeholder="notion.so/…" value={manualId} onChange={(e) => setManualId(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && pickManual()} />
            <button onClick={pickManual} disabled={busy}>✓</button>
          </div>
        ) : (
          <button className="link" onClick={() => setShowManual(true)}>🔗 {t('notion.picker.manual')}</button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify `apiGet` exists, otherwise add**

Check `src/renderer/src/hooks/useApi.ts`:

```bash
grep -n "export.*apiGet\|export function apiGet" src/renderer/src/hooks/useApi.ts
```

Falls `apiGet` nicht exportiert ist: In `src/renderer/src/hooks/useApi.ts` neben `apiPost`/`apiPatch`/`apiDelete` analog hinzufügen:

```ts
export async function apiGet<T = unknown>(path: string): Promise<T | null> {
  try {
    const token = getApiToken();
    const res = await fetch(`http://localhost:4000/api${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch { return null; }
}
```

(Signatur an vorhandene `apiPost`-Implementierung anpassen; identisches Token-Handling.)

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/NotionDatabasePicker.tsx src/renderer/src/hooks/useApi.ts
git commit -m "feat(notion): add NotionDatabasePicker component (picker + create + heal)"
```

---

## Task 7: Frontend — `ClipSyncBadge` Komponente

**Files:**
- Create: `src/renderer/src/components/ClipSyncBadge.tsx`

- [ ] **Step 1: Create the component**

Write `src/renderer/src/components/ClipSyncBadge.tsx`:

```tsx
import React from 'react';
import { useTranslation } from '../i18n/LanguageContext';

export type SyncState = 'pending' | 'syncing' | 'synced' | 'failed' | 'disabled';

interface Props {
  state: SyncState;
  onRetry?: () => void;
}

export default function ClipSyncBadge({ state, onRetry }: Props) {
  const { t } = useTranslation();
  if (state === 'disabled') return null;

  const icon =
    state === 'pending' ? '⋯' :
    state === 'syncing' ? '⏳' :
    state === 'synced' ? '✅' :
    '⚠️';

  const title = t(`clips.sync_status.${state}`);
  const clickable = state === 'failed' && !!onRetry;

  return (
    <span
      className={`clip-sync-badge ${state} ${clickable ? 'clickable' : ''}`}
      title={title}
      onClick={clickable ? onRetry : undefined}
    >
      {icon}
    </span>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/ClipSyncBadge.tsx
git commit -m "feat(clips): add ClipSyncBadge component"
```

---

## Task 8: Frontend — `NotionStep.tsx` auf Picker umstellen

**Files:**
- Modify: `src/renderer/src/components/onboarding/NotionStep.tsx`

- [ ] **Step 1: Replace the file contents**

Overwrite `src/renderer/src/components/onboarding/NotionStep.tsx`:

```tsx
import React, { useState } from 'react';
import { useApi, apiPost } from '../../hooks/useApi';
import { useTranslation } from '../../i18n/LanguageContext';
import NotionDatabasePicker from '../NotionDatabasePicker';

export default function NotionStep() {
  const { t } = useTranslation();
  const { data: notionInfo, refetch: refetchNotion } = useApi<{ configured: boolean }>('/settings/notion');
  const [token, setToken] = useState('');

  const saveToken = async () => {
    if (!token.trim()) return;
    await apiPost('/settings/notion', { token: token.trim() });
    setToken('');
    refetchNotion();
  };

  return (
    <div className="onboarding-step">
      <h2>{t('notion.title')}</h2>
      <p className="step-desc">{t('notion.desc')}</p>

      {!notionInfo?.configured ? (
        <div className="input-row">
          <input
            type="text"
            placeholder="ntn_..."
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveToken()}
          />
          <button onClick={saveToken}>{t('settings.save')}</button>
        </div>
      ) : (
        <>
          <div className="onboarding-check">{t('notion.token_saved')}</div>
          <NotionDatabasePicker />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/onboarding/NotionStep.tsx
git commit -m "refactor(onboarding): NotionStep uses NotionDatabasePicker"
```

---

## Task 9: Frontend — `SettingsPanel.tsx` Notion-Sektion auf Picker umstellen

**Files:**
- Modify: `src/renderer/src/panels/SettingsPanel.tsx`

- [ ] **Step 1: Ersetze den Notion-DB-Block**

In `src/renderer/src/panels/SettingsPanel.tsx`, ersetze den kompletten Block ab `<p className="setup-info" style={{ marginTop: '12px' }}>{t('settings.clips_db')}</p>` bis zum schließenden `</>` des configured-Zweigs (etwa Zeilen 300–331) durch:

```tsx
        <div style={{ marginTop: '12px' }}>
          <NotionDatabasePicker compact />
        </div>
```

Token-Sektion (Zeilen ~264–298) bleibt unverändert — der Picker braucht ein gesetztes Token und zeigt sonst `token_needed`.

- [ ] **Step 2: Import hinzufügen**

Oben in der Datei, zu den Imports hinzufügen:

```tsx
import NotionDatabasePicker from '../components/NotionDatabasePicker';
```

- [ ] **Step 3: Ungenutzten State/Refetch entfernen**

Entferne aus der Komponente den nicht mehr benötigten State:
- `notionDbInfo` (samt destructuring)
- `refetchNotionDb`
- `notionDbId` + `setNotionDbId`

Lint wird das zeigen.

- [ ] **Step 4: Typecheck + Lint**

```bash
npm run typecheck
npm run lint
```

Expected: beide grün.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/panels/SettingsPanel.tsx
git commit -m "refactor(settings): Notion-DB section uses NotionDatabasePicker"
```

---

## Task 10: Frontend — `ClipsPanel.tsx` Redesign (Toggle, Tag-Breakdown, Sync-Badges, Card-Style)

**Files:**
- Modify: `src/renderer/src/panels/ClipsPanel.tsx`

- [ ] **Step 1: Imports + zusätzlicher State**

In `src/renderer/src/panels/ClipsPanel.tsx` oben bei den Imports ergänzen:

```tsx
import ClipSyncBadge, { SyncState } from '../components/ClipSyncBadge';
import { apiGet } from '../hooks/useApi';
```

Innerhalb der `ClipsPanel`-Komponente unter den bestehenden Hooks hinzufügen:

```tsx
const { data: dbInfo } = useApi<{ configured: boolean }>('/settings/notion/database');
const { data: autoSyncRaw, refetch: refetchAutoSync } = useApi<{ value: string | null }>('/settings/get/notion_auto_sync');
const notionConfigured = !!dbInfo?.configured;
const autoSync = autoSyncRaw?.value === 'true';
const [failedIds, setFailedIds] = useState<Set<number>>(new Set());
```

- [ ] **Step 2: Toggle-Persist + WS-Handling erweitern**

Ersetze den gesamten `useWebSocket((event) => { ... })`-Block durch die Zwei-Argument-Variante, die auch `data` nutzt:

```tsx
useWebSocket((event, data) => {
  if (event.startsWith('clip-')) { refetchClips(); refetchSessions(); }
  if (event === 'clip-tags-changed') { refetchTags(); }
  if (event === 'clip-sync-failed' && data && typeof data === 'object' && 'id' in data) {
    setFailedIds((prev) => new Set(prev).add((data as { id: number }).id));
  }
  if (event === 'clip-updated' && data && typeof data === 'object' && 'id' in data) {
    setFailedIds((prev) => { const n = new Set(prev); n.delete((data as { id: number }).id); return n; });
  }
});
```

Füge eine Funktion zum Umschalten des Auto-Syncs + Retry hinzu (irgendwo zwischen den anderen Handlern):

```tsx
const toggleAutoSync = async () => {
  const next = autoSync ? 'false' : 'true';
  await apiPost('/settings/set', { key: 'notion_auto_sync', value: next });
  refetchAutoSync();
};

const retryClip = async (id: number) => {
  setFailedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
  // Re-triggert Auto-Sync durch Dummy-PATCH (touch note)
  // Einfacher: /clips/sync für den Tag neu anstoßen
  const clip = allClips?.find((c) => c.id === id);
  if (clip) syncToNotion(clip.session_date);
};

const syncStateFor = (clip: Clip): SyncState => {
  if (!notionConfigured) return 'disabled';
  if (clip.notion_page_id) return 'synced';
  if (failedIds.has(clip.id)) return 'failed';
  return 'pending';
};
```

- [ ] **Step 3: Panel-Header mit Auto-Sync-Toggle**

Ersetze den Block `<h2>🎬 Clip Moments</h2>` durch:

```tsx
<div className="clips-panel-header">
  <h2>🎬 Clip Moments</h2>
  {notionConfigured && (
    <button className={`auto-sync-toggle ${autoSync ? 'on' : 'off'}`} onClick={toggleAutoSync} title={t('clips.auto_sync_label')}>
      ☁️ {t('clips.auto_sync_label')}: {autoSync ? t('clips.auto_sync_on') : t('clips.auto_sync_off')}
    </button>
  )}
</div>
```

- [ ] **Step 4: Tag-Breakdown im Day-Header**

Ersetze den Day-Header-Block (`<div className="clip-day-header" ...>`) durch:

```tsx
<div className="clip-day-header" onClick={() => toggleDay(date)}>
  <span className="day-toggle">{isCollapsed ? '▶' : '▼'}</span>
  <span className="day-date">{isToday ? `${t('clips.today')} (${date})` : date}</span>
  <span className="day-breakdown">
    {Array.from(
      (clipsByDay.get(date) || []).reduce((m, c) => {
        const key = c.tag.startsWith('auto-') ? c.tag.replace('auto-', '') : c.tag;
        m.set(key, (m.get(key) || 0) + 1);
        return m;
      }, new Map<string, number>()).entries()
    ).map(([tag, count]) => (
      <span key={tag} className="tag-chip">{TAG_EMOJI[tag] || '🏷️'}{count}</span>
    ))}
  </span>
  <span className="day-count">{dayClips.length} Clips</span>
  {notionConfigured && (
    <button className="btn-export" onClick={(e) => { e.stopPropagation(); syncToNotion(date); }} disabled={syncingDay === date}>
      {syncingDay === date ? '⏳' : '📤'} {t('clips.re_sync')}
    </button>
  )}
  <button className="btn-export" onClick={(e) => { e.stopPropagation(); exportDay(date); }}>📥 DaVinci</button>
</div>
```

- [ ] **Step 5: Clip-Item als Card + SyncBadge**

Ersetze den `dayClips.map((clip) => ...)`-Block durch:

```tsx
{dayClips.map((clip) => (
  <div key={clip.id} className={`clip-item ${isAutoClip(clip) ? 'auto-clip' : ''}`}>
    <div className="clip-row-top">
      <span className="clip-time">{formatClipTime(clip)}</span>
      <ClipSyncBadge state={syncStateFor(clip)} onRetry={() => retryClip(clip.id)} />
    </div>
    <div className="clip-row-mid">
      <span className="clip-tag">
        {isAutoClip(clip) && '🤖 '}
        {TAG_EMOJI[clip.tag.replace('auto-', '')] || '🏷️'} {clip.tag}
        {clip.confidence && (
          <span className={`confidence-dot ${clip.confidence}`} title={clip.confidence}>
            {clip.confidence === 'high' ? '🟢' : '🟡'}
          </span>
        )}
      </span>
      {isAutoClip(clip) ? (
        <div className="auto-clip-actions">
          <button className="btn-confirm-small" onClick={() => confirmClip(clip)} title={t('auto_clips.confirm')}>✓</button>
          <button className="btn-delete-small" onClick={() => deleteClip(clip.id)} title={t('auto_clips.reject')}>✕</button>
        </div>
      ) : (
        <button className="btn-delete-small" onClick={() => deleteClip(clip.id)} title={t('tooltip.delete')}>✕</button>
      )}
    </div>
    {clip.note && <div className="clip-row-note">"{clip.note}"</div>}
  </div>
))}
```

- [ ] **Step 6: Typecheck + Lint**

```bash
npm run typecheck
npm run lint
```

Expected: beide grün.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/panels/ClipsPanel.tsx
git commit -m "feat(clips): add auto-sync toggle, tag-breakdown, sync-badge, card layout"
```

---

## Task 11: CSS — `index.css` Styles für Picker + Panel

**Files:**
- Modify: `src/renderer/src/index.css`

- [ ] **Step 1: Styles anhängen**

Ans Ende von `src/renderer/src/index.css` anhängen:

```css
/* ---------- Notion DB Picker ---------- */
.notion-picker {
  border: 1px solid var(--border, #333);
  border-radius: 8px;
  padding: 12px;
  margin-top: 8px;
  background: var(--bg-elevated, rgba(255,255,255,0.03));
}
.notion-picker.compact { padding: 8px; }
.notion-picker-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.notion-picker-header h4 { margin: 0; font-size: 14px; }
.notion-picker-refresh { background: none; border: none; cursor: pointer; font-size: 14px; }
.notion-picker-create-btn {
  width: 100%;
  padding: 8px 12px;
  margin-bottom: 8px;
  border-radius: 6px;
  background: var(--accent, #4a9eff);
  color: white;
  border: none;
  cursor: pointer;
  text-align: left;
}
.notion-picker-list { list-style: none; padding: 0; margin: 0; }
.notion-picker-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
}
.notion-picker-item:hover { background: var(--hover, rgba(255,255,255,0.05)); }
.notion-picker-icon { font-size: 16px; }
.notion-picker-title { flex: 1; }
.notion-picker-badge {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 10px;
  background: rgba(255,255,255,0.1);
}
.notion-picker-badge.ok { background: rgba(40, 200, 80, 0.2); color: #4ade80; }
.notion-picker-badge.warn { background: rgba(250, 180, 50, 0.2); color: #fbbf24; }
.notion-picker-badge.error { background: rgba(255, 80, 80, 0.2); color: #f87171; }
.notion-picker-manual-toggle { margin-top: 8px; font-size: 12px; }
.notion-picker-manual-toggle button.link { background: none; border: none; color: var(--accent, #4a9eff); cursor: pointer; padding: 0; }
.notion-picker-manual-input { display: flex; gap: 6px; margin-top: 6px; }
.notion-picker-manual-input input { flex: 1; padding: 6px 8px; border-radius: 4px; border: 1px solid var(--border, #333); background: transparent; color: inherit; }
.notion-picker-actions { display: flex; gap: 8px; margin-top: 10px; justify-content: flex-end; }
.notion-picker.empty ol { padding-left: 20px; margin: 8px 0; }
.notion-picker.empty li { margin: 4px 0; font-size: 13px; }
.notion-picker-sub { font-size: 12px; color: var(--muted, #888); margin: 4px 0 8px 0; }
.notion-picker-current { display: flex; align-items: center; gap: 8px; }
.notion-picker-pages { border: 1px solid var(--border, #333); border-radius: 6px; padding: 8px; margin-top: 8px; }
.notion-picker-page-option { display: flex; align-items: center; gap: 6px; padding: 4px 0; cursor: pointer; }
.notion-picker-hint { font-size: 12px; color: var(--muted, #888); margin-top: 8px; }

/* ---------- Clips Panel ---------- */
.clips-panel-header { display: flex; align-items: center; justify-content: space-between; }
.auto-sync-toggle {
  background: rgba(74,158,255,0.15);
  color: #4a9eff;
  border: 1px solid rgba(74,158,255,0.3);
  padding: 4px 10px;
  border-radius: 12px;
  cursor: pointer;
  font-size: 12px;
}
.auto-sync-toggle.off { background: rgba(255,255,255,0.05); color: var(--muted, #888); border-color: rgba(255,255,255,0.1); }
.day-breakdown { display: inline-flex; gap: 6px; margin-left: 8px; }
.day-breakdown .tag-chip {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 10px;
  background: rgba(255,255,255,0.08);
}
.clip-item {
  background: var(--bg-elevated, rgba(255,255,255,0.03));
  border: 1px solid var(--border, #2a2a2a);
  border-radius: 8px;
  padding: 10px 12px;
  margin: 6px 0;
  transition: background 0.15s;
}
.clip-item:hover { background: rgba(255,255,255,0.05); }
.clip-row-top { display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: var(--muted, #888); }
.clip-row-mid { display: flex; align-items: center; justify-content: space-between; margin-top: 4px; }
.clip-row-note { margin-top: 4px; font-size: 12px; color: var(--muted, #aaa); font-style: italic; }
.clip-sync-badge { font-size: 14px; cursor: default; }
.clip-sync-badge.clickable { cursor: pointer; }
.clip-sync-badge.syncing { animation: spin 1.2s linear infinite; }
.clip-sync-badge.pending { opacity: 0.5; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
```

- [ ] **Step 2: Dev-Server-Check (visuell)**

`npm run dev` — Hot-Reload sollte die neuen Styles aufspielen. Kurz in den ClipsPanel schauen, dass nichts zerschossen ist. (Keine TypeScript-Validierung für CSS, also nur optisch.)

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/index.css
git commit -m "feat(clips): add styles for Notion picker + clip sync badge + panel polish"
```

---

## Task 12: Manuelle End-to-End QA

- [ ] **Step 1: Frische Umgebung**

Stelle sicher, dass `npm run dev` läuft. Falls nötig neustarten um die v12-Migration zu triggern. Check die Konsolen-Logs:

Expected: `[DB] Migrated: added notion_page_id to clips` und `[DB] Migrated from v11 to v12`.

- [ ] **Step 2: QA-Pfade durchlaufen**

Klicke folgende Szenarien durch und notiere Regressions:

- **Onboarding-Flow**: App-Daten löschen (oder `onboarding_completed=false` setzen) → neuer Onboarding-Wizard → NotionStep → Token einfügen → Picker erscheint mit Liste.
- **Picker → existierende DB**: DB anklicken → Toast "Datenbank bereit" → Picker wechselt in `configured`-Zustand mit "✓ Ready".
- **Picker → Create**: "➕ Neue Datenbank erstellen" → Parent-Page wählen → "Erstellen" → in Notion prüfen: DB mit allen 6 Properties existiert.
- **Schema-Heal**: In Notion eine Property (z.B. `Notiz`) aus einer DB löschen → in der App in den Settings die DB neu auswählen oder den Heal-Button klicken → Property ist wieder in Notion.
- **Manual-Fallback**: Link "🔗 Manuell" öffnen → URL einfügen → Save → konfiguriert.
- **Settings-Picker**: Settings → Notion-Sektion → gleicher Picker, kann DB wechseln.
- **Auto-Sync**: Neuen Clip hinzufügen → Badge ist kurz `⋯`, dann `✅`. In Notion-DB prüfen, dass der Clip erscheint.
- **Auto-Clip-Confirm**: Auto-Clip triggern (z.B. `!clip` via Bot-Command) → erscheint ohne Sync (Badge `⋯`) → ✓ klicken → Badge wird `✅`, in Notion sichtbar.
- **Toggle**: Auto-Sync abschalten → neuer Clip bleibt `⋯` → Re-Sync-Button im Day-Header klicken → `✅`.
- **Re-Sync leer**: Tag, der komplett synced ist → Re-Sync-Button → `{total:0, synced:0, failed:0}` zurückbekommen, keine Fehler.
- **Failed + Retry**: Notion-Token temporär falsch setzen → Clip erstellen → Badge `⚠️` + Toast-Fehler → Token korrigieren → Retry klicken → `✅`.
- **DB-Gone**: In Notion die DB löschen → Settings → check zeigt `db_gone` → Picker bietet neue Auswahl.
- **Empty-DB Edge**: Frische Session ohne Clips → Empty-State-Text zeigt.
- **i18n**: Sprache auf EN umschalten → alle Picker-Strings englisch.

- [ ] **Step 3: Typecheck + Lint final**

```bash
npm run typecheck
npm run lint
```

Expected: beide grün.

- [ ] **Step 4: Doc-Update (optional Resume-Marker)**

Ergänze im Plan einen Status-Block am Ende ("Progress"). Dieser Schritt ist optional — nur wenn du den Stand weiter tracken willst.

- [ ] **Step 5: Final commit falls noch ungetrackte Änderungen**

```bash
git status
# Nur wenn noch was offen ist:
git add -A
git commit -m "chore(notion-picker): final polish from manual QA"
```

---

## Self-Review (vor Übergabe)

- **Spec coverage**:
  - DB-Picker mit Liste → Task 6.
  - Auto-Create → Task 6 (`creating` phase) + Task 3 (`/database/create` endpoint) + Task 2 (`createDatabase` helper).
  - Schema-Heal → Task 2 (`healDatabase`) + Task 3 (endpoint) + Task 6 (Auto-Heal bei Pick + manueller Button bei `configured`).
  - Auto-Sync als Default → Task 4 (`maybeAutoSync` gate) + Task 3 (default auto-sync on DB save).
  - Sync-Status-Badge → Task 7 (component) + Task 10 (integration) + Task 4 (WS events).
  - Shared Picker-Component → Task 6 + Tasks 8 & 9 (consumers).
  - ClipsPanel Tag-Breakdown, Card-Style, Empty-States → Task 10 + Task 11 (CSS).
  - DB-Migration v11→v12 → Task 1.
  - i18n-Keys → Task 5.
  - Rate-Limiting (max 3 parallel, 1x 429-Retry) → Task 2.
  - Edge-Cases: Task 6 (configured phase behandelt `token_invalid`, `db_gone`, `missing_properties`) + Task 10 (failed retry).
  - Manuelle QA → Task 12.

- **Placeholder scan**: Keine "TBD"/"TODO"/"similar to"/"appropriate" im Plan. ✔
- **Type consistency**: `NotionDatabase.missing_properties` → verwendet in Task 6 Picker und Task 2 Helper konsistent. `ClipSyncBadge.state: SyncState` → in Task 7 definiert, in Task 10 benutzt. `Clip.notion_page_id: string | null` → Task 1 + Task 4 + Task 10 konsistent.
- **Open question**: `apiGet`-Helper in `useApi.ts` existiert u.U. nicht — Task 6 Step 2 enthält den Fallback-Add.

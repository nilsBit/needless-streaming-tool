import { Router } from 'express';
import { getDb } from '../db/index';
import { broadcast } from '../websocket/index';
import { csvRow } from '../csv';
import { syncClipToNotion, archiveNotionPage } from './notion-sync';
import { getStreamTimecodes } from '../obs/index';
import { CLIP_STATUSES, type Clip, type ClipStatus } from '../../shared/types';

// Clip Moments, and since 2026-10-06 the content board built on them: every
// moment stands in one of four steps (new · planned · cut · published) and
// carries platforms, a date and a hook. Published moments leave the board
// into the archive after 30 days; nothing is deleted by that.

type ClipRow = Omit<Clip, 'platforms'> & { platforms: string };

const ARCHIVE_AFTER_DAYS = 30;
const PLATFORM_PATTERN = /^[a-z0-9-]{1,30}$/;

function toClip(row: ClipRow): Clip {
  let platforms: string[] = [];
  try { const parsed = JSON.parse(row.platforms || '[]'); if (Array.isArray(parsed)) platforms = parsed.filter((p) => typeof p === 'string'); } catch { /* keep [] */ }
  return { ...row, platforms, status: (CLIP_STATUSES as string[]).includes(row.status) ? row.status : 'new' };
}

function findClip(id: number | string): Clip | null {
  const row = getDb().prepare('SELECT * FROM clips WHERE id = ?').get(id) as ClipRow | undefined;
  return row ? toClip(row) : null;
}

function isAutoSyncEnabled(): boolean {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get('notion_auto_sync') as { value: string } | undefined;
  return row?.value === 'true';
}

function maybeAutoSync(clip: Clip): void {
  if (!isAutoSyncEnabled()) return;
  if (clip.tag.startsWith('auto-')) return;
  syncClipToNotion(clip).then((ok) => {
    if (ok) {
      const updated = findClip(clip.id);
      if (updated) broadcast('clip-updated', updated);
    } else {
      broadcast('clip-sync-failed', { id: clip.id });
    }
  }).catch(() => { broadcast('clip-sync-failed', { id: clip.id }); });
}

// Shared clip creation (used by POST and by the automatic detection).
export async function createClip(tag: string, note?: string | null, confidence?: string | null, extra?: { hook?: string | null; idea?: boolean }): Promise<Clip | null> {
  try {
    const sessionDate = new Date().toISOString().split('T')[0];
    // An idea has no place in the stream: no timecodes, and OBS is not asked.
    const { stream_timecode, recording_timecode } = extra?.idea ? { stream_timecode: null, recording_timecode: null } : await getStreamTimecodes();

    const result = getDb().prepare(
      'INSERT INTO clips (tag, note, session_date, stream_timecode, recording_timecode, confidence, hook) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(tag, note || null, sessionDate, stream_timecode, recording_timecode, confidence || null, extra?.hook?.trim() || null);

    const clip = findClip(result.lastInsertRowid as number)!;
    broadcast('clip-created', clip);
    maybeAutoSync(clip);
    return clip;
  } catch (err) {
    console.error('[Clips] createClip failed:', err);
    return null;
  }
}

/** Published moments older than 30 days leave the board. Returns how many did. */
export function archivePublishedClips(now: Date = new Date()): number {
  const cutoff = new Date(now.getTime() - ARCHIVE_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
  const result = getDb().prepare(
    "UPDATE clips SET archived_at = CURRENT_TIMESTAMP WHERE status = 'published' AND archived_at IS NULL AND published_at IS NOT NULL AND published_at < ?"
  ).run(cutoff);
  if (result.changes > 0) broadcast('clip-archived', { count: result.changes });
  return result.changes;
}

const router = Router();

// GET clips — by session_date, tag, status; archived ones only when asked for.
router.get('/', (req, res) => {
  const { session_date, tag, status, archived } = req.query;
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (session_date) { conditions.push('session_date = ?'); values.push(session_date); }
  if (tag) { conditions.push('tag = ?'); values.push(tag); }
  if (status) {
    if (!(CLIP_STATUSES as string[]).includes(String(status))) { res.status(400).json({ error: 'unknown status' }); return; }
    conditions.push('status = ?'); values.push(status);
  }
  if (archived === 'true') conditions.push('archived_at IS NOT NULL');
  else if (archived !== 'all') conditions.push('archived_at IS NULL');

  let query = 'SELECT * FROM clips';
  if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
  query += ' ORDER BY created_at DESC';

  res.json((getDb().prepare(query).all(...values) as ClipRow[]).map(toClip));
});

// GET all session dates — MUST be before /:id routes
router.get('/sessions', (_req, res) => {
  const sessions = getDb().prepare(
    'SELECT session_date, COUNT(*) as count FROM clips GROUP BY session_date ORDER BY session_date DESC'
  ).all();
  res.json(sessions);
});

// GET export as DaVinci Resolve CSV — MUST be before /:id routes
router.get('/export', (req, res) => {
  let sessionDate = req.query.session_date as string;
  if (sessionDate === 'today') sessionDate = new Date().toISOString().split('T')[0];
  if (!sessionDate) { res.status(400).json({ error: 'session_date required' }); return; }

  const clips = getDb().prepare(
    'SELECT * FROM clips WHERE session_date = ? ORDER BY created_at ASC'
  ).all(sessionDate) as Array<{
    tag: string; note: string | null; created_at: string;
    stream_timecode: string | null; recording_timecode: string | null;
  }>;

  if (clips.length === 0) { res.status(404).json({ error: 'No clips for this date' }); return; }

  const firstClipTime = new Date(clips[0].created_at + 'Z').getTime();

  const csvRows = ['Name,Start,End,Note'];
  for (const clip of clips) {
    let timecode: string;
    if (clip.stream_timecode) {
      timecode = clip.stream_timecode + ':00';
    } else if (clip.recording_timecode) {
      timecode = clip.recording_timecode + ':00';
    } else {
      const clipTime = new Date(clip.created_at + 'Z').getTime();
      const offsetSeconds = Math.floor((clipTime - firstClipTime) / 1000);
      timecode = formatTimecode(offsetSeconds);
    }
    csvRows.push(csvRow([clip.tag, timecode, timecode, clip.note || '']));
  }

  const csv = csvRows.join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="clips-${sessionDate}.csv"`);
  res.send(csv);
});

// POST sync all clips of a session to Notion — MUST be before /:id routes
router.post('/sync', async (req, res) => {
  let sessionDate = (req.query.session_date || req.body.session_date) as string;
  if (sessionDate === 'today') sessionDate = new Date().toISOString().split('T')[0];
  if (!sessionDate) { res.status(400).json({ error: 'session_date required' }); return; }

  const clips = (getDb().prepare(
    'SELECT * FROM clips WHERE session_date = ? AND notion_page_id IS NULL ORDER BY created_at ASC'
  ).all(sessionDate) as ClipRow[]).map(toClip);

  if (clips.length === 0) { res.json({ session_date: sessionDate, total: 0, synced: 0, failed: 0 }); return; }

  let synced = 0;
  let failed = 0;
  for (const clip of clips) {
    const ok = await syncClipToNotion(clip);
    if (ok) {
      synced++;
      const updated = findClip(clip.id);
      if (updated) broadcast('clip-updated', updated);
    } else {
      failed++;
      broadcast('clip-sync-failed', { id: clip.id });
    }
  }

  res.json({ session_date: sessionDate, total: clips.length, synced, failed });
});

// POST archive run — what the server does every six hours, callable for a check.
router.post('/archive-run', (_req, res) => {
  res.json({ archived: archivePublishedClips() });
});

// POST new clip — a moment from the stream, or an idea without one.
router.post('/', async (req, res) => {
  const { tag, note, hook, idea } = req.body ?? {};
  const kind = idea ? 'idee' : tag;
  if (!kind || typeof kind !== 'string') { res.status(400).json({ error: 'tag required' }); return; }

  const clip = await createClip(kind, note, null, { hook, idea: !!idea });
  if (!clip) { res.status(500).json({ error: 'Failed to create clip' }); return; }
  res.status(201).json(clip);
});

function isDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

// PATCH clip — /:id routes AFTER named routes
router.patch('/:id', (req, res) => {
  const body = req.body ?? {};
  const db = getDb();

  const existing = findClip(req.params.id);
  if (!existing) { res.status(404).json({ error: 'Clip not found' }); return; }

  const fields: string[] = [];
  const values: unknown[] = [];

  if (body.tag !== undefined) { fields.push('tag = ?'); values.push(String(body.tag)); }
  if (body.note !== undefined) { fields.push('note = ?'); values.push(body.note === null ? null : String(body.note)); }
  if (body.hook !== undefined) { fields.push('hook = ?'); values.push(body.hook === null || String(body.hook).trim() === '' ? null : String(body.hook).trim().slice(0, 200)); }
  if (body.status !== undefined) {
    if (!(CLIP_STATUSES as string[]).includes(body.status)) { res.status(400).json({ error: 'unknown status', message: 'Ein Schritt ist new, planned, cut oder published.' }); return; }
    fields.push('status = ?'); values.push(body.status);
    // Reaching "published" dates the moment once; moving on and back keeps that date.
    if (body.status === 'published' && !existing.published_at && body.published_at === undefined) { fields.push('published_at = CURRENT_TIMESTAMP'); }
    // Back on the board after an archive: unarchive.
    if (body.status !== 'published' && existing.archived_at) { fields.push('archived_at = NULL'); }
  }
  if (body.platforms !== undefined) {
    if (!Array.isArray(body.platforms) || !body.platforms.every((p: unknown) => typeof p === 'string' && PLATFORM_PATTERN.test(p))) {
      res.status(400).json({ error: 'invalid platforms', message: 'Plattformen sind kurze Kleinbuchstaben-Namen, etwa tiktok oder shorts.' }); return;
    }
    fields.push('platforms = ?'); values.push(JSON.stringify([...new Set(body.platforms as string[])]));
  }
  if (body.planned_for !== undefined) {
    if (body.planned_for !== null && !isDate(body.planned_for)) { res.status(400).json({ error: 'invalid planned_for', message: 'Ein Termin ist ein Datum wie 2026-10-10.' }); return; }
    fields.push('planned_for = ?'); values.push(body.planned_for);
  }
  if (body.published_at !== undefined) {
    if (body.published_at !== null && Number.isNaN(Date.parse(body.published_at))) { res.status(400).json({ error: 'invalid published_at' }); return; }
    fields.push('published_at = ?'); values.push(body.published_at === null ? null : new Date(body.published_at).toISOString().replace('T', ' ').slice(0, 19));
  }
  if (body.archived_at !== undefined) {
    if (body.archived_at !== null) { res.status(400).json({ error: 'archived_at can only be cleared', message: 'Ins Archiv kommt ein Moment von selbst, 30 Tage nach dem Veröffentlichen.' }); return; }
    fields.push('archived_at = NULL');
  }

  if (fields.length === 0) { res.status(400).json({ error: 'No fields to update' }); return; }

  values.push(req.params.id);
  db.prepare(`UPDATE clips SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  const clip = findClip(req.params.id)!;

  broadcast('clip-updated', clip);

  // An auto-clip just kept (tag lost the auto- prefix) and not yet synced: sync now.
  const wasAutoClip = existing.tag.startsWith('auto-');
  const isNowConfirmed = !clip.tag.startsWith('auto-');
  if (wasAutoClip && isNowConfirmed && !clip.notion_page_id) {
    maybeAutoSync(clip);
  }

  res.json(clip);
});

// DELETE clip — archives the Notion page (best-effort) before local delete
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const clip = getDb().prepare('SELECT notion_page_id FROM clips WHERE id = ?').get(id) as { notion_page_id: string | null } | undefined;
  if (clip?.notion_page_id) {
    // Fire-and-forget archive — local delete must not depend on Notion availability
    archiveNotionPage(clip.notion_page_id).catch(() => { /* already logged */ });
  }
  getDb().prepare('DELETE FROM clips WHERE id = ?').run(id);
  broadcast('clip-deleted', { id });
  res.status(204).send();
});

function formatTimecode(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:00`;
}

export default router;

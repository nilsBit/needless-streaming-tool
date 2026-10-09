import { Router } from 'express';
import { getDb } from '../db/index';
import { broadcast } from '../websocket/index';
import { getStreamTimecodes } from '../obs/index';
import type { Clip } from '../../shared/types';

// Moments: "Moment merken" in the app, on the Stream Deck or by hotkey, and
// what the tool marks by itself (hype, milestones). Since 2026-10-09 a moment
// is a mark in the timeline under "Nach dem Stream" — the content board with
// steps, platforms and Notion is gone; the tool is about streaming only.

type ClipRow = Omit<Clip, 'platforms'> & { platforms: string };

function toClip(row: ClipRow): Clip {
  let platforms: string[] = [];
  try { const parsed = JSON.parse(row.platforms || '[]'); if (Array.isArray(parsed)) platforms = parsed.filter((p) => typeof p === 'string'); } catch { /* keep [] */ }
  return { ...row, platforms };
}

/** Marks a moment now, with the stream timecode when OBS knows it. */
export async function createClip(tag: string, note?: string | null, confidence?: string | null): Promise<Clip | null> {
  try {
    const sessionDate = new Date().toISOString().split('T')[0];
    const { stream_timecode, recording_timecode } = await getStreamTimecodes();
    const result = getDb().prepare(
      'INSERT INTO clips (tag, note, session_date, stream_timecode, recording_timecode, confidence) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(tag, note?.trim().slice(0, 200) || null, sessionDate, stream_timecode, recording_timecode, confidence || null);
    const clip = toClip(getDb().prepare('SELECT * FROM clips WHERE id = ?').get(result.lastInsertRowid) as ClipRow);
    broadcast('clip-created', clip);
    return clip;
  } catch (err) {
    console.error('[Clips] createClip failed:', err);
    return null;
  }
}

const router = Router();

// GET moments, newest first; by session_date when asked.
router.get('/', (req, res) => {
  const { session_date } = req.query;
  const rows = session_date
    ? getDb().prepare('SELECT * FROM clips WHERE session_date = ? ORDER BY created_at DESC').all(String(session_date))
    : getDb().prepare('SELECT * FROM clips ORDER BY created_at DESC').all();
  res.json((rows as ClipRow[]).map(toClip));
});

// POST a moment.
router.post('/', async (req, res) => {
  const { tag, note } = req.body ?? {};
  if (!tag || typeof tag !== 'string' || tag.length > 40) { res.status(400).json({ error: 'tag required' }); return; }
  if (note !== undefined && note !== null && typeof note !== 'string') { res.status(400).json({ error: 'note must be text' }); return; }
  const clip = await createClip(tag, note, null);
  if (!clip) { res.status(500).json({ error: 'Failed to create clip' }); return; }
  res.status(201).json(clip);
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  getDb().prepare('DELETE FROM clips WHERE id = ?').run(id);
  broadcast('clip-deleted', { id });
  res.status(204).send();
});

export default router;

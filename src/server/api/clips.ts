import { Router } from 'express';
import { getDb } from '../db/index';
import { broadcast } from '../websocket/index';
import { syncClipToNotion } from './notion-sync';
import { getStreamTimecodes } from '../obs/index';

const router = Router();

// GET clips (filterable by session_date and tag)
router.get('/', (req, res) => {
  const { session_date, tag } = req.query;
  let query = 'SELECT * FROM clips';
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (session_date) { conditions.push('session_date = ?'); values.push(session_date); }
  if (tag) { conditions.push('tag = ?'); values.push(tag); }

  if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
  query += ' ORDER BY created_at DESC';

  const clips = getDb().prepare(query).all(...values);
  res.json(clips);
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
    const name = clip.tag;
    const note = (clip.note || '').replace(/,/g, ';').replace(/"/g, "'");
    csvRows.push(`${name},${timecode},${timecode},${note}`);
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

  const clips = getDb().prepare(
    'SELECT * FROM clips WHERE session_date = ? ORDER BY created_at ASC'
  ).all(sessionDate) as Array<{ id: number; tag: string; note: string | null; session_date: string; created_at: string }>;

  if (clips.length === 0) { res.status(404).json({ error: 'No clips for this date' }); return; }

  let synced = 0;
  let failed = 0;
  for (const clip of clips) {
    const ok = await syncClipToNotion(clip);
    if (ok) synced++; else failed++;
  }

  res.json({ session_date: sessionDate, total: clips.length, synced, failed });
});

// POST new clip
router.post('/', async (req, res) => {
  const { tag, note } = req.body;
  if (!tag) { res.status(400).json({ error: 'tag required' }); return; }

  const sessionDate = new Date().toISOString().split('T')[0];
  const { stream_timecode, recording_timecode } = await getStreamTimecodes();

  const result = getDb().prepare(
    'INSERT INTO clips (tag, note, session_date, stream_timecode, recording_timecode) VALUES (?, ?, ?, ?, ?)'
  ).run(tag, note || null, sessionDate, stream_timecode, recording_timecode);

  const clip = getDb().prepare('SELECT * FROM clips WHERE id = ?').get(result.lastInsertRowid) as {
    id: number; tag: string; note: string | null; session_date: string;
    stream_timecode: string | null; recording_timecode: string | null; created_at: string;
  };
  broadcast('clip-created', clip);

  // Auto-sync to Notion (fire and forget)
  syncClipToNotion(clip).catch(() => {});

  res.status(201).json(clip);
});

// PATCH clip — /:id routes AFTER named routes
router.patch('/:id', (req, res) => {
  const { tag, note } = req.body;
  const db = getDb();

  const existing = db.prepare('SELECT * FROM clips WHERE id = ?').get(req.params.id);
  if (!existing) { res.status(404).json({ error: 'Clip not found' }); return; }

  const fields: string[] = [];
  const values: unknown[] = [];

  if (tag !== undefined) { fields.push('tag = ?'); values.push(tag); }
  if (note !== undefined) { fields.push('note = ?'); values.push(note); }

  if (fields.length === 0) { res.status(400).json({ error: 'No fields to update' }); return; }

  values.push(req.params.id);
  db.prepare(`UPDATE clips SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  const clip = db.prepare('SELECT * FROM clips WHERE id = ?').get(req.params.id);

  broadcast('clip-updated', clip);
  res.json(clip);
});

// DELETE clip
router.delete('/:id', (req, res) => {
  getDb().prepare('DELETE FROM clips WHERE id = ?').run(req.params.id);
  broadcast('clip-deleted', { id: Number(req.params.id) });
  res.status(204).send();
});

function formatTimecode(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:00`;
}

export default router;

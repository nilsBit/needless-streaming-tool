import { Router } from 'express';
import { getDb } from '../db/index';
import { broadcast } from '../websocket/index';

const router = Router();

export function getActiveQueue() {
  return getDb().prepare(
    "SELECT * FROM song_requests WHERE status IN ('pending', 'playing') ORDER BY CASE status WHEN 'playing' THEN 0 ELSE 1 END, created_at ASC"
  ).all();
}

const YOUTUBE_RE = /(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]+)/i;
const SPOTIFY_RE = /open\.spotify\.com\/track\/([\w]+)/i;

interface OEmbedResult {
  title: string;
  artist: string | null;
  source: 'youtube' | 'spotify';
}

export async function resolveOEmbed(url: string): Promise<OEmbedResult | null> {
  try {
    if (YOUTUBE_RE.test(url)) {
      const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return null;
      const data = await res.json() as { title: string; author_name?: string };
      return { title: data.title, artist: data.author_name || null, source: 'youtube' };
    }
    if (SPOTIFY_RE.test(url)) {
      const res = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return null;
      const data = await res.json() as { title: string };
      // Spotify oEmbed title is often "Song - Artist"
      const parts = data.title.split(' - ');
      if (parts.length >= 2) {
        return { title: parts[0].trim(), artist: parts.slice(1).join(' - ').trim(), source: 'spotify' };
      }
      return { title: data.title, artist: null, source: 'spotify' };
    }
    return null;
  } catch {
    return null;
  }
}

export function detectSource(url: string): 'youtube' | 'spotify' | null {
  if (YOUTUBE_RE.test(url)) return 'youtube';
  if (SPOTIFY_RE.test(url)) return 'spotify';
  return null;
}

// GET / — queue (pending + playing)
router.get('/', (_req, res) => {
  res.json(getActiveQueue());
});

// POST /clear — skip all pending
router.post('/clear', (_req, res) => {
  getDb().prepare("UPDATE song_requests SET status = 'skipped' WHERE status = 'pending'").run();
  broadcast('sr-update', {});
  res.json({ success: true });
});

// POST /:id/play
router.post('/:id/play', (req, res) => {
  const db = getDb();
  const { changes } = db.prepare("UPDATE song_requests SET status = 'playing' WHERE id = ?").run(req.params.id);
  if (!changes) { res.status(404).json({ error: 'Not found' }); return; }
  db.prepare("UPDATE song_requests SET status = 'done' WHERE status = 'playing' AND id != ?").run(req.params.id);
  broadcast('sr-update', {});
  res.json({ success: true });
});

// POST /:id/skip
router.post('/:id/skip', (req, res) => {
  const { changes } = getDb().prepare("UPDATE song_requests SET status = 'skipped' WHERE id = ?").run(req.params.id);
  if (!changes) { res.status(404).json({ error: 'Not found' }); return; }
  broadcast('sr-update', {});
  res.json({ success: true });
});

// DELETE /:id
router.delete('/:id', (req, res) => {
  const { changes } = getDb().prepare('DELETE FROM song_requests WHERE id = ?').run(req.params.id);
  if (!changes) { res.status(404).json({ error: 'Not found' }); return; }
  broadcast('sr-update', {});
  res.status(204).send();
});

export default router;

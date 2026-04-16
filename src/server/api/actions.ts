import { Router } from 'express';
import { getDb } from '../db/index';
import { broadcast } from '../websocket/index';

const router = Router();

// Roulette cooldown state
let rouletteCooldownUntil = 0;
const ROULETTE_COOLDOWN_MS = 60_000; // 1 minute

// POST compile & pray
router.post('/compile-pray', (_req, res) => {
  broadcast('compile-pray', { timestamp: new Date().toISOString() });
  res.json({ triggered: true });
});

// GET roulette status
router.get('/roulette/status', (_req, res) => {
  const now = Date.now();
  const onCooldown = now < rouletteCooldownUntil;
  const remainingMs = onCooldown ? rouletteCooldownUntil - now : 0;
  res.json({ on_cooldown: onCooldown, remaining_seconds: Math.ceil(remainingMs / 1000) });
});

// POST roulette spin
router.post('/roulette', (_req, res) => {
  const now = Date.now();

  // Check cooldown
  if (now < rouletteCooldownUntil) {
    const remaining = Math.ceil((rouletteCooldownUntil - now) / 1000);
    res.status(429).json({ error: `Roulette auf Cooldown — noch ${remaining}s`, remaining_seconds: remaining });
    return;
  }

  const issues = getDb().prepare('SELECT * FROM issues WHERE status = ?').all('open') as Array<{ id: number; title: string }>;

  if (issues.length === 0) {
    res.status(400).json({ error: 'No open issues' });
    return;
  }

  const winner = issues[Math.floor(Math.random() * issues.length)];

  // Set cooldown
  rouletteCooldownUntil = now + ROULETTE_COOLDOWN_MS;

  broadcast('roulette-spin', { issues, winner_id: winner.id });
  broadcast('roulette-result', { title: winner.title, id: winner.id });
  broadcast('roulette-cooldown', { remaining_seconds: 60 });

  res.json({ winner, issues_count: issues.length, cooldown_seconds: 60 });
});

// Song / Now Playing
router.get('/song', (_req, res) => {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get('current_song') as { value: string } | undefined;
  res.json({ song: row?.value || null });
});

router.post('/song', (req, res) => {
  const { song } = req.body;
  if (song) {
    getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('current_song', song);
    broadcast('song-update', { song });
  } else {
    getDb().prepare('DELETE FROM settings WHERE key = ?').run('current_song');
    broadcast('song-clear', {});
  }
  res.json({ success: true });
});

// Direct trigger function (used by EventSub, bypasses HTTP + auth)
export function triggerRoulette(): { winner: { id: number; title: string } } | { error: string } {
  const now = Date.now();

  if (now < rouletteCooldownUntil) {
    const remaining = Math.ceil((rouletteCooldownUntil - now) / 1000);
    return { error: `Cooldown — noch ${remaining}s` };
  }

  const issues = getDb().prepare('SELECT * FROM issues WHERE status = ?').all('open') as Array<{ id: number; title: string }>;
  if (issues.length === 0) return { error: 'No open issues' };

  const winner = issues[Math.floor(Math.random() * issues.length)];
  rouletteCooldownUntil = now + ROULETTE_COOLDOWN_MS;

  broadcast('roulette-spin', { issues, winner_id: winner.id });
  broadcast('roulette-result', { title: winner.title, id: winner.id });
  broadcast('roulette-cooldown', { remaining_seconds: 60 });

  return { winner };
}

export default router;

import { Router } from 'express';
import { getDb } from '../db/index';
import { broadcast } from '../websocket/index';
import { getAutoDetectSetting, setAutoDetectSetting, isSMTCSupported, isSMTCRunning } from '../integrations/smtc';

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
  let song: { title: string; artist: string; source: string } | null = null;
  if (row?.value) {
    try {
      song = JSON.parse(row.value);
    } catch {
      song = { title: row.value, artist: '', source: 'manual' };
    }
  }
  res.json({
    song,
    auto_detect: getAutoDetectSetting(),
    auto_detect_supported: isSMTCSupported(),
    auto_detect_running: isSMTCRunning(),
  });
});

router.post('/song', (req, res) => {
  const { title, artist, source } = req.body as { title?: string; artist?: string; source?: string };
  if (title) {
    const data = { title, artist: artist || '', source: source || 'manual' };
    getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('current_song', JSON.stringify(data));
    broadcast('song-update', data);
  } else {
    getDb().prepare('DELETE FROM settings WHERE key = ?').run('current_song');
    broadcast('song-clear', {});
  }
  res.json({ success: true });
});

router.post('/song/auto-detect', (req, res) => {
  const { enabled } = req.body as { enabled?: boolean };
  setAutoDetectSetting(Boolean(enabled));
  res.json({ success: true, enabled: getAutoDetectSetting(), running: isSMTCRunning() });
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

// Test events for overlay preview
const STATIC_TEST_EVENTS: Record<string, { event: string; data: unknown }[]> = {
  alerts: [
    { event: 'reward-redeemed', data: { reward_type: 'roulette', user_name: 'TestViewer' } },
  ],
  song: [
    { event: 'song-update', data: { title: 'Neon Lights', artist: 'Synthwave Artist', source: 'test' } },
  ],
  poll: [
    { event: 'poll-update', data: { title: 'Welches Feature als nächstes?', options: [{ label: 'Dark Mode', votes: 12 }, { label: 'Chat Overlay', votes: 8 }, { label: 'Sound Alerts', votes: 15 }] } },
  ],
  milestone: [
    { event: 'milestone-trigger', data: { level: 'major', title: 'Test Milestone!', message: 'Das ist ein Test-Event.' } },
  ],
  experiment: [
    { event: 'stream-state', data: { challenge_title: 'Test Challenge: UI Redesign', challenge_status: 'in_progress', timer_seconds: 3723, timer_running: true, is_live: true } },
  ],
};

function getTestEvents(name: string): { event: string; data: unknown }[] {
  if (STATIC_TEST_EVENTS[name]) return STATIC_TEST_EVENTS[name];

  if (name === 'roulette') {
    const issues = getDb().prepare('SELECT * FROM issues WHERE status = ?').all('open') as Array<{ id: number; title: string }>;
    if (issues.length === 0) {
      const fakeIssues = [
        { id: 1, title: 'Demo Issue A' },
        { id: 2, title: 'Demo Issue B' },
        { id: 3, title: 'Demo Issue C' },
      ];
      return [{ event: 'roulette-spin', data: { issues: fakeIssues, winner_id: 2 } }];
    }
    const winner = issues[Math.floor(Math.random() * issues.length)];
    return [{ event: 'roulette-spin', data: { issues, winner_id: winner.id } }];
  }

  if (name === 'reward-leaderboard' || name === 'reward-rankchange') {
    return [{
      event: 'reward-leaderboard-update',
      data: {
        type: 'all',
        leaderboard: [
          { rank: 1, userName: 'TestUser_A', count: 42, previousRank: 2 },
          { rank: 2, userName: 'TestUser_B', count: 38, previousRank: 1 },
          { rank: 3, userName: 'TestUser_C', count: 15, previousRank: null },
        ],
        changes: [
          { userName: 'TestUser_A', from: 2, to: 1, changeType: 'up' },
          { userName: 'TestUser_B', from: 1, to: 2, changeType: 'down' },
        ],
        entered: [{ userName: 'TestUser_C', rank: 3 }],
        exited: [{ userName: 'OldUser', previousRank: 3 }],
      },
    }];
  }

  if (name === 'todos') {
    return [{ event: 'todo-created', data: {} }];
  }

  if (name === 'progress') {
    return [{ event: 'progress-updated', data: {} }];
  }

  if (name === 'song-queue') {
    const db = getDb();
    // Insert a temporary test song request
    const result = db.prepare(
      "INSERT INTO song_requests (url, title, artist, source, requested_by, status) VALUES (?, ?, ?, ?, ?, 'playing')"
    ).run('https://www.youtube.com/watch?v=test', 'Sandstorm', 'Darude', 'youtube', 'TestViewer');
    const testId = Number(result.lastInsertRowid);
    // Insert 2 pending songs
    const id2 = Number(db.prepare(
      "INSERT INTO song_requests (url, title, artist, source, requested_by) VALUES (?, ?, ?, ?, ?)"
    ).run('https://open.spotify.com/track/test1', 'Blinding Lights', 'The Weeknd', 'spotify', 'ViewerA').lastInsertRowid);
    const id3 = Number(db.prepare(
      "INSERT INTO song_requests (url, title, artist, source, requested_by) VALUES (?, ?, ?, ?, ?)"
    ).run('https://www.youtube.com/watch?v=test2', 'Never Gonna Give You Up', 'Rick Astley', 'youtube', 'ViewerB').lastInsertRowid);
    // Clean up after 8 seconds
    setTimeout(() => {
      db.prepare('DELETE FROM song_requests WHERE id IN (?, ?, ?)').run(testId, id2, id3);
      broadcast('sr-update', {});
    }, 8000);
    return [{ event: 'sr-update', data: {} }];
  }

  return [];
}

router.post('/overlay-test/:name', (req, res) => {
  const name = req.params.name;
  const events = getTestEvents(name);
  if (events.length === 0) {
    res.json({ triggered: false, reason: 'no test events for this overlay' });
    return;
  }
  for (const { event, data } of events) {
    broadcast(event, data);
  }
  res.json({ triggered: true, events: events.length });
});

export default router;

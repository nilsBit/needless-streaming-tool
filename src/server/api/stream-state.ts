import { Router } from 'express';
import { getDb } from '../db/index';
import { broadcast } from '../websocket/index';
import { VALID_CHALLENGE_STATUS } from '../../shared/types';
import { validateEnum } from './validate';

const router = Router();

// Server-side timer — ticks every second in memory, persists to DB every 10s
let timerInterval: ReturnType<typeof setInterval> | null = null;
let timerSeconds = 0;
let tickCount = 0;

function startServerTimer() {
  if (timerInterval) return;
  // Load current value from DB
  const row = getDb().prepare('SELECT timer_seconds FROM stream_state WHERE id = 1').get() as { timer_seconds: number } | undefined;
  timerSeconds = row?.timer_seconds || 0;
  tickCount = 0;

  timerInterval = setInterval(() => {
    timerSeconds++;
    tickCount++;
    // Persist to DB every 10 seconds
    if (tickCount % 10 === 0) {
      getDb().prepare('UPDATE stream_state SET timer_seconds = ? WHERE id = 1').run(timerSeconds);
    }
    broadcast('stream-state', { ...getDb().prepare('SELECT * FROM stream_state WHERE id = 1').get() as Record<string, unknown>, timer_seconds: timerSeconds });
  }, 1000);
}

function stopServerTimer() {
  if (timerInterval) {
    // Persist final value to DB
    getDb().prepare('UPDATE stream_state SET timer_seconds = ? WHERE id = 1').run(timerSeconds);
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

// Check on startup if timer should be running
{
  try {
    const state = getDb().prepare('SELECT timer_running FROM stream_state WHERE id = 1').get() as { timer_running: number } | undefined;
    if (state?.timer_running) startServerTimer();
  } catch (err) {
    console.warn('[stream-state] Could not restore timer state:', err);
  }
}

router.get('/', (_req, res) => {
  const state = getDb().prepare('SELECT * FROM stream_state WHERE id = 1').get();
  res.json(state);
});

router.patch('/', (req, res) => {
  const { challenge_title, challenge_status, timer_seconds, timer_running, is_live, is_recording } = req.body;
  const db = getDb();

  if (!validateEnum(challenge_status, VALID_CHALLENGE_STATUS, 'challenge_status', res)) return;

  const fields: string[] = [];
  const values: unknown[] = [];

  if (challenge_title !== undefined) { fields.push('challenge_title = ?'); values.push(challenge_title); }
  if (challenge_status !== undefined) { fields.push('challenge_status = ?'); values.push(challenge_status); }
  if (timer_seconds !== undefined) { fields.push('timer_seconds = ?'); values.push(timer_seconds); }
  if (timer_running !== undefined) { fields.push('timer_running = ?'); values.push(timer_running); }
  if (is_live !== undefined) { fields.push('is_live = ?'); values.push(is_live); }
  if (is_recording !== undefined) { fields.push('is_recording = ?'); values.push(is_recording); }

  if (fields.length === 0) {
    res.status(400).json({ error: 'No fields to update' });
    return;
  }

  db.prepare(`UPDATE stream_state SET ${fields.join(', ')} WHERE id = 1`).run(...values);

  // Start/stop server-side timer based on timer_running changes
  if (timer_running !== undefined) {
    if (timer_running) startServerTimer();
    else stopServerTimer();
  }

  // If challenge is being completed/failed, check for linked project item and save its time
  if (challenge_status === 'done' || challenge_status === 'failed') {
    const currentState = db.prepare('SELECT challenge_title, timer_seconds FROM stream_state WHERE id = 1').get() as { challenge_title: string | null; timer_seconds: number };
    if (currentState.challenge_title) {
      const linkedItem = db.prepare('SELECT * FROM project_items WHERE title = ? AND status = ?').get(currentState.challenge_title, 'in_progress') as { id: number; time_spent: number } | undefined;
      if (linkedItem) {
        const timerValue = timer_seconds !== undefined ? timer_seconds : currentState.timer_seconds;
        db.prepare('UPDATE project_items SET status = ?, time_spent = time_spent + ? WHERE id = ?').run('done', timerValue, linkedItem.id);
        broadcast('progress-update', { action: 'item-updated', item: db.prepare('SELECT * FROM project_items WHERE id = ?').get(linkedItem.id) });
      }
    }
  }

  const state = db.prepare('SELECT * FROM stream_state WHERE id = 1').get();

  broadcast('stream-state', state);
  res.json(state);
});

export default router;

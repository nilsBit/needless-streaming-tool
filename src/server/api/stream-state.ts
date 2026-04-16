import { Router } from 'express';
import { getDb } from '../db/index';
import { broadcast } from '../websocket/index';
import { VALID_CHALLENGE_STATUS } from '../../shared/types';
import { validateEnum } from './validate';

const router = Router();

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
  const state = db.prepare('SELECT * FROM stream_state WHERE id = 1').get();

  broadcast('stream-state', state);
  res.json(state);
});

export default router;

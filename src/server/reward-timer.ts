import { getDb } from './db/index';
import { broadcastState, currentTimerSeconds, startServerTimer, stopServerTimer } from './api/stream-state';

/**
 * A reward's countdown (spec 2026-10-14-belohnungen-bausteine): it takes
 * "Ziel für heute" for a while — the task, who redeemed it, the time left —
 * says "Zeit um!" for a moment and then gives the goal back as it was. Only
 * one at a time. The end lives in the database, so a restart picks it up.
 */

export const REWARD_TIMER_DONE_MS = 5000;

interface Saved { challenge_title: string | null; challenge_status: string; timer_seconds: number; timer_running: number; saved_at: number }
interface Row { challenge_title: string | null; challenge_status: string; timer_running: number; timer_ends_at: number | null; timer_paused_left: number | null; saved_challenge: string | null }

let endTimer: ReturnType<typeof setTimeout> | null = null;
let clearTimer: ReturnType<typeof setTimeout> | null = null;

const row = () => getDb().prepare('SELECT challenge_title, challenge_status, timer_running, timer_ends_at, timer_paused_left, saved_challenge FROM stream_state WHERE id = 1').get() as Row;

function cancel(): void {
  if (endTimer) clearTimeout(endTimer);
  if (clearTimer) clearTimeout(clearTimer);
  endTimer = clearTimer = null;
}

export function rewardTimerActive(): boolean {
  const r = row();
  return r.timer_ends_at !== null || r.timer_paused_left !== null;
}

function schedule(endsAt: number, now: number): void {
  cancel();
  endTimer = setTimeout(timeUp, Math.max(0, endsAt - now));
}

/** 0:00 — "Zeit um!" for a moment, then the goal from before. */
function timeUp(): void {
  endTimer = null;
  getDb().prepare("UPDATE stream_state SET challenge_status = 'done' WHERE id = 1").run();
  broadcastState();
  clearTimer = setTimeout(endRewardTimer, REWARD_TIMER_DONE_MS);
}

export function startRewardTimer(o: { task: string; minutes: number; who: string }, now: number = Date.now()): { ok: true } | { ok: false; reason: string } {
  if (rewardTimerActive()) return { ok: false, reason: 'es läuft schon ein Timer' };
  const r = row();
  const own = r.challenge_title && r.challenge_status !== 'idle'
    ? JSON.stringify({ challenge_title: r.challenge_title, challenge_status: r.challenge_status, timer_seconds: currentTimerSeconds(), timer_running: r.timer_running, saved_at: now } satisfies Saved)
    : null;
  stopServerTimer();
  const endsAt = now + o.minutes * 60_000;
  getDb().prepare(`UPDATE stream_state SET challenge_title = ?, challenge_status = 'in_progress', timer_running = 0, timer_seconds = 0,
    timer_ends_at = ?, timer_task_by = ?, timer_paused_left = NULL, saved_challenge = ? WHERE id = 1`).run(o.task, endsAt, o.who, own);
  broadcastState();
  schedule(endsAt, now);
  return { ok: true };
}

/** The countdown goes; the goal from before comes back, its clock having run on. */
export function endRewardTimer(now: number = Date.now()): void {
  cancel();
  const r = row();
  if (r.timer_ends_at === null && r.timer_paused_left === null && r.saved_challenge === null) return;
  // A count-up started meanwhile ("Weiter" in the app) must not outlive the countdown
  stopServerTimer();
  const saved = r.saved_challenge ? JSON.parse(r.saved_challenge) as Saved : null;
  const seconds = saved ? saved.timer_seconds + (saved.timer_running ? Math.floor((now - saved.saved_at) / 1000) : 0) : 0;
  getDb().prepare(`UPDATE stream_state SET challenge_title = ?, challenge_status = ?, timer_seconds = ?, timer_running = ?,
    timer_ends_at = NULL, timer_task_by = NULL, timer_paused_left = NULL, saved_challenge = NULL WHERE id = 1`)
    .run(saved?.challenge_title ?? null, saved?.challenge_status ?? 'idle', seconds, saved?.timer_running ?? 0);
  if (saved?.timer_running) startServerTimer();
  broadcastState();
}

/** The goal was reset in the app: the countdown goes and nothing comes back. */
export function dropRewardTimer(): void {
  cancel();
  getDb().prepare('UPDATE stream_state SET timer_ends_at = NULL, timer_task_by = NULL, timer_paused_left = NULL, saved_challenge = NULL WHERE id = 1').run();
}

export function toggleRewardTimerPause(now: number = Date.now()): boolean {
  const r = row();
  if (r.timer_paused_left !== null) {
    const endsAt = now + r.timer_paused_left;
    getDb().prepare('UPDATE stream_state SET timer_ends_at = ?, timer_paused_left = NULL WHERE id = 1').run(endsAt);
    schedule(endsAt, now);
  } else if (r.timer_ends_at !== null && r.challenge_status === 'in_progress') {
    cancel();
    getDb().prepare('UPDATE stream_state SET timer_paused_left = ?, timer_ends_at = NULL WHERE id = 1').run(Math.max(0, r.timer_ends_at - now));
  } else {
    return false;
  }
  broadcastState();
  return true;
}

/** At start: a countdown runs on, one whose time is up ends; a paused one waits. */
export function restoreRewardTimer(now: number = Date.now()): void {
  const r = row();
  if (r.timer_ends_at === null) return;
  if (r.timer_ends_at <= now) endRewardTimer(now);
  else schedule(r.timer_ends_at, now);
}

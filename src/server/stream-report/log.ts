import { getDb } from '../db/index';
import { getBotConfig } from '../bot/config';
import { canonicalTrigger, triggerExists, triggerOf } from '../bot/command-names';

/**
 * Writes down what happens while the stream is live, for "Nach dem Stream".
 * A stream is known by Twitch's start time; everything is stored in seconds
 * after it. Chat is counted per minute and viewer — never what was written.
 * Outside a live stream every note is dropped.
 */

export type ActivityKind = 'scene' | 'goal' | 'poll' | 'wheel';

let current: { id: number; startMs: number } | null = null;
/** The last scene, goal and poll noted, so a repeat is not a change. */
let lastActivity: Partial<Record<ActivityKind, string | null>> = {};

/** Twitch writes the same start with and without fractions of a second. */
function toSecond(iso: string): string | null {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? new Date(Math.floor(ms / 1000) * 1000).toISOString() : null;
}

/** A new Twitch start this soon after the last end is the same stream, after the connection dropped. */
export const RESUME_WITHIN_MS = 15 * 60_000;
/** A break in the connection shorter than this is not worth a part in the timeline. */
export const MIN_GAP_MS = 60_000;

interface StreamRef { id: number; started_at: string; ended_at: string | null; last_seen_at?: string | null }

/** The stream went live (or was found live after a restart of the tool). */
export function streamStarted(startedAt: string | undefined, now: number = Date.now()): void {
  const start = toSecond(startedAt ?? '');
  if (!start) return;
  const db = getDb();
  // The same Twitch start — or one already folded into an earlier stream.
  const known = (db.prepare('SELECT id, started_at, ended_at FROM streams WHERE started_at = ?').get(start)
    ?? db.prepare("SELECT s.id, s.started_at, s.ended_at FROM stream_events e JOIN streams s ON s.id = e.stream_id WHERE e.kind = 'resume' AND e.name = ?").get(start)) as StreamRef | undefined;
  if (known) { resume(known, now); return; }
  // Twitch began a new stream soon after the last one ended: the connection
  // dropped for a while. It stays one stream, with the gap in its timeline.
  const last = db.prepare('SELECT id, started_at, ended_at, last_seen_at FROM streams ORDER BY started_at DESC LIMIT 1').get() as StreamRef | undefined;
  if (last) {
    const lastEnd = Date.parse(last.ended_at ?? last.last_seen_at ?? last.started_at);
    if (Date.parse(start) > Date.parse(last.started_at) && Date.parse(start) - lastEnd <= RESUME_WITHIN_MS) {
      resume(last, now);
      addEvent('resume', start, null, null, now);
      return;
    }
  }
  // An offline that never came: the earlier stream ended when it was last seen.
  db.prepare('UPDATE streams SET ended_at = COALESCE(last_seen_at, started_at) WHERE ended_at IS NULL').run();
  const id = Number(db.prepare('INSERT INTO streams (started_at, last_seen_at) VALUES (?, ?)').run(start, new Date(now).toISOString()).lastInsertRowid);
  current = { id, startMs: Date.parse(start) };
  lastActivity = {};
}

/** Picks a stream up again; the time it was off the air becomes a gap. */
function resume(row: StreamRef, now: number): void {
  if (current?.id !== row.id) lastActivity = {};
  current = { id: row.id, startMs: Date.parse(row.started_at) };
  if (row.ended_at) {
    noteGap(Date.parse(row.ended_at), now);
    getDb().prepare('UPDATE streams SET ended_at = NULL WHERE id = ?').run(row.id);
  }
}

function noteGap(lost: number, to: number): void {
  if (!current) return;
  // A connection lost before the stream began only counts from its start.
  const from = Math.max(lost, current.startMs);
  if (to - from < MIN_GAP_MS) return;
  getDb().prepare("INSERT INTO stream_events (stream_id, at, kind, value) VALUES (?, ?, 'gap', ?)")
    .run(current.id, secondOf(from), Math.round((to - from) / 1000));
}

/**
 * The chat connection went down or came back. While it was down nothing
 * reached the tool — the timeline shows that stretch as a gap.
 */
let lostAt: number | null = null;
export function noteConnection(up: boolean, now: number = Date.now()): void {
  if (!up) { if (lostAt === null) lostAt = now; return; }
  if (lostAt !== null) noteGap(lostAt, now);
  lostAt = null;
}

export function streamEnded(now: number = Date.now()): void {
  if (!current) return;
  getDb().prepare('UPDATE streams SET ended_at = ?, last_seen_at = ? WHERE id = ?').run(new Date(now).toISOString(), new Date(now).toISOString(), current.id);
  current = null;
}

export function currentStreamId(): number | null {
  return current?.id ?? null;
}

function secondOf(now: number): number {
  return Math.max(0, Math.floor((now - (current?.startMs ?? now)) / 1000));
}

function seen(now: number): void {
  if (current) getDb().prepare('UPDATE streams SET last_seen_at = ? WHERE id = ?').run(new Date(now).toISOString(), current.id);
}

function addEvent(kind: string, name: string | null, login: string | null, value: number | null, now: number): void {
  if (!current) return;
  getDb().prepare('INSERT INTO stream_events (stream_id, at, kind, name, login, value) VALUES (?, ?, ?, ?, ?, ?)')
    .run(current.id, secondOf(now), kind, name === null ? null : name.slice(0, 120), login, value);
  seen(now);
}

/** The streamer and the bot are not part of "who was in chat". */
function isOwnAccount(login: string): boolean {
  const bot = getBotConfig();
  return !!bot && (login === bot.username.toLowerCase() || login === bot.channel.toLowerCase());
}

/** One chat message: counted for its minute and writer; a known command also by name. */
export function noteChat(login: string, name: string | undefined, message: string, now: number = Date.now()): void {
  if (!current) return;
  const who = login.toLowerCase();
  if (!who || isOwnAccount(who)) return;
  getDb().prepare(`INSERT INTO stream_chat (stream_id, minute, login, name, messages) VALUES (?, ?, ?, ?, 1)
    ON CONFLICT(stream_id, minute, login) DO UPDATE SET messages = messages + 1, name = excluded.name`)
    .run(current.id, Math.floor(secondOf(now) / 60), who, name || who);
  const word = triggerOf(message);
  if (word.startsWith('!')) {
    const trigger = canonicalTrigger(word);
    // Only commands that exist — a typo in chat is not stored.
    if (triggerExists(trigger)) { addEvent('command', trigger, who, null, now); return; }
  }
  seen(now);
}

export function noteFollow(login: string, name: string | undefined, now: number = Date.now()): void {
  addEvent('follow', name || login, login.toLowerCase(), null, now);
}

/** A redemption, of a Twitch reward or a Punkte-Belohnung, by its title. */
export function noteReward(title: string, login: string, now: number = Date.now()): void {
  addEvent('reward', title, login.toLowerCase(), null, now);
}

/** A marked moment, with its note — what the streamer wrote, or what the tool found. */
export function noteMoment(note: string, now: number = Date.now()): void {
  addEvent('moment', note || null, null, null, now);
}

export function noteViewers(count: number, now: number = Date.now()): void {
  if (!Number.isFinite(count) || count < 0) return;
  addEvent('viewers', null, null, Math.round(count), now);
}

/**
 * What runs on stream changed. `name` null ends a goal or poll; a poll that
 * ends carries how many voted. A wheel spin is a moment, it ends by itself.
 */
export function noteActivity(kind: ActivityKind, name: string | null, value: number | null = null, now: number = Date.now()): void {
  if (!current) return;
  // The same scene or goal reported again changes nothing.
  if (kind !== 'wheel' && value === null && lastActivity[kind] === name) return;
  lastActivity = { ...lastActivity, [kind]: name };
  addEvent(kind, name, null, value, now);
}

/** For tests: forget which stream is running. */
export function resetStreamLog(): void {
  current = null;
  lostAt = null;
  lastActivity = {};
}

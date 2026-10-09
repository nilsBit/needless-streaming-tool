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

/** The stream went live (or was found live after a restart of the tool). */
export function streamStarted(startedAt: string | undefined, now: number = Date.now()): void {
  const start = toSecond(startedAt ?? '');
  if (!start) return;
  const db = getDb();
  const row = db.prepare('SELECT id FROM streams WHERE started_at = ?').get(start) as { id: number } | undefined;
  if (row) {
    if (current?.id !== row.id) lastActivity = {};
    current = { id: row.id, startMs: Date.parse(start) };
    db.prepare('UPDATE streams SET ended_at = NULL WHERE id = ?').run(row.id);
    return;
  }
  // An offline that never came: the earlier stream ended when it was last seen.
  db.prepare('UPDATE streams SET ended_at = COALESCE(last_seen_at, started_at) WHERE ended_at IS NULL').run();
  const id = Number(db.prepare('INSERT INTO streams (started_at, last_seen_at) VALUES (?, ?)').run(start, new Date(now).toISOString()).lastInsertRowid);
  current = { id, startMs: Date.parse(start) };
  lastActivity = {};
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
  lastActivity = {};
}

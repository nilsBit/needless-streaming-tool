import { getDb } from '../db/index';
import { currentStreamId } from './log';

/**
 * "Nach dem Stream": what one stream was, from what log.ts wrote down. All of
 * it is counting and comparing — no guess about what was talked about. A
 * part of the stream is named by what ran: a poll, the wheel, the goal, the
 * scene.
 */

/** How long a wheel spin counts as "Glücksrad" in the timeline. */
export const WHEEL_SECONDS = 10 * 60;
/** Parts shorter than this fold into the one before (a 30 s reward scene). */
export const MIN_PART_SECONDS = 3 * 60;
/** The streams before this one a number is compared with. */
const COMPARE_WITH = 5;
/** Someone in chat in this many of the last five streams is a regular. */
const REGULAR_IN = 3;
const NAMES_SHOWN = 8;

interface StreamRow { id: number; started_at: string; ended_at: string | null; last_seen_at: string | null }
interface EventRow { at: number; kind: string; name: string | null; login: string | null; value: number | null }
interface ChatRow { minute: number; login: string; name: string | null; messages: number }

export interface StreamListItem { id: number; started_at: string; minutes: number; live: boolean }
export interface Kpi { key: string; label: string; value: number | null; mean: number | null }
export interface Part {
  from: number; to: number; minutes: number; label: string; kind: 'poll' | 'wheel' | 'goal' | 'scene' | 'none';
  rate: number; chatters: number; follows: number; moments: number; note: string;
}
export interface Insight { kind: string; big: string; text: string; tone: 'busy' | 'join' | 'follow' | 'quiet' }
export interface StreamReport {
  id: number; started_at: string; minutes: number; live: boolean;
  kpis: Kpi[];
  average_rate: number;
  busiest: { label: string; ratio: number } | null;
  parts: Part[];
  insights: Insight[];
  people: { total: number; known: number | null; fresh: string[]; fresh_more: number; missing: string[] | null; follows: number; follows_chatted: number };
  used: Array<{ name: string; count: number; people: number; kind: 'command' | 'reward' }>;
  unused: string[] | null;
}

function endOf(s: StreamRow, now: number): number {
  const end = s.ended_at ?? (s.id === currentStreamId() ? new Date(now).toISOString() : s.last_seen_at ?? s.started_at);
  return Math.max(0, Math.floor((Date.parse(end) - Date.parse(s.started_at)) / 1000));
}

const round1 = (n: number) => Math.round(n * 10) / 10;
export const clock = (seconds: number) => `${Math.floor(seconds / 3600)}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}`;

export function listStreams(now: number = Date.now()): StreamListItem[] {
  const rows = getDb().prepare('SELECT * FROM streams ORDER BY started_at DESC LIMIT 50').all() as StreamRow[];
  return rows.map((s) => ({ id: s.id, started_at: s.started_at, minutes: Math.round(endOf(s, now) / 60), live: s.id === currentStreamId() }));
}

function eventsOf(id: number): EventRow[] {
  return getDb().prepare('SELECT at, kind, name, login, value FROM stream_events WHERE stream_id = ? ORDER BY at, id').all(id) as EventRow[];
}
function chatOf(id: number): ChatRow[] {
  return getDb().prepare('SELECT minute, login, name, messages FROM stream_chat WHERE stream_id = ?').all(id) as ChatRow[];
}

function kpisOf(events: EventRow[], chat: ChatRow[]): Record<string, number | null> {
  const viewers = events.filter((e) => e.kind === 'viewers' && e.value !== null).map((e) => e.value as number);
  return {
    viewers: viewers.length ? Math.round(viewers.reduce((a, b) => a + b, 0) / viewers.length) : null,
    peak: viewers.length ? Math.max(...viewers) : null,
    follows: events.filter((e) => e.kind === 'follow').length,
    chatters: new Set(chat.map((c) => c.login)).size,
    messages: chat.reduce((a, c) => a + c.messages, 0),
    rewards: events.filter((e) => e.kind === 'reward').length,
  };
}

const KPI_LABELS: Array<[string, string]> = [
  ['viewers', 'Zuschauer im Schnitt'], ['peak', 'Höchstens gleichzeitig'], ['follows', 'Neue Follower'],
  ['chatters', 'Aktive Chatter'], ['messages', 'Nachrichten'], ['rewards', 'Belohnungen eingelöst'],
];

/** Splits the stream by what ran. Poll beats wheel beats goal beats scene. */
function partsOf(events: EventRow[], length: number): Array<{ from: number; to: number; label: string; kind: Part['kind']; poll?: string }> {
  const state: { scene: string | null; goal: string | null; poll: string | null; wheelUntil: number } = { scene: null, goal: null, poll: null, wheelUntil: -1 };
  const label = (t: number): { label: string; kind: Part['kind']; poll?: string } => {
    if (state.poll) return { label: `Abstimmung „${state.poll}“`, kind: 'poll', poll: state.poll };
    if (t < state.wheelUntil) return { label: 'Glücksrad', kind: 'wheel' };
    if (state.goal) return { label: `Ziel: ${state.goal}`, kind: 'goal' };
    if (state.scene) return { label: `Szene „${state.scene}“`, kind: 'scene' };
    return { label: 'Stream', kind: 'none' };
  };
  const activity = events.filter((e) => ['scene', 'goal', 'poll', 'wheel'].includes(e.kind));
  const cuts = new Set<number>([0]);
  for (const e of activity) { cuts.add(Math.min(e.at, length)); if (e.kind === 'wheel') cuts.add(Math.min(e.at + WHEEL_SECONDS, length)); }
  const times = [...cuts].filter((t) => t < length).sort((a, b) => a - b);
  const raw: Array<{ from: number; to: number; label: string; kind: Part['kind']; poll?: string }> = [];
  let i = 0;
  times.forEach((t, k) => {
    while (i < activity.length && activity[i].at <= t) {
      const e = activity[i++];
      if (e.kind === 'scene') state.scene = e.name;
      if (e.kind === 'goal') state.goal = e.name;
      if (e.kind === 'poll') state.poll = e.name;
      if (e.kind === 'wheel') state.wheelUntil = e.at + WHEEL_SECONDS;
    }
    raw.push({ from: t, to: times[k + 1] ?? length, ...label(t) });
  });
  const merge = (list: typeof raw) => list.reduce<typeof raw>((out, p) => {
    const last = out[out.length - 1];
    if (last && last.label === p.label) last.to = p.to; else out.push({ ...p });
    return out;
  }, []);
  // Short parts fold into a neighbour — a poll stays, however short it was.
  const isShort = (q: { from: number; to: number; kind: Part['kind'] }) => q.kind !== 'poll' && q.to - q.from < MIN_PART_SECONDS;
  let parts = merge(raw);
  let short = parts.findIndex(isShort);
  while (short !== -1 && parts.length > 1) {
    const p = parts[short];
    const prev = parts[short - 1];
    const next = parts[short + 1];
    if (prev && (prev.kind !== 'poll' || !next)) prev.to = p.to; else next.from = p.from;
    parts.splice(short, 1);
    parts = merge(parts);
    short = parts.findIndex(isShort);
  }
  return parts;
}

export function streamReport(id: number, now: number = Date.now()): StreamReport | null {
  const db = getDb();
  const stream = db.prepare('SELECT * FROM streams WHERE id = ?').get(id) as StreamRow | undefined;
  if (!stream) return null;
  const length = endOf(stream, now);
  const events = eventsOf(id);
  const chat = chatOf(id);
  const before = db.prepare('SELECT * FROM streams WHERE started_at < ? ORDER BY started_at DESC').all(stream.started_at) as StreamRow[];
  const lastFive = before.slice(0, COMPARE_WITH);

  // The numbers, each next to the mean of the streams before.
  const mine = kpisOf(events, chat);
  const theirs = lastFive.map((s) => kpisOf(eventsOf(s.id), chatOf(s.id)));
  const kpis: Kpi[] = KPI_LABELS.map(([key, label]) => {
    const values = theirs.map((k) => k[key]).filter((v): v is number => v !== null);
    return { key, label, value: mine[key], mean: values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null };
  });

  const minutes = Math.max(1, length / 60);
  const messages = mine.messages ?? 0;
  const averageRate = round1(messages / minutes);

  // The timeline.
  const parts: Part[] = partsOf(events, Math.max(length, 1)).map((p) => {
    const inside = (at: number) => at >= p.from && at < p.to;
    const lines = chat.filter((c) => inside(c.minute * 60));
    const mins = Math.max(1, (p.to - p.from) / 60);
    const inEvents = events.filter((e) => inside(e.at));
    const moments = inEvents.filter((e) => e.kind === 'moment');
    const chatters = new Set(lines.map((c) => c.login)).size;
    const notes: string[] = [];
    if (p.kind === 'poll') {
      const close = events.find((e) => e.kind === 'poll' && e.name === null && e.at >= p.from && e.at <= p.to + 1 && e.value !== null);
      if (close) notes.push(`${close.value} von ${chatters} Chattern haben abgestimmt.`);
    } else if (p.kind === 'wheel') {
      const spins = inEvents.filter((e) => e.kind === 'wheel').length;
      notes.push(spins === 1 ? 'Einmal gedreht.' : `${spins}-mal gedreht.`);
    }
    const commands = new Map<string, number>();
    for (const e of inEvents) if (e.kind === 'command' && e.name) commands.set(e.name, (commands.get(e.name) ?? 0) + 1);
    const top = [...commands.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] >= 3 && p.kind !== 'poll') notes.push(`Meistgenutzt hier: ${top[0]} (${top[1]}×).`);
    if (moments.length) notes.push(`${moments.length === 1 ? 'Moment' : 'Momente'} bei ${moments.map((m) => clock(m.at) + (m.name ? ` („${m.name.slice(0, 60)}“)` : '')).join(', ')}.`);
    return {
      from: p.from, to: p.to, minutes: Math.round(mins), label: p.label, kind: p.kind,
      rate: round1(lines.reduce((a, c) => a + c.messages, 0) / mins), chatters,
      follows: inEvents.filter((e) => e.kind === 'follow').length, moments: moments.length, note: notes.join(' '),
    };
  });

  // What stood out — only where there is something to compare.
  const insights: Insight[] = [];
  let busiest: StreamReport['busiest'] = null;
  if (parts.length >= 2 && averageRate > 0) {
    const best = parts.reduce((a, b) => (b.rate > a.rate ? b : a));
    const ratio = round1(best.rate / averageRate);
    if (ratio >= 1.3) {
      busiest = { label: best.label, ratio };
      insights.push({ kind: 'Bringt den Chat in Gang', tone: 'busy', big: `${String(ratio).replace('.', ',')}×`, text: `${best.label} hatte ${String(ratio).replace('.', ',')}-mal so viele Nachrichten pro Minute wie der Stream im Schnitt.` });
    }
  }
  const pollPart = [...parts].reverse().find((p) => p.kind === 'poll' && p.note);
  if (pollPart) {
    const close = events.find((e) => e.kind === 'poll' && e.name === null && e.value !== null && e.at >= pollPart.from && e.at <= pollPart.to + 1);
    insights.push({ kind: 'Mitmachen', tone: 'join', big: `${close?.value ?? 0} von ${pollPart.chatters}`, text: `Chattern haben bei der ${pollPart.label} mitgemacht.` });
  } else {
    const redeemers = new Set(events.filter((e) => e.kind === 'reward').map((e) => e.login)).size;
    if (redeemers > 0) insights.push({ kind: 'Mitmachen', tone: 'join', big: String(redeemers), text: redeemers === 1 ? 'Person hat eine Belohnung eingelöst.' : 'Leute haben Belohnungen eingelöst.' });
  }
  const follows = mine.follows ?? 0;
  const joinParts = parts.filter((p) => p.kind === 'poll' || p.kind === 'wheel');
  if (follows > 0 && joinParts.length > 0) {
    const during = joinParts.reduce((a, p) => a + p.follows, 0);
    insights.push({ kind: 'Follows', tone: 'follow', big: `${during} von ${follows}`, text: 'neuen Followern kamen, während Glücksrad oder Abstimmung lief.' });
  }
  if (parts.length >= 2) {
    const quiet = parts.reduce((a, b) => (b.rate < a.rate || (b.rate === a.rate && b.minutes > a.minutes) ? b : a));
    insights.push({ kind: 'Ruhigste Phase', tone: 'quiet', big: `${String(quiet.rate).replace('.', ',')}/min`, text: `${quiet.label}, ${clock(quiet.from)}\u2060–\u2060${clock(quiet.to)}.` });
  }

  // The people: who was here before, who is new, who is missing.
  const nameOf = new Map(chat.map((c) => [c.login, c.name || c.login]));
  const here = new Set(chat.map((c) => c.login));
  const earlier = before.length
    ? new Set((db.prepare(`SELECT DISTINCT c.login FROM stream_chat c JOIN streams s ON s.id = c.stream_id WHERE s.started_at < ?`).all(stream.started_at) as Array<{ login: string }>).map((r) => r.login))
    : null;
  const fresh = earlier ? [...here].filter((l) => !earlier.has(l)) : [];
  let missing: string[] | null = null;
  if (lastFive.length >= REGULAR_IN) {
    const times = new Map<string, { n: number; name: string }>();
    for (const s of lastFive) {
      const rows = db.prepare('SELECT login, MAX(name) AS name FROM stream_chat WHERE stream_id = ? GROUP BY login').all(s.id) as Array<{ login: string; name: string | null }>;
      for (const r of rows) times.set(r.login, { n: (times.get(r.login)?.n ?? 0) + 1, name: r.name || r.login });
    }
    missing = [...times.entries()].filter(([login, t]) => t.n >= REGULAR_IN && !here.has(login)).map(([, t]) => t.name).slice(0, NAMES_SHOWN);
  }
  const followers = new Set(events.filter((e) => e.kind === 'follow' && e.login).map((e) => e.login as string));
  const people = {
    total: here.size,
    known: earlier ? [...here].filter((l) => earlier.has(l)).length : null,
    fresh: fresh.slice(0, NAMES_SHOWN).map((l) => nameOf.get(l) ?? l),
    fresh_more: Math.max(0, fresh.length - NAMES_SHOWN),
    missing,
    follows: followers.size,
    follows_chatted: [...followers].filter((l) => here.has(l)).length,
  };

  // What was used, and which own commands nobody typed for five streams.
  const used = new Map<string, { name: string; count: number; who: Set<string>; kind: 'command' | 'reward' }>();
  for (const e of events) {
    if ((e.kind !== 'command' && e.kind !== 'reward') || !e.name) continue;
    const key = `${e.kind}:${e.name}`;
    const entry = used.get(key) ?? { name: e.name, count: 0, who: new Set<string>(), kind: e.kind };
    entry.count += 1;
    if (e.login) entry.who.add(e.login);
    used.set(key, entry);
  }
  let unused: string[] | null = null;
  if (before.length >= 2) {
    const window = [id, ...before.slice(0, 4).map((s) => s.id)];
    const typed = new Set((db.prepare(`SELECT DISTINCT name FROM stream_events WHERE kind = 'command' AND stream_id IN (${window.map(() => '?').join(',')})`).all(...window) as Array<{ name: string }>).map((r) => r.name));
    const own = db.prepare('SELECT trigger FROM text_commands WHERE enabled = 1 UNION SELECT trigger FROM lookup_commands WHERE enabled = 1').all() as Array<{ trigger: string }>;
    unused = own.map((r) => r.trigger).filter((t) => !typed.has(t)).sort();
  }

  return {
    id, started_at: stream.started_at, minutes: Math.round(length / 60), live: id === currentStreamId(),
    kpis, average_rate: averageRate, busiest, parts, insights, people,
    used: [...used.values()].sort((a, b) => b.count - a.count).slice(0, 8).map((u) => ({ name: u.name, count: u.count, people: u.who.size, kind: u.kind })),
    unused,
  };
}

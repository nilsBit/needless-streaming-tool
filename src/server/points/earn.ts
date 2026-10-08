import { getDb } from '../db/index';
import { getBotConfig } from '../bot/config';
import { featureOn } from '../features';
import { getPointsConfig } from './config';
import { addPoints, resetStreamContribution } from './ledger';

/**
 * Who earns the tool's own points, and when. Only while the stream is live —
 * a chat open for testing earns nothing — and never the bot, the broadcaster
 * or another bot in the channel. The sources call in from the chat bot,
 * EventSub and the watch tick in startServer(); nothing here opens a
 * connection, the Helix call comes in as a parameter.
 */

/** A GET against Helix with paging, answering its JSON or null. */
export type PagedHelix = (path: string) => Promise<{ data?: Array<Record<string, string>>; pagination?: { cursor?: string } } | null>;

const STARTED_KEY = 'points_stream_started_at';
const CHAT_GAP_MS = 60_000;
/** Twitch's name for a gift whose giver stays hidden. */
const ANONYMOUS_GIFTER = 'ananonymousgifter';

let live = false;
const lastChat = new Map<string, number>();

export function isLive(): boolean {
  return live;
}

/**
 * The stream went on or off air. `startedAt` is Twitch's start time of the
 * stream: a new one sets everyone's Beitrag of this stream to zero, the same
 * one again (the tool restarted mid-stream) does not.
 */
export function setLive(on: boolean, startedAt?: string): void {
  live = on;
  if (!on) {
    lastChat.clear();
    return;
  }
  // EventSub and Helix may write the same start with and without fractions
  // of a second, so the start is compared to the second.
  const started = Math.floor(Date.parse(startedAt ?? '') / 1000);
  if (!Number.isFinite(started)) return;
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(STARTED_KEY) as { value: string } | undefined;
  if (row?.value === String(started)) return;
  resetStreamContribution();
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(STARTED_KEY, String(started));
}

function excluded(login: string): boolean {
  if (login === ANONYMOUS_GIFTER) return true;
  const bot = getBotConfig();
  if (bot && (login === bot.username.toLowerCase() || login === bot.channel.toLowerCase())) return true;
  return getPointsConfig().bots.includes(login);
}

/** Credits points if the feature is on, the stream is live and the viewer may earn. True when credited. */
function earn(name: string, displayName: string | undefined, amount: number): boolean {
  const login = name.trim().replace(/^@/, '').toLowerCase();
  if (!login || !Number.isInteger(amount) || amount <= 0) return false;
  if (!live || !featureOn('punkte') || excluded(login)) return false;
  addPoints(login, displayName || login, amount);
  return true;
}

/** A chat message: points at most once a minute per viewer. */
export function onChatMessage(name: string, displayName?: string, now: number = Date.now()): boolean {
  const login = name.toLowerCase();
  const last = lastChat.get(login);
  if (last !== undefined && now - last < CHAT_GAP_MS) return false;
  if (!earn(login, displayName, getPointsConfig().chat_points)) return false;
  lastChat.set(login, now);
  return true;
}

export const onFollow = (name: string, displayName?: string) => earn(name, displayName, getPointsConfig().follow_points);
export const onSub = (name: string, displayName?: string) => earn(name, displayName, getPointsConfig().sub_points);
/** Gifted subs go to the one who gifts, per sub. */
export const onGift = (name: string, count: number, displayName?: string) =>
  earn(name, displayName, getPointsConfig().sub_points * Math.max(0, Math.floor(count)));
export const onRaid = (name: string, displayName?: string) => earn(name, displayName, getPointsConfig().raid_points);
export function onBits(name: string, bits: number, displayName?: string): boolean {
  const per = getPointsConfig().bits_per_point;
  return per > 0 && earn(name, displayName, Math.floor(Math.max(0, bits) / per));
}

let chattersRefused = false;

/**
 * Asks Twitch whether the stream is live — at the bot's start (the tool may
 * start mid-stream) and on every watch tick (an offline event may be missed).
 * Answers the broadcaster's id, or null when Twitch cannot be asked.
 */
export async function refreshLive(helix: PagedHelix): Promise<string | null> {
  const me = (await helix('users'))?.data?.[0]?.id;
  if (!me) return null;
  const stream = await helix(`streams?user_id=${encodeURIComponent(me)}`);
  if (stream) {
    const running = stream.data?.[0];
    setLive(!!running, running?.started_at);
  }
  return me;
}

/**
 * One watch tick: asks Twitch whether the stream is live (so a start of the
 * tool mid-stream counts, and a missed offline event does not run on), then
 * credits everyone in chat, lurkers included. Answers how many were credited.
 */
export async function watchTick(helix: PagedHelix): Promise<number> {
  if (!featureOn('punkte')) return 0;
  const me = await refreshLive(helix);
  if (!me) return 0;
  const amount = getPointsConfig().watch_points;
  if (!live || amount <= 0) return 0;

  let credited = 0;
  let cursor: string | undefined;
  do {
    const page = await helix(`chat/chatters?broadcaster_id=${me}&moderator_id=${me}&first=1000${cursor ? `&after=${encodeURIComponent(cursor)}` : ''}`);
    if (!page) {
      if (!chattersRefused) {
        console.error('[Punkte] Twitch gab die Liste der Zuschauer im Chat nicht heraus — dem Token fehlt vermutlich das Recht moderator:read:chatters. In den Settings einmal neu mit Twitch verbinden.');
        chattersRefused = true;
      }
      return credited;
    }
    chattersRefused = false;
    for (const chatter of page.data ?? []) {
      if (earn(chatter.user_login ?? '', chatter.user_name, amount)) credited += 1;
    }
    cursor = page.pagination?.cursor || undefined;
  } while (cursor);
  return credited;
}

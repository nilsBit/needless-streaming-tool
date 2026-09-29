import { broadcast } from '../websocket/index';

/**
 * What the Alerts overlay shows when someone follows, subscribes, gifts,
 * raids or cheers.
 *
 * Everything but a follow arrives over chat (IRC notices), so it needs no
 * scope beyond the ones the bot already has. Follows only exist in EventSub,
 * which is why `channel.follow` is subscribed there — and why Twitch has to be
 * connected again once, for `moderator:read:followers`.
 *
 * One event `alert` carries them all: the overlay reads `kind` for its accent
 * and shows title and line as they come, so a new kind needs no overlay change.
 */

export type AlertKind = 'follow' | 'sub' | 'resub' | 'subgift' | 'raid' | 'cheer';

export interface Alert {
  kind: AlertKind;
  /** The occasion, as the kicker line above it: "Follower", "Abo", "Raid" … */
  label: string;
  /** Who did it — the overlay sets this one in the accent colour. */
  who?: string;
  /** What they did, read after the name: "folgt jetzt." */
  text: string;
  /** What the viewer wrote along with a sub or cheer, if anything. */
  message?: string;
}

const NAME = 'jemand';

function name(value: unknown): string {
  const text = String(value ?? '').trim();
  return text || NAME;
}

function count(value: unknown, fallback = 1): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/** A viewer's own words, short enough for the corner of the screen. */
function said(value: unknown): string | undefined {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return undefined;
  return text.length > 120 ? `${text.slice(0, 117)}…` : text;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function buildAlert(kind: AlertKind, data: Record<string, unknown>): Alert {
  const who = name(data.user);
  switch (kind) {
    case 'follow':
      return { kind, label: 'Follower', who, text: 'folgt jetzt.' };
    case 'sub':
      return { kind, label: 'Abo', who, text: 'ist jetzt dabei.', message: said(data.message) };
    case 'resub': {
      const months = count(data.months);
      return { kind, label: 'Abo', who, text: `schon ${plural(months, 'Monat', 'Monate')} dabei.`, message: said(data.message) };
    }
    case 'subgift': {
      const number = count(data.count);
      const text = data.recipient
        ? `schenkt ${name(data.recipient)} ein Abo.`
        : `verschenkt ${plural(number, 'Abo', 'Abos')}.`;
      return { kind, label: 'Geschenk', who, text };
    }
    case 'raid': {
      const viewers = count(data.viewers);
      return { kind, label: 'Raid', who, text: `bringt ${plural(viewers, 'Zuschauer', 'Zuschauer')} mit.` };
    }
    case 'cheer': {
      const bits = count(data.bits);
      return { kind, label: 'Bits', who, text: `wirft ${plural(bits, 'Bit', 'Bits')} ein.`, message: said(data.message) };
    }
  }
}

/** How long single gift notices may trail their mystery gift before it is forgotten. */
const MYSTERY_GIFT_WINDOW_MS = 60_000;

/**
 * Five gifted subs arrive as one mystery gift notice and then five single
 * ones. The alert is the first; the counter tells which single notices
 * belong to it, so the screen doesn't show six alerts for one gift.
 */
export function createGiftCounter(now: () => number = Date.now) {
  const pending = new Map<string, { left: number; until: number }>();
  return {
    mystery(user: string, count: number) {
      pending.set(user.toLowerCase(), { left: count, until: now() + MYSTERY_GIFT_WINDOW_MS });
    },
    fromMystery(user: string): boolean {
      const key = user.toLowerCase();
      const entry = pending.get(key);
      if (!entry || entry.left <= 0 || now() > entry.until) {
        pending.delete(key);
        return false;
      }
      entry.left -= 1;
      return true;
    },
  };
}

export function sendAlert(kind: AlertKind, data: Record<string, unknown>): Alert {
  const alert = buildAlert(kind, data);
  broadcast('alert', alert);
  return alert;
}

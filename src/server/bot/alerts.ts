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
  title: string;
  line: string;
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
      return { kind, title: 'Neu dabei', line: `${who} folgt jetzt.` };
    case 'sub':
      return { kind, title: 'Abonniert', line: `${who} ist jetzt dabei.`, message: said(data.message) };
    case 'resub': {
      const months = count(data.months);
      return { kind, title: 'Bleibt dabei', line: `${who} schon ${plural(months, 'Monat', 'Monate')}.`, message: said(data.message) };
    }
    case 'subgift': {
      const number = count(data.count);
      const line = data.recipient
        ? `${who} schenkt ${name(data.recipient)} ein Abo.`
        : `${who} verschenkt ${plural(number, 'Abo', 'Abos')}.`;
      return { kind, title: 'Verschenkt', line };
    }
    case 'raid': {
      const viewers = count(data.viewers);
      return { kind, title: 'Raid', line: `${who} bringt ${plural(viewers, 'Zuschauer', 'Zuschauer')} mit.` };
    }
    case 'cheer': {
      const bits = count(data.bits);
      return { kind, title: 'Bits', line: `${who} wirft ${plural(bits, 'Bit', 'Bits')} ein.`, message: said(data.message) };
    }
  }
}

export function sendAlert(kind: AlertKind, data: Record<string, unknown>): Alert {
  const alert = buildAlert(kind, data);
  broadcast('alert', alert);
  return alert;
}

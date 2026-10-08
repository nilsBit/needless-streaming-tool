import fs from 'fs';
import path from 'path';
import { broadcast } from '../websocket/index';
import { getDb } from '../db/index';
import { featureOn } from '../features';
import { getUserDataPath } from '../paths';

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
 *
 * The wording and the sound are the streamer's (Settings → Features → Alerts);
 * what stands here is what a new install says.
 */

export type AlertKind = 'follow' | 'sub' | 'resub' | 'subgift' | 'raid' | 'cheer';

/** One line the streamer can word. A gift has two: to one viewer, or several at once. */
export type AlertSlot = AlertKind | 'subgift_many';

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
  /** What the overlay plays as the alert appears. Absent when no sound is set. */
  sound?: { url: string; volume: number };
}

export interface AlertSetting {
  label: string;
  text: string;
  /** A file in the sound folder, or null for a silent alert. */
  sound: string | null;
  /** 0 to 1. */
  volume: number;
  /** Off: this occasion shows no Tafel at all (08.10.: "einzelne Anlässe aus"). */
  enabled: boolean;
}

interface SlotInfo {
  /** What the settings page calls it. */
  name: string;
  label: string;
  text: string;
  /** What the text may hold, and what a test fills in for it. */
  placeholders: Record<string, string>;
}

/** The order is the order of the settings page. */
export const ALERT_SLOTS: Record<AlertSlot, SlotInfo> = {
  follow: { name: 'Follower', label: 'Follower', text: 'folgt jetzt.', placeholders: {} },
  sub: { name: 'Abo', label: 'Abo', text: 'ist jetzt dabei.', placeholders: {} },
  resub: { name: 'Abo, wiederholt', label: 'Abo', text: 'schon {monate} dabei.', placeholders: { monate: '7 Monate' } },
  subgift: { name: 'Geschenk an einen', label: 'Geschenk', text: 'schenkt {empfaenger} ein Abo.', placeholders: { empfaenger: 'Kartograph' } },
  subgift_many: { name: 'Geschenk an mehrere', label: 'Geschenk', text: 'verschenkt {abos}.', placeholders: { abos: '5 Abos' } },
  raid: { name: 'Raid', label: 'Raid', text: 'bringt {zuschauer} mit.', placeholders: { zuschauer: '42 Zuschauer' } },
  cheer: { name: 'Bits', label: 'Bits', text: 'wirft {bits} ein.', placeholders: { bits: '500 Bits' } },
};

export const ALERT_SOUND_DIR = getUserDataPath('alert-sounds');
const SOUND_TYPES = ['.mp3', '.wav', '.ogg'];
export const MAX_LABEL = 30;
export const MAX_TEXT = 120;
const DEFAULT_VOLUME = 0.6;
const SETTINGS_KEY = 'alert_settings';

const isSlot = (value: string): value is AlertSlot => Object.prototype.hasOwnProperty.call(ALERT_SLOTS, value);

/**
 * A sound's file name, or null when it is none: only a plain name with a
 * sound's ending — never a path, so nothing outside the folder is reachable.
 */
export function soundName(value: unknown): string | null {
  const name = String(value ?? '').trim();
  if (!/^[\w\-. äöüÄÖÜß]{1,80}$/.test(name) || name.startsWith('.')) return null;
  return SOUND_TYPES.includes(path.extname(name).toLowerCase()) ? name : null;
}

/**
 * The name an uploaded file is kept under: its own, with whatever a file name
 * here may not hold — brackets, ampersands, quotes — turned into a dash. A
 * path is still refused, not tidied.
 */
export function uploadName(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (/[\\/]/.test(raw)) return null;
  return soundName(raw.replace(/[^\w\-. äöüÄÖÜß]/g, '-').slice(-80));
}

export function listSounds(): string[] {
  try {
    return fs.readdirSync(ALERT_SOUND_DIR).filter((file) => soundName(file) !== null).sort((a, b) => a.localeCompare(b, 'de'));
  } catch {
    return [];
  }
}

function stored(): Partial<Record<AlertSlot, Partial<AlertSetting>>> {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(SETTINGS_KEY) as { value: string } | undefined;
  if (!row?.value) return {};
  try {
    const parsed = JSON.parse(row.value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** Every slot, with what the streamer set laid over what a new install says. */
export function getAlertSettings(): Record<AlertSlot, AlertSetting> {
  const own = stored();
  const sounds = listSounds();
  const settings = {} as Record<AlertSlot, AlertSetting>;
  for (const [slot, info] of Object.entries(ALERT_SLOTS) as [AlertSlot, SlotInfo][]) {
    const set = own[slot] ?? {};
    settings[slot] = {
      label: set.label || info.label,
      text: set.text || info.text,
      // A file deleted by hand leaves a silent alert, not a broken one.
      sound: set.sound && sounds.includes(set.sound) ? set.sound : null,
      volume: typeof set.volume === 'number' ? set.volume : DEFAULT_VOLUME,
      enabled: set.enabled !== false,
    };
  }
  return settings;
}

/**
 * Takes what the settings page sends — any slots, any of their fields. An
 * empty label or text goes back to the built-in one. Throws on what it
 * cannot keep, and then keeps nothing.
 */
export function saveAlertSettings(input: unknown): void {
  if (!input || typeof input !== 'object') throw new Error('object of alert settings required');
  const own = stored();
  const sounds = listSounds();
  for (const [slot, value] of Object.entries(input as Record<string, unknown>)) {
    if (!isSlot(slot)) throw new Error(`unknown alert: ${slot}`);
    if (!value || typeof value !== 'object') throw new Error(`settings for ${slot} must be an object`);
    const { label, text, sound, volume, enabled } = value as Record<string, unknown>;
    const next: Partial<AlertSetting> = { ...own[slot] };
    if (label !== undefined) {
      const clean = String(label).trim();
      if (clean.length > MAX_LABEL) throw new Error(`label too long (max ${MAX_LABEL})`);
      if (clean) next.label = clean; else delete next.label;
    }
    if (text !== undefined) {
      const clean = String(text).replace(/\s+/g, ' ').trim();
      if (clean.length > MAX_TEXT) throw new Error(`text too long (max ${MAX_TEXT})`);
      if (clean) next.text = clean; else delete next.text;
    }
    if (sound !== undefined) {
      if (sound === null || sound === '') next.sound = null;
      else if (typeof sound === 'string' && sounds.includes(sound)) next.sound = sound;
      else throw new Error(`unknown sound: ${String(sound)}`);
    }
    if (volume !== undefined) {
      const n = Number(volume);
      if (!Number.isFinite(n) || n < 0 || n > 1) throw new Error('volume must be between 0 and 1');
      next.volume = n;
    }
    if (enabled !== undefined) {
      if (typeof enabled !== 'boolean') throw new Error('enabled must be true or false');
      if (enabled) delete next.enabled; else next.enabled = false;
    }
    own[slot] = next;
  }
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(SETTINGS_KEY, JSON.stringify(own));
}

/** Removes a sound file and with it every alert's claim on it. */
export function deleteSound(name: string): boolean {
  const file = soundName(name);
  if (!file || !listSounds().includes(file)) return false;
  fs.unlinkSync(path.join(ALERT_SOUND_DIR, file));
  return true;
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

/**
 * Fills `{monate}` and its kind; a placeholder the slot doesn't know stays as
 * written. `{monate*5}` (also + - /) reckons with the number and leaves the
 * bare result — "35", no unit — for the streamer to name what it counts.
 * `{monate*4.99}` keeps two places: "34,93".
 */
function fill(text: string, values: Record<string, string>): string {
  return text.replace(/\{(\w+)(?:\s*([*+\-/])\s*(\d+(?:[.,]\d+)?))?\}/g, (whole, key: string, op?: string, operand?: string) => {
    const value = values[key];
    if (value === undefined) return whole;
    if (!op) return value;
    const n = parseInt(value, 10);
    const by = Number(String(operand).replace(',', '.'));
    if (!Number.isFinite(n) || (op === '/' && by === 0)) return whole;
    const result = op === '*' ? n * by : op === '+' ? n + by : op === '-' ? n - by : n / by;
    // A whole number stays whole; reckoning with 4.99 is money, so two places and a comma.
    return /[.,]/.test(String(operand)) ? result.toFixed(2).replace('.', ',') : String(Math.round(result));
  });
}

export function buildAlert(kind: AlertKind, data: Record<string, unknown>): Alert {
  const who = name(data.user);
  const settings = getAlertSettings();
  const make = (slot: AlertSlot, values: Record<string, string>, message?: string): Alert => {
    const set = settings[slot];
    const alert: Alert = { kind, label: set.label, who, text: fill(set.text, values) };
    if (message) alert.message = message;
    if (set.sound) alert.sound = { url: `/public/alert-sound/${encodeURIComponent(set.sound)}`, volume: set.volume };
    return alert;
  };
  switch (kind) {
    case 'follow':
      return make('follow', {});
    case 'sub':
      return make('sub', {}, said(data.message));
    case 'resub':
      return make('resub', { monate: plural(count(data.months), 'Monat', 'Monate') }, said(data.message));
    case 'subgift':
      return data.recipient
        ? make('subgift', { empfaenger: name(data.recipient) })
        : make('subgift_many', { abos: plural(count(data.count), 'Abo', 'Abos') });
    case 'raid':
      return make('raid', { zuschauer: plural(count(data.viewers), 'Zuschauer', 'Zuschauer') });
    case 'cheer':
      return make('cheer', { bits: plural(count(data.bits), 'Bit', 'Bits') }, said(data.message));
  }
}

/** What a test of one slot looks like — made-up names, the streamer's wording. */
export function sampleAlert(slot: AlertSlot): Alert {
  switch (slot) {
    case 'follow': return buildAlert('follow', { user: 'Kartograph' });
    case 'sub': return buildAlert('sub', { user: 'Lesezeichen42', message: 'endlich dabei!' });
    case 'resub': return buildAlert('resub', { user: 'Tintenfass', months: 7, message: 'Beste Stunde der Woche.' });
    case 'subgift': return buildAlert('subgift', { user: 'Mondfalter', recipient: 'Kartograph' });
    case 'subgift_many': return buildAlert('subgift', { user: 'Mondfalter', count: 5 });
    case 'raid': return buildAlert('raid', { user: 'Nachtgilde', viewers: 42 });
    case 'cheer': return buildAlert('cheer', { user: 'Tintenfass', bits: 500, message: 'Für die Unterstadt!' });
  }
}

export { isSlot as isAlertSlot };

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

/** The slot an alert is set under: a gift to several has its own. */
export const slotOf = (kind: AlertKind, data: Record<string, unknown>): AlertSlot =>
  (kind === 'subgift' && !data.recipient ? 'subgift_many' : kind);

/**
 * Whether an occasion shows a Tafel: the feature "Alerts" is chosen and the
 * occasion is not switched off. Off means nothing reaches the overlay — a
 * source left in OBS stays empty.
 */
export function alertOn(slot: AlertSlot): boolean {
  return featureOn('alerts') && getAlertSettings()[slot].enabled;
}

/** Sends an alert to the overlay, unless it is switched off; then null. */
export function sendAlert(kind: AlertKind, data: Record<string, unknown>): Alert | null {
  if (!alertOn(slotOf(kind, data))) return null;
  const alert = buildAlert(kind, data);
  broadcast('alert', alert);
  return alert;
}

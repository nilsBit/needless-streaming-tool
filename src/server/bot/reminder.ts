import { getDb } from '../db/index';

/**
 * A line the bot says on its own every so often, so a newcomer learns where
 * to look without asking: "Neu hier? !welt erklärt die Welt …".
 *
 * It only speaks into a chat that is alive — somebody must have written
 * since the last time — so an empty room never fills with the bot's own
 * notices. Off until the streamer sets a number of minutes.
 */

export interface ReminderSettings {
  text: string;
  /** 0 = off. */
  minutes: number;
}

export const REMINDER_DEFAULT_TEXT = 'Neu hier? !welt erklärt die Welt, !story die Geschichte, !befehle den Rest.';
export const REMINDER_MAX_MINUTES = 240;
export const REMINDER_MAX_TEXT = 400;

export function getReminderSettings(): ReminderSettings {
  const get = (key: string) => (getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)?.value;
  const minutes = Number(get('reminder_minutes'));
  return {
    text: get('reminder_text')?.trim() || REMINDER_DEFAULT_TEXT,
    minutes: Number.isFinite(minutes) && minutes > 0 ? Math.min(Math.floor(minutes), REMINDER_MAX_MINUTES) : 0,
  };
}

/** Takes text and minutes as the app sends them; an empty text goes back to the built-in line. */
export function saveReminderSettings(input: { text?: unknown; minutes?: unknown }): ReminderSettings | { error: string } {
  const db = getDb();
  if (input.text !== undefined) {
    const text = String(input.text).replace(/\s+/g, ' ').trim();
    if (text.length > REMINDER_MAX_TEXT) return { error: `text too long (max ${REMINDER_MAX_TEXT})` };
    if (text) db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('reminder_text', text);
    else db.prepare('DELETE FROM settings WHERE key = ?').run('reminder_text');
  }
  if (input.minutes !== undefined) {
    const minutes = Number(input.minutes);
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > REMINDER_MAX_MINUTES) return { error: `minutes must be a whole number between 0 and ${REMINDER_MAX_MINUTES}` };
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('reminder_minutes', String(minutes));
  }
  return getReminderSettings();
}

/**
 * Keeps the clock: when chat last spoke and when the bot last reminded.
 * `due()` is asked every so often and says whether it is time.
 */
export function createReminder(now: () => number = Date.now) {
  const start = now();
  let lastChat = 0;
  let lastReminder = start;
  return {
    /** Somebody (not the bot) wrote in chat. */
    noteChat() { lastChat = now(); },
    /** Time to speak: the interval has passed and chat was alive since the last reminder. */
    due(minutes: number): boolean {
      if (minutes <= 0) return false;
      const t = now();
      return t - lastReminder >= minutes * 60_000 && lastChat > lastReminder;
    },
    /** The bot spoke — count from here. */
    sent() { lastReminder = now(); },
  };
}

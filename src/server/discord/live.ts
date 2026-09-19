import { getDb } from '../db/index';

/**
 * Tells a Discord channel that the stream just went live.
 *
 * One message per stream: a stream that drops and comes back, or an app
 * restart mid-stream, must not ping the whole server again. The cooldown
 * starts only once Discord has accepted the message, so a failed attempt does
 * not swallow the next one.
 *
 * Posts through a webhook — no bot, no hosted service, nothing that could
 * start charging later.
 */

export const LIVE_COOLDOWN_MS = 30 * 60 * 1000;

export const DEFAULT_LIVE_MESSAGE = '🔴 **Jetzt live!** Worldbuilding an der Verborgenen Stadt — https://twitch.tv/{channel}';

const WEBHOOK_KEY = 'discord_live_webhook';
const MESSAGE_KEY = 'discord_live_message';
const LAST_KEY = 'discord_live_last';

/** What a Discord webhook URL looks like. Checked before it is stored. */
export const DISCORD_WEBHOOK_URL =
  /^https:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/api(?:\/v\d+)?\/webhooks\/\d+\/[\w-]+$/;

function setting(key: string): string | undefined {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value || undefined;
}

function store(key: string, value: string): void {
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

/** The Twitch channel from the bot config, read without touching the token. */
function twitchChannel(): string {
  try {
    const config = JSON.parse(setting('twitch_config') ?? '{}') as { channel?: string };
    return config.channel ?? '';
  } catch {
    return '';
  }
}

export interface LiveSettings {
  configured: boolean;
  message: string;
}

/** The settings as the UI may see them — the webhook URL is a secret and stays here. */
export function getLiveSettings(): LiveSettings {
  return { configured: setting(WEBHOOK_KEY) !== undefined, message: setting(MESSAGE_KEY) ?? DEFAULT_LIVE_MESSAGE };
}

/**
 * Stores what the UI sent. An empty URL removes the webhook; a URL that is not
 * a Discord webhook is refused, so a typo shows up now and not on stream day.
 */
export function saveLiveSettings(input: { webhook_url?: string; message?: string }): void {
  if (input.webhook_url !== undefined) {
    const url = input.webhook_url.trim();
    if (url === '') {
      getDb().prepare('DELETE FROM settings WHERE key = ?').run(WEBHOOK_KEY);
    } else if (!DISCORD_WEBHOOK_URL.test(url)) {
      throw new Error('That is not a Discord webhook URL (https://discord.com/api/webhooks/…).');
    } else {
      store(WEBHOOK_KEY, url);
    }
  }
  if (input.message !== undefined) store(MESSAGE_KEY, input.message);
}

/**
 * Posts the live message unless it was posted recently.
 *
 * @param now for the cooldown; passed in so the tests need no clock.
 * @returns `off` without a webhook, `recent` inside the cooldown, `failed`
 *   when Discord refused — never throws, a stream must not stop over this.
 */
export async function announceLive(now = Date.now()): Promise<'sent' | 'recent' | 'off' | 'failed'> {
  const url = setting(WEBHOOK_KEY);
  if (url === undefined) return 'off';

  const last = Number(setting(LAST_KEY) ?? 0);
  if (last > 0 && now - last < LIVE_COOLDOWN_MS) return 'recent';

  const content = (setting(MESSAGE_KEY) ?? DEFAULT_LIVE_MESSAGE).replaceAll('{channel}', twitchChannel());
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Role pings work (for an opt-in "Stream-Ping" role); @everyone never does.
      body: JSON.stringify({ content, allowed_mentions: { parse: ['roles'] } }),
    });
    if (!res.ok) {
      console.warn(`[Discord] Live announcement refused: HTTP ${res.status}`);
      return 'failed';
    }
  } catch (err) {
    // The error text contains the URL — log the kind only.
    console.warn('[Discord] Live announcement failed:', err instanceof Error ? err.name : 'unknown');
    return 'failed';
  }

  store(LAST_KEY, String(now));
  console.log('[Discord] Live announcement sent');
  return 'sent';
}

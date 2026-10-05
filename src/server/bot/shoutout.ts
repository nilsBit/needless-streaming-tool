import { getDb } from '../db/index';
import { getBotConfig } from './config';
import { getClientId } from '../twitch-config';

/**
 * `!so <Name>`: points chat at another channel — who, what they streamed last,
 * where to find them. Mods type it; a raid sends it on its own unless the
 * streamer switched that off (`raid_shoutout` = '0').
 *
 * The category is a courtesy: when Twitch can't be asked, the line goes out
 * without it rather than not at all.
 */

/** A GET against the Helix API, answering its JSON — or null when Twitch can't be reached. */
export type Helix = (path: string) => Promise<{ data?: Array<Record<string, string>> } | null>;

const LOGIN_PATTERN = /^[a-z0-9_]{1,25}$/;
const USAGE = '📣 !so <Name> — empfiehlt einen Kanal.';

export async function shoutoutText(raw: string, helix: Helix): Promise<string> {
  const typed = raw.trim().replace(/^@/, '');
  if (!typed) return USAGE;
  const login = typed.toLowerCase();
  const unknown = `❓ Den Kanal „${typed.slice(0, 40)}“ gibt es auf Twitch nicht.`;
  if (!LOGIN_PATTERN.test(login)) return unknown;

  const users = await helix(`users?login=${login}`);
  if (!users) return `📣 Schaut bei ${typed} vorbei: twitch.tv/${login}`;
  const user = users.data?.[0];
  if (!user) return unknown;

  const name = user.display_name || typed;
  const channel = await helix(`channels?broadcaster_id=${encodeURIComponent(user.id)}`);
  const game = channel?.data?.[0]?.game_name;
  return game
    ? `📣 Schaut bei ${name} vorbei — zuletzt in „${game}“: twitch.tv/${user.login || login}`
    : `📣 Schaut bei ${name} vorbei: twitch.tv/${user.login || login}`;
}

/** Helix with the bot's own token, or null when Twitch isn't connected. */
export function botHelix(): Helix | null {
  const config = getBotConfig();
  if (!config?.oauth_token) return null;
  const token = config.oauth_token.replace('oauth:', '');
  return async (path) => {
    try {
      const res = await fetch(`https://api.twitch.tv/helix/${path}`, {
        headers: { Authorization: `Bearer ${token}`, 'Client-Id': getClientId() },
      });
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    }
  };
}

export function raidShoutoutEnabled(): boolean {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get('raid_shoutout') as { value: string } | undefined;
  return row?.value !== '0';
}

import { getBotConfig } from './bot/config';
import { getClientId } from './twitch-config';

/**
 * Helix with the bot's own token — reading and writing. Tests point it at a
 * stub through NST_HELIX_URL; only a loopback address is taken from there,
 * so the token can never be sent anywhere but Twitch or this machine.
 */
const HELIX = 'https://api.twitch.tv/helix';
const LOOPBACK = /^http:\/\/127\.0\.0\.1:\d{1,5}$/;

export function helixBase(): string {
  const override = process.env.NST_HELIX_URL;
  return override && LOOPBACK.test(override) ? override : HELIX;
}

export interface HelixReply {
  status: number;
  // Helix answers JSON with a `data` list, or an error with a `message`.
  body: { data?: Array<Record<string, unknown>>; message?: string } | null;
}

/** One Helix call. Null when Twitch is not connected or cannot be reached. */
export async function helixRequest(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<HelixReply | null> {
  const config = getBotConfig();
  if (!config?.oauth_token) return null;
  const token = config.oauth_token.replace('oauth:', '');
  try {
    const res = await fetch(`${helixBase()}/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Client-Id': getClientId(),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let parsed: HelixReply['body'] = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
    return { status: res.status, body: parsed };
  } catch {
    return null;
  }
}

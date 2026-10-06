import crypto from 'crypto';
import { Router } from 'express';
import { shell } from 'electron';
import { getBotConfig, saveBotConfig } from '../bot/config';
import { connectBot } from '../bot/index';
import { broadcast } from '../websocket/index';
import { getClientId } from '../twitch-config';

const router = Router();

const TWITCH_SCOPES = [
  'chat:read',
  'chat:edit',
  'channel:read:redemptions',
  'bits:read',
  // Follows exist only in EventSub, and only for a moderator of the channel.
  // A token from before this line has to be renewed once — the follow
  // subscription says so in the log when it is refused.
  'moderator:read:followers',
].join('+');

// A login the tool itself started carries a one-time `state`. Twitch hands it
// back in the fragment; the callback page sends it along, and /save accepts a
// token only with a state it issued and has not seen used. Without this, a
// link with a foreign #access_token could make the bot run as a stranger.
const STATE_TTL_MS = 10 * 60_000;
const pendingStates = new Map<string, number>();

function issueState(): string {
  const now = Date.now();
  for (const [state, expires] of pendingStates) if (expires < now) pendingStates.delete(state);
  const state = crypto.randomBytes(16).toString('hex');
  pendingStates.set(state, now + STATE_TTL_MS);
  return state;
}

/** True once, for a state this process issued within the last ten minutes. */
export function consumeState(state: unknown): boolean {
  if (typeof state !== 'string' || !/^[0-9a-f]{32}$/.test(state)) return false;
  const expires = pendingStates.get(state);
  pendingStates.delete(state);
  return expires !== undefined && expires >= Date.now();
}

function buildAuthUrl(host: string): string {
  const clientId = getClientId();
  const redirectUri = `http://${host}/auth/twitch/callback`;
  return `https://id.twitch.tv/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=${TWITCH_SCOPES}&state=${issueState()}`;
}

// GET — generate Twitch OAuth URL
router.get('/twitch/url', (req, res) => {
  res.json({ url: buildAuthUrl(req.headers.host as string) });
});

// POST — open Twitch auth in system browser
router.post('/twitch/open', (req, res) => {
  shell.openExternal(buildAuthUrl(req.headers.host as string));
  res.json({ success: true });
});

// GET — OAuth callback page (Twitch redirects here with token in hash)
router.get('/twitch/callback', (_req, res) => {
  // Twitch sends token in URL fragment (#access_token=xxx)
  // Fragments are not sent to the server, so we need a page that extracts it client-side
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'">
      <title>Twitch Auth</title>
      <style>
        body { background: #0d0d0d; color: #e0e0e0; font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; }
        .card { text-align: center; padding: 40px; background: #1a1a1a; border-radius: 12px; border: 1px solid #2a2a2a; }
        h1 { font-size: 24px; margin-bottom: 8px; }
        p { color: #888; font-size: 14px; }
        .success { color: #2ecc71; }
        .error { color: #e74c3c; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1 id="title">Verbinde mit Twitch...</h1>
        <p id="message">Bitte warten...</p>
      </div>
      <script>
        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash);
        const accessToken = params.get('access_token');
        const state = params.get('state');

        if (accessToken && state) {
          fetch('/api/auth/twitch/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ access_token: accessToken, state })
          })
          .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
          .then(data => {
            document.getElementById('title').textContent = '✅ Verbunden!';
            document.getElementById('title').className = 'success';
            document.getElementById('message').textContent = 'Verbunden mit ' + data.channel + '. Du kannst dieses Fenster schließen.';
            setTimeout(() => window.close(), 2000);
          })
          .catch(() => {
            document.getElementById('title').textContent = '❌ Fehler';
            document.getElementById('title').className = 'error';
            document.getElementById('message').textContent = 'Die Anmeldung wurde nicht von diesem Tool gestartet oder ist abgelaufen. Bitte in den Einstellungen neu anmelden.';
          });
        } else {
          document.getElementById('title').textContent = '❌ Fehler';
          document.getElementById('title').className = 'error';
          document.getElementById('message').textContent = 'Kein Token erhalten. Bitte in den Einstellungen neu anmelden.';
        }
      </script>
    </body>
    </html>
  `);
});

// POST — save token from callback page
router.post('/twitch/save', async (req, res) => {
  const { access_token, state } = (req.body ?? {}) as { access_token?: unknown; state?: unknown };
  // Only a login this tool started may change whose account the bot runs as.
  if (!consumeState(state)) {
    res.status(403).json({ error: 'state_invalid', message: 'Diese Anmeldung wurde nicht von diesem Tool gestartet oder ist abgelaufen.' });
    return;
  }
  if (typeof access_token !== 'string' || !access_token) {
    res.status(400).json({ error: 'access_token required' });
    return;
  }

  // Fetch user info from Twitch to get username and channel
  try {
    const clientId = getClientId();
    const response = await fetch('https://api.twitch.tv/helix/users', {
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Client-Id': clientId,
      },
    });

    if (!response.ok) throw new Error(`Twitch API error: ${response.status}`);

    const data = await response.json();
    const user = data.data?.[0];

    if (!user) throw new Error('No user data returned');

    const channel = user.login;
    const username = user.login;

    // Save config with encrypted token
    saveBotConfig({
      channel,
      username,
      oauth_token: `oauth:${access_token}`,
    });

    // Auto-connect bot
    try {
      await connectBot();
    } catch {}

    broadcast('bot-status', { connected: true, channel });

    res.json({ success: true, channel, username: user.display_name });
  } catch (err) {
    console.error('[Auth] Twitch token could not be validated:', err);
    res.status(500).json({ error: 'Failed to validate token' });
  }
});


// GET — fetch custom Channel Point rewards from Twitch
router.get('/twitch/rewards', async (_req, res) => {
  const config = getBotConfig();
  if (!config) {
    res.json({ rewards: [] });
    return;
  }

  const token = config.oauth_token.replace(/^oauth:/, '');
  const clientId = getClientId();

  try {
    // Get broadcaster user ID
    const userRes = await fetch('https://api.twitch.tv/helix/users', {
      headers: { 'Authorization': `Bearer ${token}`, 'Client-Id': clientId },
    });
    if (!userRes.ok) throw new Error(`Users API: ${userRes.status}`);
    const userData = await userRes.json();
    const userId = userData.data?.[0]?.id;
    if (!userId) throw new Error('No user ID');

    // Get custom rewards
    const rewardsRes = await fetch(`https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=${userId}`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Client-Id': clientId },
    });
    if (!rewardsRes.ok) throw new Error(`Rewards API: ${rewardsRes.status}`);
    const rewardsData = await rewardsRes.json();

    const rewards = (rewardsData.data || []).map((r: { id: string; title: string }) => ({
      id: r.id,
      title: r.title,
    }));

    res.json({ rewards });
  } catch (err) {
    console.error('[Auth] Failed to fetch rewards:', err);
    res.json({ rewards: [] });
  }
});

export default router;

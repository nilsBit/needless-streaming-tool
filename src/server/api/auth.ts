import { Router } from 'express';
import { shell } from 'electron';
import { getDb } from '../db/index';
import { saveBotConfig } from '../bot/config';
import { connectBot } from '../bot/index';
import { broadcast } from '../websocket/index';

const router = Router();

const TWITCH_SCOPES = [
  'chat:read',
  'chat:edit',
  'channel:read:redemptions',
  'bits:read',
].join('+');

function getClientId(): string | null {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get('twitch_client_id') as { value: string } | undefined;
  return row?.value || null;
}

// GET — generate Twitch OAuth URL
router.get('/twitch/url', (_req, res) => {
  const clientId = getClientId();
  if (!clientId) {
    res.status(400).json({ error: 'Client ID not configured. Set it in Settings first.' });
    return;
  }

  const redirectUri = 'http://localhost:4000/auth/twitch/callback';
  const url = `https://id.twitch.tv/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=${TWITCH_SCOPES}`;

  res.json({ url });
});

// POST — open Twitch auth in system browser
router.post('/twitch/open', (_req, res) => {
  const clientId = getClientId();
  if (!clientId) {
    res.status(400).json({ success: false, error: 'Client ID not configured' });
    return;
  }

  const redirectUri = 'http://localhost:4000/auth/twitch/callback';
  const url = `https://id.twitch.tv/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=${TWITCH_SCOPES}`;

  shell.openExternal(url);
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

        if (accessToken) {
          fetch('/api/auth/twitch/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ access_token: accessToken })
          })
          .then(r => r.json())
          .then(data => {
            document.getElementById('title').textContent = '✅ Verbunden!';
            document.getElementById('title').className = 'success';
            document.getElementById('message').textContent = 'Verbunden mit ' + data.channel + '. Du kannst dieses Fenster schließen.';
            setTimeout(() => window.close(), 2000);
          })
          .catch(() => {
            document.getElementById('title').textContent = '❌ Fehler';
            document.getElementById('title').className = 'error';
            document.getElementById('message').textContent = 'Token konnte nicht gespeichert werden.';
          });
        } else {
          document.getElementById('title').textContent = '❌ Fehler';
          document.getElementById('title').className = 'error';
          document.getElementById('message').textContent = 'Kein Token erhalten. Bitte erneut versuchen.';
        }
      </script>
    </body>
    </html>
  `);
});

// POST — save token from callback page
router.post('/twitch/save', async (req, res) => {
  const { access_token } = req.body;
  if (!access_token) {
    res.status(400).json({ error: 'access_token required' });
    return;
  }

  // Fetch user info from Twitch to get username and channel
  try {
    const clientId = getClientId();
    const response = await fetch('https://api.twitch.tv/helix/users', {
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Client-Id': clientId || '',
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
    res.status(500).json({ error: 'Failed to validate token', details: String(err) });
  }
});

// POST — save client ID
router.post('/twitch/client-id', (req, res) => {
  const { client_id } = req.body;
  if (!client_id) {
    res.status(400).json({ error: 'client_id required' });
    return;
  }

  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('twitch_client_id', client_id);
  res.json({ success: true });
});

// GET — get client ID (masked)
router.get('/twitch/client-id', (_req, res) => {
  const clientId = getClientId();
  res.json({
    configured: !!clientId,
    client_id_preview: clientId ? clientId.substring(0, 6) + '...' : null,
  });
});

export default router;

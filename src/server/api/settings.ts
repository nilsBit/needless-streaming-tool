import { Router } from 'express';
import { getBotConfig, saveBotConfig } from '../bot/config';
import { connectBot, disconnectBot, getBotStatus } from '../bot/index';
import { BotConfig } from '../../shared/types';
import { getFixedToken } from '../auth-token';
import { getDb } from '../db/index';

const router = Router();

router.get('/twitch', (_req, res) => {
  const config = getBotConfig();
  if (!config) {
    res.json({ configured: false });
    return;
  }
  res.json({
    configured: true,
    channel: config.channel,
    username: config.username,
    has_token: !!config.oauth_token,
  });
});

router.post('/twitch', (req, res) => {
  const { channel, username, oauth_token } = req.body as BotConfig;
  if (!channel || !username || !oauth_token) {
    res.status(400).json({ error: 'channel, username and oauth_token required' });
    return;
  }
  saveBotConfig({ channel, username, oauth_token });
  res.json({ success: true });
});

router.get('/bot-status', (_req, res) => {
  res.json(getBotStatus());
});

router.post('/bot/connect', async (_req, res) => {
  try {
    const success = await connectBot();
    res.json({ connected: success });
  } catch (err) {
    res.status(500).json({ error: 'Bot connection failed', details: String(err) });
  }
});

router.post('/bot/disconnect', async (_req, res) => {
  try {
    await disconnectBot();
    res.json({ connected: false });
  } catch (err) {
    res.status(500).json({ error: 'Bot disconnect failed', details: String(err) });
  }
});

// Notion token
router.get('/notion', (_req, res) => {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get('notion_token') as { value: string } | undefined;
  res.json({ configured: !!row?.value, preview: row?.value ? row.value.substring(0, 8) + '...' : null });
});

router.post('/notion', (req, res) => {
  const { token } = req.body;
  if (token === undefined) { res.status(400).json({ error: 'token required' }); return; }
  if (token) {
    getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('notion_token', token);
  } else {
    getDb().prepare('DELETE FROM settings WHERE key = ?').run('notion_token');
  }
  res.json({ success: true });
});

// Notion Clips Database ID
router.get('/notion/database', (_req, res) => {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get('notion_clips_db') as { value: string } | undefined;
  res.json({ configured: !!row?.value, database_id: row?.value || null });
});

router.post('/notion/database', (req, res) => {
  const { database_id } = req.body;
  if (database_id === undefined) { res.status(400).json({ error: 'database_id required' }); return; }
  if (database_id) {
    // Clean up: accept full Notion URLs or just the ID
    const cleanId = database_id.replace(/[-]/g, '').replace(/.*\/([a-f0-9]{32}).*/, '$1');
    getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('notion_clips_db', cleanId);
  } else {
    getDb().prepare('DELETE FROM settings WHERE key = ?').run('notion_clips_db');
  }
  res.json({ success: true });
});

// Fixed API token for Stream Deck
router.get('/api-token', (_req, res) => {
  const token = getFixedToken();
  res.json({ token: token || null });
});

export default router;

import { Router } from 'express';
import { getBotConfig, saveBotConfig } from '../bot/config';
import { connectBot, disconnectBot, getBotStatus } from '../bot/index';
import { BotConfig } from '../../shared/types';
import { getFixedToken } from '../auth-token';

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

// Fixed API token for Stream Deck
router.get('/api-token', (_req, res) => {
  const token = getFixedToken();
  res.json({ token: token || null });
});

export default router;

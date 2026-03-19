import { Router } from 'express';
import { getBotConfig, saveBotConfig, BotConfig } from '../bot/config';
import { connectBot, disconnectBot, getBotStatus } from '../bot/index';

const router = Router();

// GET twitch config (ohne Token)
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

// POST save twitch config
router.post('/twitch', (req, res) => {
  const { channel, username, oauth_token } = req.body as BotConfig;
  if (!channel || !username || !oauth_token) {
    res.status(400).json({ error: 'channel, username and oauth_token required' });
    return;
  }
  saveBotConfig({ channel, username, oauth_token });
  res.json({ success: true });
});

// GET bot status
router.get('/bot-status', (_req, res) => {
  res.json(getBotStatus());
});

// POST connect bot
router.post('/bot/connect', async (_req, res) => {
  const success = await connectBot();
  res.json({ connected: success });
});

// POST disconnect bot
router.post('/bot/disconnect', async (_req, res) => {
  await disconnectBot();
  res.json({ connected: false });
});

export default router;

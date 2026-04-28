import express from 'express';
import http from 'http';
import path from 'path';
import { initWebSocket } from './websocket/index';
import { initDatabase } from './db/index';
import { generateApiToken, validateApiToken, getApiToken } from './auth-token';
import { writeConnectionFile, deleteConnectionFile } from './connection-file';
import streamStateRouter from './api/stream-state';
import issuesRouter from './api/issues';
import rewardsRouter from './api/rewards';
import designsRouter from './api/designs';
import settingsRouter from './api/settings';
import actionsRouter from './api/actions';
import authRouter from './api/auth';
import votingRouter from './api/voting';
import progressRouter from './api/progress';
import clipsRouter from './api/clips';
import clipTagsRouter from './api/clip-tags';
import milestonesRouter from './api/milestones';
import obsRouter from './api/obs';
import customOverlaysRouter from './api/custom-overlays';
import statsRouter from './api/stats';
import rewardStatsRouter from './api/reward-stats';
import backupRouter from './api/backup';
import overlayConfigRouter, { getOverlayConfig } from './api/overlay-config';
import songRequestsRouter, { getActiveQueue } from './api/song-requests';
import { connectBot } from './bot/index';
import { connectObs } from './obs/index';
import { initAutoClips } from './auto-clips';
import { initRewardLeaderboard, getTopRewards } from './reward-leaderboard';
import { checkDatabase, healDatabase } from './api/notion-sync';
import { startSMTC, getAutoDetectSetting } from './integrations/smtc';
import { getDb } from './db/index';
import { rateLimit, publicRateLimit } from './middleware/rate-limit';
import { getUserDataPath } from './paths';

const parsedPort = parseInt(process.env.NST_PORT || '4000', 10);
if (isNaN(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
  throw new Error(`Invalid NST_PORT: ${process.env.NST_PORT}`);
}
export const PORT = parsedPort;
const HOST = process.env.NST_HOST || '127.0.0.1';

export async function startServer(): Promise<{ token: string; port: number }> {
  initDatabase();
  const token = generateApiToken();

  const app = express();

  // CORS — muss VOR allen anderen Middleware kommen
  app.use((req, res, next) => {
    const origin = req.headers.origin || '';
    const allowed = !origin || origin.startsWith('http://localhost:') || origin.startsWith('file://') ||
      (HOST === '0.0.0.0' && /^https?:\/\/\d+\.\d+\.\d+\.\d+/.test(origin));
    if (allowed) {
      res.header('Access-Control-Allow-Origin', origin || '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
    next();
  });

  app.use(express.json({ limit: '100kb' }));
  app.use(rateLimit);

  // CSP für Overlays — dynamic based on request host
  app.use('/overlay', (req, res, next) => {
    const host = req.headers.host || `localhost:${PORT}`;
    res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' https://i.scdn.co data:; connect-src ws://${host} http://${host} wss://${host} https://${host}`);
    next();
  });

  // Auth middleware — schützt /api/* Routen
  // Ausgenommen: /api/health, /api/auth/twitch/callback, /api/auth/twitch/save, /overlay/*
  app.use('/api', (req, res, next) => {
    // Callback und Save sind vom OAuth-Browser aufgerufen — kein Token
    if (req.path.startsWith('/auth/twitch/callback') || req.path.startsWith('/auth/twitch/save')) {
      next();
      return;
    }

    const authHeader = req.headers.authorization;
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    const queryToken = req.query.token as string | undefined;

    if (!validateApiToken(bearerToken || queryToken)) {
      res.status(401).json({ error: 'Unauthorized — invalid API token' });
      return;
    }
    next();
  });

  // Health check (hinter Auth — braucht Token)
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Token endpoint — nur für Overlays die das Token brauchen
  // Overlays holen sich das Token über query param bei der WebSocket-Verbindung
  app.get('/api/token', (_req, res) => {
    res.json({ token: getApiToken() });
  });

  // API routes
  app.use('/api/stream-state', streamStateRouter);
  app.use('/api/issues', issuesRouter);
  app.use('/api/rewards', rewardsRouter);
  app.use('/api/designs', designsRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/actions', actionsRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/voting', votingRouter);
  app.use('/api/progress', progressRouter);
  app.use('/api/clips', clipsRouter);
  app.use('/api/clip-tags', clipTagsRouter);
  app.use('/api/milestones', milestonesRouter);
  app.use('/api/reward-stats', rewardStatsRouter);
  app.use('/api/obs', obsRouter);
  app.use('/api/overlays', customOverlaysRouter);
  app.use('/api/stats', statsRouter);
  app.use('/api/backup', backupRouter);
  app.use('/api/overlay-config', overlayConfigRouter);
  app.use('/api/song-requests', songRequestsRouter);

  // Twitch OAuth callback redirect (no auth needed)
  app.get('/auth/twitch/callback', (req, res) => res.redirect('/api/auth/twitch/callback'));

  // Public read-only endpoints for overlays (no auth needed, stricter rate limit)
  app.use('/public', publicRateLimit);
  app.get('/public/stream-state', (_req, res) => {
    const state = getDb().prepare('SELECT * FROM stream_state WHERE id = 1').get();
    res.json(state);
  });

  app.get('/public/issues', (_req, res) => {
    const issues = getDb().prepare('SELECT * FROM issues ORDER BY created_at DESC').all();
    res.json(issues);
  });

  app.get('/public/overlay-config', (_req, res) => {
    res.json(getOverlayConfig());
  });

  app.get('/public/song-queue', (_req, res) => {
    res.json(getActiveQueue());
  });

  app.get('/public/progress', (_req, res) => {
    const state = getDb().prepare('SELECT project_name FROM stream_state WHERE id = 1').get() as { project_name: string | null };
    const items = getDb().prepare('SELECT * FROM project_items ORDER BY sort_order ASC').all() as Array<Record<string, unknown>>;
    for (const item of items) {
      item.todos = getDb().prepare('SELECT * FROM todos WHERE parent_id = ? ORDER BY done ASC, sort_order ASC, created_at ASC').all(item.id as number);
    }
    res.json({ project_name: state?.project_name || null, items });
  });

  app.get('/public/reward-stats/top', (req, res) => {
    const type = (req.query.type as string) || 'all';
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 3, 1), 10);
    res.json({ type, leaderboard: getTopRewards(type, limit) });
  });

  // Overlay paths
  const builtinOverlayPath = path.join(process.cwd(), 'src', 'overlays');
  const overlayOverridePath = getUserDataPath('overlay-overrides');
  const customOverlayPath = getUserDataPath('custom-overlays');
  const fs = require('fs');
  fs.mkdirSync(overlayOverridePath, { recursive: true });
  fs.mkdirSync(customOverlayPath, { recursive: true });

  // Serve overlays: overrides first, then builtin, then custom
  app.use('/overlay/custom', express.static(customOverlayPath));
  app.use('/overlay', express.static(overlayOverridePath));
  app.use('/overlay', express.static(builtinOverlayPath));

  const server = http.createServer(app);
  initWebSocket(server);

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[Server] ${HOST}:${PORT} already in use. Close the other instance first.`);
    }
  });

  // Graceful shutdown — close server so port is freed before process exits
  function shutdown() {
    console.log('[Server] Shutting down...');
    deleteConnectionFile();
    server.close(() => {
      console.log('[Server] Closed');
      process.exit(0);
    });
    // Force exit after 2s if server doesn't close cleanly
    setTimeout(() => process.exit(0), 2000);
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  return new Promise((resolve) => {
    server.listen(PORT, HOST, () => {
      console.log(`[Server] Running on http://localhost:${PORT}`);

      // Write connection file for Stream Deck plugin auto-discovery
      writeConnectionFile(PORT);

      initRewardLeaderboard();
      connectBot().catch(() => {});
      connectObs().catch(() => {});

      // Init auto-clips after bot connects (needs a small delay for bot to be ready)
      setTimeout(() => initAutoClips(), 3000);

      if (getAutoDetectSetting()) startSMTC();

      // Auto-heal Notion schema: existing users get new rich_text columns added
      // silently on startup so sync keeps working after property additions.
      (async () => {
        const dbId = (getDb().prepare('SELECT value FROM settings WHERE key = ?').get('notion_clips_db') as { value: string } | undefined)?.value;
        if (!dbId) return;
        const check = await checkDatabase();
        if (check.ok) return;
        if (!('missing_properties' in check) || !check.missing_properties?.length) return;
        try {
          const result = await healDatabase(dbId);
          if (result.added.length > 0) console.log(`[Notion] Auto-healed schema: added ${result.added.join(', ')}`);
        } catch (err) {
          console.warn('[Notion] Auto-heal failed:', err instanceof Error ? err.message : err);
        }
      })();

      resolve({ token, port: PORT });
    });
  });
}

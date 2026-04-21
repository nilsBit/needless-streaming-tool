import express from 'express';
import http from 'http';
import path from 'path';
import { initWebSocket } from './websocket/index';
import { initDatabase } from './db/index';
import { generateApiToken, validateApiToken, getApiToken } from './auth-token';
import streamStateRouter from './api/stream-state';
import issuesRouter from './api/issues';
import rewardsRouter from './api/rewards';
import designsRouter from './api/designs';
import settingsRouter from './api/settings';
import actionsRouter from './api/actions';
import authRouter from './api/auth';
import votingRouter from './api/voting';
import raidsRouter from './api/raids';
import progressRouter from './api/progress';
import clipsRouter from './api/clips';
import clipTagsRouter from './api/clip-tags';
import milestonesRouter from './api/milestones';
import obsRouter from './api/obs';
import customOverlaysRouter from './api/custom-overlays';
import statsRouter from './api/stats';
import backupRouter from './api/backup';
import overlayConfigRouter, { getOverlayConfig } from './api/overlay-config';
import songRequestsRouter from './api/song-requests';
import { connectBot } from './bot/index';
import { connectObs } from './obs/index';
import { initAutoClips } from './auto-clips';
import { startSMTC, getAutoDetectSetting } from './integrations/smtc';
import { getDb } from './db/index';
import { rateLimit } from './middleware/rate-limit';
import { getUserDataPath } from './paths';

const PORT = 4000;

export async function startServer(): Promise<string> {
  initDatabase();
  const token = generateApiToken();

  const app = express();

  // CORS — muss VOR allen anderen Middleware kommen
  app.use((req, res, next) => {
    const origin = req.headers.origin || '';
    if (!origin || origin.startsWith('http://localhost:') || origin.startsWith('file://')) {
      res.header('Access-Control-Allow-Origin', origin || '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
    next();
  });

  app.use(express.json({ limit: '100kb' }));
  app.use(rateLimit);

  // CSP für Overlays
  app.use('/overlay', (_req, res, next) => {
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src ws://localhost:4000 http://localhost:4000");
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
  app.use('/api/raids', raidsRouter);
  app.use('/api/progress', progressRouter);
  app.use('/api/clips', clipsRouter);
  app.use('/api/clip-tags', clipTagsRouter);
  app.use('/api/milestones', milestonesRouter);
  app.use('/api/obs', obsRouter);
  app.use('/api/overlays', customOverlaysRouter);
  app.use('/api/stats', statsRouter);
  app.use('/api/backup', backupRouter);
  app.use('/api/overlay-config', overlayConfigRouter);
  app.use('/api/song-requests', songRequestsRouter);

  // Twitch OAuth callback redirect (no auth needed)
  app.get('/auth/twitch/callback', (req, res) => res.redirect('/api/auth/twitch/callback'));

  // Public read-only endpoints for overlays (no auth needed)
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
    const rows = getDb().prepare(
      "SELECT * FROM song_requests WHERE status IN ('pending', 'playing') ORDER BY CASE status WHEN 'playing' THEN 0 ELSE 1 END, created_at ASC"
    ).all();
    res.json(rows);
  });

  app.get('/public/progress', (_req, res) => {
    const state = getDb().prepare('SELECT project_name FROM stream_state WHERE id = 1').get() as { project_name: string | null };
    const items = getDb().prepare('SELECT * FROM project_items ORDER BY sort_order ASC').all() as Array<Record<string, unknown>>;
    for (const item of items) {
      item.todos = getDb().prepare('SELECT * FROM todos WHERE parent_id = ? ORDER BY done ASC, sort_order ASC, created_at ASC').all(item.id as number);
    }
    res.json({ project_name: state?.project_name || null, items });
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
      console.error(`[Server] Port ${PORT} already in use. Close the other instance first.`);
    }
  });

  // Graceful shutdown — close server so port is freed before process exits
  function shutdown() {
    console.log('[Server] Shutting down...');
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
    server.listen(PORT, () => {
      console.log(`[Server] Running on http://localhost:${PORT}`);

      connectBot().catch(() => {});
      connectObs().catch(() => {});

      // Init auto-clips after bot connects (needs a small delay for bot to be ready)
      setTimeout(() => initAutoClips(), 3000);

      if (getAutoDetectSetting()) startSMTC();

      resolve(token);
    });
  });
}

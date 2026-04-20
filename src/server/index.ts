import express from 'express';
import http from 'http';
import path from 'path';
import { execSync } from 'child_process';
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
import todosRouter from './api/todos';
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
  app.use('/api/todos', todosRouter);
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

  app.get('/public/todos', (_req, res) => {
    const todos = getDb().prepare('SELECT * FROM todos ORDER BY done ASC, sort_order ASC, created_at DESC').all();
    res.json(todos);
  });

  app.get('/public/overlay-config', (_req, res) => {
    res.json(getOverlayConfig());
  });

  app.get('/public/progress', (_req, res) => {
    const state = getDb().prepare('SELECT project_name FROM stream_state WHERE id = 1').get() as { project_name: string | null };
    const items = getDb().prepare('SELECT * FROM project_items ORDER BY sort_order ASC').all();
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

  // Kill any stale process on our port before starting
  function killPortProcess() {
    try {
      if (process.platform === 'win32') {
        const out = execSync(`netstat -ano | findstr :${PORT} | findstr LISTENING`, { encoding: 'utf-8' });
        const pid = out.trim().split(/\s+/).pop();
        if (pid && pid !== String(process.pid)) {
          execSync(`taskkill /PID ${pid} /F`);
          console.log(`[Server] Killed stale process ${pid} on port ${PORT}`);
        }
      } else {
        const out = execSync(`lsof -ti:${PORT}`, { encoding: 'utf-8' }).trim();
        const pids = out.split('\n').filter(p => p && p !== String(process.pid));
        for (const pid of pids) {
          execSync(`kill -9 ${pid}`);
          console.log(`[Server] Killed stale process ${pid} on port ${PORT}`);
        }
      }
    } catch {
      // No process on port — good
    }
  }

  let retryCount = 0;
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE' && retryCount < 3) {
      retryCount++;
      console.log(`[Server] Port ${PORT} busy, killing stale process and retrying...`);
      killPortProcess();
      setTimeout(() => server.listen(PORT), 500);
    }
  });

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

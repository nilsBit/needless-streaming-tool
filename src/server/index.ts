import express from 'express';
import http from 'http';
import path from 'path';
import { initWebSocket } from './websocket/index';
import { initDatabase } from './db/index';
import streamStateRouter from './api/stream-state';
import bugsRouter from './api/bugs';
import raidsRouter from './api/raids';
import rewardsRouter from './api/rewards';
import designsRouter from './api/designs';
import settingsRouter from './api/settings';
import actionsRouter from './api/actions';
import { connectBot } from './bot/index';

const PORT = 4000;

export async function startServer(): Promise<void> {
  initDatabase();

  const app = express();
  app.use(express.json());

  // CORS — nur localhost erlauben (Electron + OBS Overlays)
  app.use((_req, res, next) => {
    const origin = _req.headers.origin || '';
    const allowed = [
      'http://localhost:5173',   // Vite Dev
      'http://localhost:4000',   // Overlays
      'file://',                 // Electron Production
    ];
    if (!origin || allowed.some((a) => origin.startsWith(a))) {
      res.header('Access-Control-Allow-Origin', origin || '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
    }
    if (_req.method === 'OPTIONS') { res.sendStatus(204); return; }
    next();
  });

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // API routes
  app.use('/api/stream-state', streamStateRouter);
  app.use('/api/bugs', bugsRouter);
  app.use('/api/raids', raidsRouter);
  app.use('/api/rewards', rewardsRouter);
  app.use('/api/designs', designsRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/actions', actionsRouter);

  // Static overlay files
  app.use('/overlay', express.static(path.join(__dirname, '../overlays')));

  const server = http.createServer(app);
  initWebSocket(server);

  return new Promise((resolve) => {
    server.listen(PORT, () => {
      console.log(`[Server] Running on http://localhost:${PORT}`);

      // Auto-connect bot if configured
      connectBot().catch(() => {});

      resolve();
    });
  });
}

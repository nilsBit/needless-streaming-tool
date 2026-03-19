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
import votingRouter from './api/voting';
import { connectBot } from './bot/index';

const PORT = 4000;

export async function startServer(): Promise<void> {
  initDatabase();

  const app = express();

  // CORS — muss VOR allen anderen Middleware kommen
  app.use((req, res, next) => {
    const origin = req.headers.origin || '';
    // Erlaube alle localhost origins (Vite dev kann auf verschiedenen Ports landen)
    if (!origin || origin.startsWith('http://localhost:') || origin.startsWith('file://')) {
      res.header('Access-Control-Allow-Origin', origin || '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
    }
    if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
    next();
  });

  app.use(express.json({ limit: '100kb' }));

  // CSP für Overlays
  app.use('/overlay', (_req, res, next) => {
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src ws://localhost:4000 http://localhost:4000");
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
  app.use('/api/voting', votingRouter);

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

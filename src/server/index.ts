import express from 'express';
import http from 'http';
import path from 'path';
import { initWebSocket } from './websocket/index';
import { initDatabase } from './db/index';
import streamStateRouter from './api/stream-state';
import bugsRouter from './api/bugs';
import raidsRouter from './api/raids';
import rewardsRouter from './api/rewards';
import settingsRouter from './api/settings';
import { connectBot } from './bot/index';

const PORT = 4000;

export async function startServer(): Promise<void> {
  initDatabase();

  const app = express();
  app.use(express.json());

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // API routes
  app.use('/api/stream-state', streamStateRouter);
  app.use('/api/bugs', bugsRouter);
  app.use('/api/raids', raidsRouter);
  app.use('/api/rewards', rewardsRouter);
  app.use('/api/settings', settingsRouter);

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

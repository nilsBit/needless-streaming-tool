import express from 'express';
import http from 'http';
import path from 'path';
import { initWebSocket } from './websocket/index';
import { initDatabase } from './db/index';
import { generateApiToken, validateApiToken, getApiToken } from './auth-token';
import streamStateRouter from './api/stream-state';
import bugsRouter from './api/bugs';
import raidsRouter from './api/raids';
import rewardsRouter from './api/rewards';
import designsRouter from './api/designs';
import settingsRouter from './api/settings';
import actionsRouter from './api/actions';
import authRouter from './api/auth';
import votingRouter from './api/voting';
import { connectBot } from './bot/index';

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

  // CSP für Overlays
  app.use('/overlay', (_req, res, next) => {
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src ws://localhost:4000 http://localhost:4000");
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
  app.use('/api/bugs', bugsRouter);
  app.use('/api/raids', raidsRouter);
  app.use('/api/rewards', rewardsRouter);
  app.use('/api/designs', designsRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/actions', actionsRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/voting', votingRouter);

  // Twitch OAuth callback redirect (no auth needed)
  app.get('/auth/twitch/callback', (req, res) => res.redirect('/api/auth/twitch/callback'));

  // Static overlay files (no auth needed — public)
  // In dev: serve from src/overlays, in production: from dist/overlays
  const overlayPath = path.join(process.cwd(), 'src', 'overlays');
  app.use('/overlay', express.static(overlayPath));

  const server = http.createServer(app);
  initWebSocket(server);

  return new Promise((resolve) => {
    server.listen(PORT, () => {
      console.log(`[Server] Running on http://localhost:${PORT}`);

      connectBot().catch(() => {});

      resolve(token);
    });
  });
}

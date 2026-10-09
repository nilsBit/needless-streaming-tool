import express from 'express';
import http from 'http';
import { initWebSocket, onBroadcast } from './websocket/index';
import { initDatabase } from './db/index';
import { generateApiToken, validateApiToken, validateDesignToken, getApiToken } from './auth-token';
import { writeConnectionFile, deleteConnectionFile } from './connection-file';
import streamStateRouter, { restoreTimerState } from './api/stream-state';
import issuesRouter from './api/issues';
import rewardsRouter from './api/rewards';
import designsRouter from './api/designs';
import settingsRouter from './api/settings';
import alertsRouter from './api/alerts';
import { currentPoll } from './bot/voting';
import { ALERT_SOUND_DIR } from './bot/alerts';
import actionsRouter, { currentSong, rouletteTitle } from './api/actions';
import authRouter from './api/auth';
import votingRouter from './api/voting';
import progressRouter from './api/progress';
import clipsRouter from './api/clips';
import setupRouter from './api/setup';
import { allowedOrigin } from './origins';
import { pruneViewerData } from './retention';
import milestonesRouter from './api/milestones';
import obsRouter from './api/obs';
import customOverlaysRouter from './api/custom-overlays';
import streamsRouter from './api/streams';
import rewardStatsRouter from './api/reward-stats';
import leaderboardsRouter from './api/leaderboards';
import pointsRouter from './api/points';
import questsRouter from './api/quests';
import { requestQuestCheck, setQuestRunner } from './quests/schedule';
import { evaluateQuests } from './quests/index';
import channelRewardsRouter from './api/channel-rewards';
import { watchTick } from './points/earn';
import { getPointsConfig } from './points/config';
import { botHelix } from './bot/shoutout';
import backupRouter from './api/backup';
import designRouter from './api/design';
import devRouter from './api/dev';
import overlayConfigRouter from './api/overlay-config';
import { publicOverlayConfig } from './design-apply';
import songRequestsRouter from './api/song-requests';
import charactersRouter from './api/characters';
import entriesRouter from './api/entries';
import { activeCard, activeCharacter, CHARACTER_IMAGE_DIR } from './api/active-entry';
import { startFollowing } from './api/follow';
import commandsRouter from './api/commands';
import textCommandsRouter from './api/text-commands';
import lookupCommandsRouter from './api/lookup-commands';
import chatRouter from './api/chat';
import readinessRouter from './api/readiness';
import { connectBot } from './bot/index';
import { connectObs } from './obs/index';
import { watchStreams } from './stream-report/watch';
import { initAutoClips } from './auto-clips';
import { initRewardLeaderboard, getTopRewards, boardTitle } from './reward-leaderboard';
import { startSMTC, getAutoDetectSetting, currentSongArt } from './integrations/smtc';
import { getDb } from './db/index';
import { rateLimit, publicRateLimit } from './middleware/rate-limit';
import { getBuiltinOverlaysDir, getUserDataPath } from './paths';
import { recentChat } from './bot/chat-feed';

const parsedPort = parseInt(process.env.NST_PORT || '4000', 10);
if (isNaN(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
  throw new Error(`Invalid NST_PORT: ${process.env.NST_PORT}`);
}
export const PORT = parsedPort;
const HOST = process.env.NST_HOST || '127.0.0.1';

/**
 * Builds the Express app: middleware and routes only — no listening socket, no
 * WebSocket, no Twitch/OBS/SMTC connections.
 *
 * This is the seam the HTTP tests drive. A test calls initDatabase(':memory:'),
 * then createApp(), then issues requests with supertest — no port is bound and
 * nothing external is contacted. Keep it that way: anything that opens a
 * connection or touches hardware belongs in startServer(), not here.
 */
export function createApp(): express.Express {
  const app = express();

  // CORS — muss VOR allen anderen Middleware kommen
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    // Exact origins only (see origins.ts): the app, our own server, the Vite
    // page in development, the Figma plugin on its routes. No other local
    // dev server may read /public/* through the browser.
    res.header('Vary', 'Origin');
    if (allowedOrigin(origin, { port: PORT, host: HOST, path: req.path })) {
      res.header('Access-Control-Allow-Origin', origin || '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    // Plain hardening for every response: no MIME sniffing, no referrer out, no framing of the API.
    res.header('X-Content-Type-Options', 'nosniff');
    res.header('Referrer-Policy', 'no-referrer');
    if (req.path.startsWith('/api/')) res.header('X-Frame-Options', 'DENY');
    if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
    next();
  });

  // Drafts posted to /api/design/inbox carry two PNGs of a whole overlay and
  // can exceed this limit; design.ts's own POST /inbox route parses that body
  // itself, behind auth, with a larger limit. The global parser must skip
  // that one path rather than consume (and reject) the stream first.
  const globalJson = express.json({ limit: '100kb' });
  app.use((req, res, next) => (req.path === '/api/design/inbox' ? next() : globalJson(req, res, next)));
  app.use(rateLimit);

  // CSP für Overlays — dynamic based on request host. Images: Spotify covers, Twitch emotes (chat).
  app.use('/overlay', (req, res, next) => {
    const host = req.headers.host || `localhost:${PORT}`;
    res.setHeader('Content-Security-Policy', `default-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' https://i.scdn.co https://static-cdn.jtvnw.net data:; connect-src ws://${host} http://${host} wss://${host} https://${host}`);
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

    // Header only: a token in the query string ends up in browser history,
    // shell history and OBS logs. (The WebSocket upgrade is the one exception.)
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    // The Figma plugin's token opens its own routes and nothing else.
    const designRoute = req.path.startsWith('/design/') && validateDesignToken(token);
    if (!designRoute && !validateApiToken(token)) {
      res.status(401).json({ error: 'Unauthorized — invalid API token' });
      return;
    }
    next();
  });

  // A change that went through may have finished a quest: ask for a check
  // (gathered, at most every 2 s — no polling).
  app.use('/api', (req, res, next) => {
    if (req.method !== 'GET') res.on('finish', () => { if (res.statusCode < 400) requestQuestCheck(); });
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
  app.use('/api/alerts', alertsRouter);
  app.use('/api/actions', actionsRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/voting', votingRouter);
  app.use('/api/progress', progressRouter);
  app.use('/api/clips', clipsRouter);
  app.use('/api/milestones', milestonesRouter);
  app.use('/api/reward-stats', rewardStatsRouter);
  app.use('/api/leaderboards', leaderboardsRouter);
  app.use('/api/points', pointsRouter);
  app.use('/api/quests', questsRouter);
  app.use('/api/channel-rewards', channelRewardsRouter);
  app.use('/api/obs', obsRouter);
  app.use('/api/overlays', customOverlaysRouter);
  app.use('/api/streams', streamsRouter);
  app.use('/api/backup', backupRouter);
  app.use('/api/overlay-config', overlayConfigRouter);
  app.use('/api/song-requests', songRequestsRouter);
  app.use('/api/characters', charactersRouter);
  app.use('/api/entries', entriesRouter);
  app.use('/api/commands', commandsRouter);
  app.use('/api/text-commands', textCommandsRouter);
  app.use('/api/lookup-commands', lookupCommandsRouter);
  app.use('/api/chat', chatRouter);
  app.use('/api/readiness', readinessRouter);
  app.use('/api/setup', setupRouter);
  app.use('/api/design', designRouter);
  app.use('/api/dev', devRouter);

  // Twitch OAuth callback redirect (no auth needed)
  app.get('/auth/twitch/callback', (req, res) => res.redirect('/api/auth/twitch/callback'));

  // Public read-only endpoints for overlays (no auth needed, stricter rate limit)
  app.use('/public', publicRateLimit);
  app.get('/public/stream-state', (_req, res) => {
    const state = getDb().prepare('SELECT * FROM stream_state WHERE id = 1').get();
    res.json(state);
  });

  // What the wheel is called — the streamer's word for it.
  app.get('/public/roulette', (_req, res) => {
    res.json({ title: rouletteTitle() });
  });

  app.get('/public/issues', (_req, res) => {
    const issues = getDb().prepare('SELECT * FROM issues ORDER BY created_at DESC').all();
    res.json(issues);
  });

  // The palette plus what was applied from Figma drafts (see design-apply.ts).
  app.get('/public/overlay-config', (_req, res) => {
    res.json(publicOverlayConfig());
  });

  // The song overlay only hears about changes; on load it asks what is playing.
  app.get('/public/song', (_req, res) => {
    res.json({ song: currentSong() });
  });

  // The chat overlay hears new lines as they come; on load it asks for the last ones.
  app.get('/public/chat', (_req, res) => {
    res.json(recentChat());
  });

  app.get('/public/progress', (_req, res) => {
    const state = getDb().prepare('SELECT project_name FROM stream_state WHERE id = 1').get() as { project_name: string | null };
    const items = getDb().prepare('SELECT * FROM project_items ORDER BY sort_order ASC').all() as Array<Record<string, unknown>>;
    for (const item of items) {
      item.todos = getDb().prepare('SELECT * FROM todos WHERE parent_id = ? ORDER BY done ASC, sort_order ASC, created_at ASC').all(item.id as number);
    }
    res.json({ project_name: state?.project_name || null, items });
  });

  // The vote that is running, for an overlay that loads in the middle of it.
  app.get('/public/poll', (_req, res) => {
    res.json({ poll: currentPoll() });
  });

  // The Entry Card — built server-side, so hidden fields never reach a browser source.
  app.get('/public/entry', (_req, res) => {
    res.json({ card: activeCard() });
  });

  // The same Active Entry in the older character shape, for overlays that still read it.
  app.get('/public/character', (_req, res) => {
    res.json({ character: activeCharacter() });
  });

  // Portraits copied out of the source — Notion's URLs expire, Worldbuilder's want a token.
  app.use('/public/character-image', express.static(CHARACTER_IMAGE_DIR));

  // The streamer's alert sounds — the Alerts overlay plays them as an alert appears.
  app.use('/public/alert-sound', express.static(ALERT_SOUND_DIR));

  // The cover of the song playing now (Windows media session). The song carries
  // this address with a version, so a new cover is a new address.
  app.get('/public/song-art', (_req, res) => {
    const art = currentSongArt();
    if (!art) { res.status(404).end(); return; }
    res.set('Content-Type', art.image[0] === 0xff ? 'image/jpeg' : 'image/png');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(art.image);
  });

  app.get('/public/reward-stats/top', (req, res) => {
    const type = (req.query.type as string) || '';
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 3, 1), 10);
    res.json({ type, title: type ? boardTitle(type) : null, leaderboard: type ? getTopRewards(type, limit) : [] });
  });

  // Overlay paths
  const builtinOverlayPath = getBuiltinOverlaysDir();
  const overlayOverridePath = getUserDataPath('overlay-overrides');
  const customOverlayPath = getUserDataPath('custom-overlays');
  const fs = require('fs');
  fs.mkdirSync(overlayOverridePath, { recursive: true });
  fs.mkdirSync(customOverlayPath, { recursive: true });

  // Serve overlays: overrides first, then builtin, then custom
  app.use('/overlay/custom', express.static(customOverlayPath));
  app.use('/overlay', express.static(overlayOverridePath));
  app.use('/overlay', express.static(builtinOverlayPath));

  return app;
}

export async function startServer(): Promise<{ token: string; port: number }> {
  initDatabase();
  const token = generateApiToken();

  const app = createApp();
  const server = http.createServer(app);
  initWebSocket(server, { port: PORT, host: HOST });
  restoreTimerState();

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

  if (HOST === '0.0.0.0') {
    console.warn('[Server] NST_HOST=0.0.0.0: /public/*, the overlays and the WebSocket feed (chat lines, viewer names, redemptions) are readable by every device on this network. Only for a network you trust.');
  }

  return new Promise((resolve) => {
    server.listen(PORT, HOST, () => {
      console.log(`[Server] Running on http://localhost:${PORT}`);

      // Write connection file for Stream Deck plugin auto-discovery
      writeConnectionFile(PORT);

      initRewardLeaderboard();
      connectBot().catch(() => {});
      connectObs().catch(() => {});
      // Nach dem Stream: what runs while live, and the viewer count every five minutes.
      watchStreams();
      // Follow Mode looks at Worldbuilder once a second — a connection, so here and not in createApp().
      startFollowing();
      // Viewer data has a shelf life: the redemption log and finished song requests go after 90 days.
      pruneViewerData();
      setInterval(() => pruneViewerData(), 24 * 60 * 60 * 1000);
      // Eigene Punkte: everyone in chat earns on each watch tick. The gap is read anew each time.
      const scheduleWatchTick = () => setTimeout(async () => {
        const helix = botHelix();
        if (helix) await watchTick(helix).catch((err) => console.error('[Punkte] Watch tick failed:', err));
        scheduleWatchTick();
      }, (getPointsConfig().watch_minutes || 10) * 60_000);
      scheduleWatchTick();

      // Init auto-clips after bot connects (needs a small delay for bot to be ready)
      setTimeout(() => initAutoClips(), 3000);
      // Quests: checked when something may have finished one, never by polling.
      setQuestRunner(evaluateQuests);
      const questEvents = new Set(['bot-status', 'obs-status', 'reward-redeemed', 'features-changed', 'progress-updated']);
      onBroadcast((event) => { if (questEvents.has(event)) requestQuestCheck(); });
      requestQuestCheck();

      if (getAutoDetectSetting()) startSMTC();


      resolve({ token, port: PORT });
    });
  });
}

import express from 'express';
import http from 'http';
import path from 'path';
import { initWebSocket } from './websocket/index';
import { initDatabase } from './db/index';

const PORT = 4000;

export async function startServer(): Promise<void> {
  initDatabase();

  const app = express();
  app.use(express.json());

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Static overlay files
  app.use('/overlay', express.static(path.join(__dirname, '../overlays')));

  // API routes (added in Task 5-7)

  const server = http.createServer(app);
  initWebSocket(server);

  return new Promise((resolve) => {
    server.listen(PORT, () => {
      console.log(`[Server] Running on http://localhost:${PORT}`);
      resolve();
    });
  });
}

// Export app for route registration
export { default as express } from 'express';

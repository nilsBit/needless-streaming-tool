import { WebSocketServer, WebSocket } from 'ws';
import { Server as HttpServer } from 'http';
import { URL } from 'url';
import { validateApiToken } from '../auth-token';
import { allowedOrigin, type OriginContext } from '../origins';

let wss: WebSocketServer;

// Track which clients are authenticated (can receive sensitive data later)
const authenticatedClients = new Set<WebSocket>();

export function initWebSocket(server: HttpServer, ctx: OriginContext = { port: 4000, host: '127.0.0.1' }) {
  wss = new WebSocketServer({ server });

  wss.on('connection', (ws: WebSocket, req) => {
    // A page from another site in the streamer's browser must not listen in on
    // chat lines and redemptions: only the app, our overlays and the dev page may.
    if (!allowedOrigin(req.headers.origin, ctx)) {
      console.log(`[WS] Rejected — origin not allowed: ${req.headers.origin}`);
      ws.close(4003, 'Origin not allowed');
      return;
    }
    const url = new URL(req.url || '', `http://localhost`);
    const token = url.searchParams.get('token') || undefined;
    const isOverlay = url.searchParams.get('overlay') === '1';

    if (isOverlay) {
      // Overlays connect read-only without token — they only receive broadcasts
      console.log('[WS] Overlay connected (read-only)');
    } else if (validateApiToken(token)) {
      authenticatedClients.add(ws);
      console.log('[WS] Dashboard connected (authenticated)');
    } else {
      console.log('[WS] Rejected — invalid token');
      ws.close(4001, 'Unauthorized');
      return;
    }

    ws.on('close', () => {
      authenticatedClients.delete(ws);
      console.log('[WS] Client disconnected');
    });

    ws.on('error', () => {
      authenticatedClients.delete(ws);
    });
  });
}

type BroadcastListener = (event: string, data: unknown) => void;
const listeners: BroadcastListener[] = [];

export function onBroadcast(listener: BroadcastListener): void {
  listeners.push(listener);
}

export function broadcast(event: string, data: unknown) {
  if (!wss) return;
  const message = JSON.stringify({ event, data });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
  listeners.forEach(fn => fn(event, data));
}

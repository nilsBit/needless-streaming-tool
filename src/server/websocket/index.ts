import { WebSocketServer, WebSocket } from 'ws';
import { Server as HttpServer } from 'http';
import { URL } from 'url';
import { validateApiToken } from '../auth-token';

let wss: WebSocketServer;

export function initWebSocket(server: HttpServer) {
  wss = new WebSocketServer({ server });

  wss.on('connection', (ws: WebSocket, req) => {
    // Validate token from query param: ws://localhost:4000?token=xxx
    const url = new URL(req.url || '', `http://localhost`);
    const token = url.searchParams.get('token') || undefined;

    if (!validateApiToken(token)) {
      console.log('[WS] Rejected — invalid token');
      ws.close(4001, 'Unauthorized');
      return;
    }

    console.log('[WS] Client connected');
    ws.on('close', () => console.log('[WS] Client disconnected'));
  });
}

export function broadcast(event: string, data: unknown) {
  if (!wss) return;
  const message = JSON.stringify({ event, data });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

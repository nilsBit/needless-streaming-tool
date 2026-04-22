import WebSocket from 'ws';
import { getWsUrl } from './api.js';

export type WsHandler = (event: string, data?: unknown) => void;

const handlers = new Set<WsHandler>();
let ws: WebSocket | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let stopped = false;

export function onEvent(handler: WsHandler): () => void {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

function fire(event: string, data?: unknown): void {
  handlers.forEach((h) => {
    try {
      h(event, data);
    } catch {
      /* swallow */
    }
  });
}

function scheduleReconnect(): void {
  if (stopped) return;
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    openConnection();
  }, 5000);
}

function openConnection(): void {
  if (stopped) return;
  try {
    ws?.removeAllListeners();
    ws?.close();
  } catch {
    /* ignore */
  }
  ws = new WebSocket(getWsUrl());

  ws.on('open', () => {
    fire('_connected');
  });

  ws.on('close', () => {
    fire('_disconnected');
    scheduleReconnect();
  });

  ws.on('error', () => {
    try {
      ws?.close();
    } catch {
      /* ignore */
    }
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString()) as { event?: string; data?: unknown };
      if (typeof msg.event === 'string') {
        fire(msg.event, msg.data);
      }
    } catch {
      /* ignore non-JSON */
    }
  });
}

export function startWs(): void {
  stopped = false;
  openConnection();
}

export function restartWs(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  openConnection();
}

export function stopWs(): void {
  stopped = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  try {
    ws?.close();
  } catch {
    /* ignore */
  }
}

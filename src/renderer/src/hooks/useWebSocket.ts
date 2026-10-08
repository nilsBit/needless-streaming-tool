import { useEffect, useRef } from 'react';
import { getApiToken, getServerPort } from './useApi';

type MessageHandler = (event: string, data: unknown) => void;

/**
 * One connection to the server for the whole window (08.10.: every hook call
 * opened its own — about eleven on "Im Stream", each parsing every message).
 * Each message is parsed once and handed to every subscriber. The socket
 * opens with the first subscriber and stays; it reconnects with back-off.
 */
const subscribers = new Set<{ current: MessageHandler }>();
let ws: WebSocket | null = null;
let attempts = 0;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

function connect(): void {
  if (ws) return;
  const socket = new WebSocket(`ws://localhost:${getServerPort()}?token=${getApiToken()}`);
  ws = socket;

  socket.onopen = () => {
    attempts = 0;
    console.log('[WS] Connected');
  };

  socket.onmessage = (msg) => {
    let parsed: { event: string; data: unknown };
    try {
      parsed = JSON.parse(msg.data);
    } catch (err) {
      console.error('[WS] Failed to parse message:', err);
      return;
    }
    for (const handler of subscribers) {
      try {
        handler.current(parsed.event, parsed.data);
      } catch (err) {
        console.error('[WS] Handler failed:', err);
      }
    }
  };

  socket.onclose = () => {
    if (ws === socket) ws = null;
    attempts++;
    const delay = Math.min(1000 * Math.pow(2, attempts), 10000);
    console.log(`[WS] Disconnected. Reconnecting in ${delay}ms...`);
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    reconnectTimeout = setTimeout(() => { reconnectTimeout = null; connect(); }, delay);
  };

  socket.onerror = () => {
    socket.close();
  };
}

export function useWebSocket(onMessage: MessageHandler) {
  const handlerRef = useRef<MessageHandler>(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    subscribers.add(handlerRef);
    connect();
    return () => {
      subscribers.delete(handlerRef);
    };
  }, []);
}

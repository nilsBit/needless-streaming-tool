import { useEffect, useRef } from 'react';
import { getApiToken } from './useApi';

type MessageHandler = (event: string, data: unknown) => void;

export function useWebSocket(onMessage: MessageHandler) {
  const handlersRef = useRef<MessageHandler>(onMessage);
  handlersRef.current = onMessage;

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout>;
    let attempts = 0;
    let disposed = false;

    function connect() {
      if (disposed) return;

      const token = getApiToken();
      ws = new WebSocket(`ws://localhost:4000?token=${token}`);

      ws.onopen = () => {
        attempts = 0;
        console.log('[WS] Connected');
      };

      ws.onmessage = (msg) => {
        try {
          const { event, data } = JSON.parse(msg.data);
          handlersRef.current(event, data);
        } catch (err) {
          console.error('[WS] Failed to parse message:', err);
        }
      };

      ws.onclose = () => {
        if (disposed) return;
        attempts++;
        const delay = Math.min(1000 * Math.pow(2, attempts), 10000);
        console.log(`[WS] Disconnected. Reconnecting in ${delay}ms...`);
        reconnectTimeout = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws?.close();
      };
    }

    connect();

    return () => {
      disposed = true;
      clearTimeout(reconnectTimeout);
      ws?.close();
    };
  }, []);
}

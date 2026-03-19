import { useEffect, useRef, useCallback } from 'react';

type MessageHandler = (event: string, data: unknown) => void;

export function useWebSocket(onMessage: MessageHandler) {
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<MessageHandler>(onMessage);
  handlersRef.current = onMessage;

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:4000');
    wsRef.current = ws;

    ws.onmessage = (msg) => {
      try {
        const { event, data } = JSON.parse(msg.data);
        handlersRef.current(event, data);
      } catch {}
    };

    ws.onclose = () => {
      setTimeout(() => {
        if (wsRef.current === ws) {
          wsRef.current = null;
        }
      }, 3000);
    };

    return () => { ws.close(); };
  }, []);
}

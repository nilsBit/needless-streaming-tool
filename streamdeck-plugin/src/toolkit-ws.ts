import { getConfig } from './config';

type EventHandler = (data: unknown) => void;

const handlers = new Map<string, Set<EventHandler>>();
let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

export function onToolkitEvent(eventType: string, handler: EventHandler): void {
  if (!handlers.has(eventType)) handlers.set(eventType, new Set());
  handlers.get(eventType)!.add(handler);
}

export function connectToolkit(): void {
  const { token, baseUrl } = getConfig();
  // Convert http://localhost:4000/api → ws://localhost:4000
  const wsUrl = baseUrl.replace(/^http/, 'ws').replace(/\/api$/, '') + `/ws?token=${token}`;

  try {
    socket = new WebSocket(wsUrl);
  } catch {
    scheduleReconnect();
    return;
  }

  socket.addEventListener('message', (ev) => {
    try {
      const { event_type, data } = JSON.parse(ev.data as string) as {
        event_type: string;
        data: unknown;
      };
      handlers.get(event_type)?.forEach((h) => h(data));
    } catch {
      // ignore malformed messages
    }
  });

  socket.addEventListener('close', () => scheduleReconnect());
  socket.addEventListener('error', () => {
    socket?.close();
  });
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectToolkit();
  }, 10_000);
}

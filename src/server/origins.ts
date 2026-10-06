/**
 * Which browser origins may talk to the server — for CORS and the WebSocket
 * upgrade alike. A request without an Origin header comes from no browser
 * (OBS, the Stream Deck plugin, curl) and passes; a browser page passes only
 * from the app itself, the overlays on our own server, or the Vite page in
 * development. The Figma plugin lives in a sandboxed iframe (`Origin: null`)
 * and may reach its own routes only. In LAN mode (NST_HOST=0.0.0.0) devices
 * of the network may read as well — that mode is the streamer's own call.
 */
export const DEV_RENDERER_ORIGIN = 'http://localhost:5273';

export interface OriginContext {
  port: number;
  host: string;
  path?: string;
}

export function allowedOrigin(origin: string | undefined, ctx: OriginContext): boolean {
  if (!origin) return true;
  if (origin === 'file://') return true;
  if (origin === `http://localhost:${ctx.port}` || origin === `http://127.0.0.1:${ctx.port}`) return true;
  if (origin === DEV_RENDERER_ORIGIN) return true;
  if (origin === 'null' && !!ctx.path && ctx.path.startsWith('/api/design/')) return true;
  if (ctx.host === '0.0.0.0' && /^https?:\/\/(\d{1,3}\.){3}\d{1,3}(:\d+)?$/.test(origin)) return true;
  return false;
}

import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// The renderer's CSP in production. The window loads the built index.html
// from disk, where no HTTP header can carry it, so it travels as a meta tag.
// Scripts only from the bundle; the API, the socket and the overlay previews
// from our own server. (Development gets a header from main.ts instead.)
const PRODUCTION_CSP = [
  "default-src 'self' http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:*",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' http://localhost:* http://127.0.0.1:* https://i.scdn.co data: blob:",
  "frame-src http://localhost:* http://127.0.0.1:*",
  "object-src 'none'",
  "base-uri 'none'",
].join('; ');

function cspMeta(): Plugin {
  return {
    name: 'nst-csp-meta',
    apply: 'build',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: PRODUCTION_CSP }, injectTo: 'head-prepend' }],
  };
}

export default defineConfig({
  plugins: [react(), cspMeta()],
  root: path.resolve(__dirname, 'src/renderer'),
  base: './',
  build: {
    outDir: path.resolve(__dirname, 'dist/renderer'),
  },
  server: {
    // Not Vite's default 5173: Worldbuilder's dev server takes that one, and
    // this window would load its UI instead. Strict, so a taken port fails
    // loudly instead of moving to one main.ts doesn't know about.
    port: 5273,
    strictPort: true,
  },
});

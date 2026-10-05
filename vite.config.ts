import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
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

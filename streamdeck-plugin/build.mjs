import * as esbuild from 'esbuild';
import { mkdirSync } from 'node:fs';

mkdirSync('com.nilsr.stream-toolkit.sdPlugin/bin', { recursive: true });

await esbuild.build({
  entryPoints: ['src/plugin.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: 'com.nilsr.stream-toolkit.sdPlugin/bin/plugin.js',
  target: 'node20',
  logLevel: 'info',
});

console.log('Stream Deck plugin built successfully.');

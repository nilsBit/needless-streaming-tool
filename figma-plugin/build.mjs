import { build } from 'esbuild';
import fs from 'fs';

await build({ entryPoints: ['src/code.ts'], bundle: true, outfile: 'dist/code.js', target: 'es2017' });
fs.mkdirSync('dist', { recursive: true });
fs.copyFileSync('src/ui.html', 'dist/ui.html');
console.log('figma-plugin gebaut → dist/');

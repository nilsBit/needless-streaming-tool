import esbuild from 'esbuild';
import archiver from 'archiver';
import { createWriteStream, mkdirSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SD_DIR = resolve(__dirname, 'com.thelab.toolkit.sdPlugin');
const BIN_DIR = join(SD_DIR, 'bin');
const ZIP_OUT = resolve(__dirname, '..', 'assets', 'com.thelab.toolkit.streamDeckPlugin');

async function bundle() {
  mkdirSync(BIN_DIR, { recursive: true });
  await esbuild.build({
    entryPoints: [resolve(__dirname, 'src/plugin.ts')],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    outfile: join(BIN_DIR, 'plugin.js'),
    external: [],
    logLevel: 'info',
  });
  console.log('[plugin] bundled → bin/plugin.js');
}

async function pack() {
  await bundle();
  if (existsSync(ZIP_OUT)) rmSync(ZIP_OUT);
  mkdirSync(dirname(ZIP_OUT), { recursive: true });
  await new Promise((res, rej) => {
    const out = createWriteStream(ZIP_OUT);
    const zip = archiver('zip', { zlib: { level: 9 } });
    out.on('close', res);
    out.on('error', rej);
    zip.on('error', rej);
    zip.pipe(out);
    zip.directory(SD_DIR, 'com.thelab.toolkit.sdPlugin');
    zip.finalize();
  });
  console.log(`[plugin] packaged → ${ZIP_OUT}`);
}

const cmd = process.argv[2];
if (cmd === 'package') await pack();
else if (cmd === 'bundle') await bundle();
else { console.error('Usage: node build.mjs [bundle|package]'); process.exit(1); }

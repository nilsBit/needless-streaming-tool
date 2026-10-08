import { Worker } from 'worker_threads';
import { createHash } from 'crypto';
import path from 'path';
import { broadcast } from '../websocket/index';
import { getDb } from '../db/index';
import { startNowPlaying, stopNowPlaying, isNowPlayingRunning } from './nowplaying-macos';
import type { SongData } from '../../shared/types';

export type { SongData };

let worker: Worker | null = null;

export function isSMTCSupported(): boolean {
  return process.platform === 'win32' || process.platform === 'darwin';
}

export function isSMTCRunning(): boolean {
  if (process.platform === 'darwin') return isNowPlayingRunning();
  return worker !== null;
}

export function getAutoDetectSetting(): boolean {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get('song_auto_detect') as { value: string } | undefined;
  if (!row) return isSMTCSupported();
  return row.value === 'true';
}

export function setAutoDetectSetting(enabled: boolean): void {
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('song_auto_detect', enabled ? 'true' : 'false');
  if (enabled) startSMTC();
  else stopSMTC();
}

/**
 * The cover of the song playing now, kept in memory and served at
 * /public/song-art. The song carries only its address (08.10.: the whole
 * picture went base64 to every window and overlay, and into the database).
 */
let songArt: { version: string; image: Buffer } | null = null;

export function currentSongArt(): { version: string; image: Buffer } | null {
  return songArt;
}

/** Keeps the cover and answers the address the song carries. */
export function keepSongArt(image: Uint8Array): string {
  const buffer = Buffer.from(image);
  const version = createHash('sha1').update(buffer).digest('hex').slice(0, 12);
  songArt = { version, image: buffer };
  return `/public/song-art?v=${version}`;
}

type WorkerMessage =
  | { type: 'update'; data: SongData; thumbnail?: Uint8Array }
  | { type: 'clear' }
  | { type: 'error'; message: string };

export function startSMTC(): void {
  if (!isSMTCSupported()) return;
  if (process.platform === 'darwin') { startNowPlaying(); return; }
  if (worker) return;
  try {
    const workerPath = path.join(__dirname, 'smtc-worker.js');
    worker = new Worker(workerPath);
    worker.on('message', (msg: WorkerMessage) => {
      if (msg.type === 'update') {
        if (msg.thumbnail?.length) msg.data.artworkUrl = keepSongArt(msg.thumbnail);
        else songArt = null;
        getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('current_song', JSON.stringify(msg.data));
        broadcast('song-update', msg.data);
      } else if (msg.type === 'clear') {
        songArt = null;
        getDb().prepare('DELETE FROM settings WHERE key = ?').run('current_song');
        broadcast('song-clear', {});
      } else if (msg.type === 'error') {
        console.error('[SMTC] Worker error:', msg.message);
      }
    });
    worker.on('error', (err: Error) => {
      console.error('[SMTC] Worker crashed:', err.message);
      worker = null;
    });
    worker.on('exit', (code) => {
      if (code !== 0) console.error('[SMTC] Worker exited with code', code);
      worker = null;
    });
    console.log('[SMTC] Worker started');
  } catch (e) {
    console.error('[SMTC] Failed to start:', (e as Error).message);
    worker = null;
  }
}

export function stopSMTC(): void {
  if (process.platform === 'darwin') { stopNowPlaying(); return; }
  if (!worker) return;
  worker.terminate().catch(() => {});
  worker = null;
  console.log('[SMTC] Worker stopped');
}

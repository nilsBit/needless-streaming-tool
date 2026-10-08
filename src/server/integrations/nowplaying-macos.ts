import { execFile } from 'child_process';
import { broadcast } from '../websocket/index';
import { getDb } from '../db/index';
import type { SongData } from '../../shared/types';

/**
 * What plays on a Mac: Spotify, Music, or a YouTube / SoundCloud tab in
 * Chrome, Brave or Edge — asked through AppleScript.
 *
 * Since 08.10. each look first asks, in one script, which of them run at all
 * (`application "X" is running` launches nothing), then asks only those, and
 * never blocks: before, up to five synchronous osascript calls a look held
 * up the server — and the app's window — for as long as they took.
 */

let pollTimer: ReturnType<typeof setTimeout> | null = null;
let running = false;
let lastKey: string | null = null;

const ACTIVE_INTERVAL_MS = 3000;
const IDLE_INTERVAL_MS = 10000;

const PLAYERS = [
  { app: 'Spotify', source: 'spotify' },
  { app: 'Music', source: 'apple-music' },
] as const;
const BROWSERS = [
  { app: 'Google Chrome', source: 'chrome' },
  { app: 'Brave Browser', source: 'brave' },
  { app: 'Microsoft Edge', source: 'edge' },
] as const;

function osascript(script: string): Promise<string> {
  return new Promise((resolve) => {
    execFile('osascript', ['-e', script], { timeout: 2000, encoding: 'utf-8' }, (err, stdout) => {
      resolve(err ? '' : String(stdout).trim());
    });
  });
}

/** Which of the players and browsers run right now — one script, launches nothing. */
async function runningApps(): Promise<Set<string>> {
  const names = [...PLAYERS, ...BROWSERS].map((p) => p.app);
  const script = [
    'set r to ""',
    ...names.map((n) => `if application "${n}" is running then set r to r & "${n}" & linefeed`),
    'return r',
  ].join('\n');
  return new Set((await osascript(script)).split('\n').map((s) => s.trim()).filter(Boolean));
}

async function tryPlayer(appName: string, sourceId: string): Promise<SongData | null> {
  const script = appName === 'Spotify'
    ? `tell application "Spotify" to if player state is playing then return name of current track & "|||" & artist of current track & "|||" & artwork url of current track`
    : `tell application "${appName}" to if player state is playing then return name of current track & "|||" & artist of current track`;
  const result = await osascript(script);
  if (!result) return null;
  const parts = result.split('|||');
  const title = parts[0]?.trim();
  if (!title) return null;
  const song: SongData = { title, artist: (parts[1] || '').trim(), source: sourceId };
  if (parts[2]?.trim()) song.artworkUrl = parts[2].trim();
  return song;
}

async function tryBrowserTab(appName: string, sourceId: string): Promise<SongData | null> {
  const result = await osascript(`tell application "${appName}" to get {title, URL} of active tab of front window`);
  if (!result) return null;
  // Only a music site counts.
  if (!(result.includes('youtube.com') || result.includes('soundcloud.com') || result.includes('music.youtube.com'))) return null;
  // The tab title is usually "Song - Artist - YouTube".
  const tabTitle = result.split(',')[0].trim();
  const cleanTitle = tabTitle
    .replace(/ - YouTube$/, '')
    .replace(/ - YouTube Music$/, '')
    .replace(/ \| SoundCloud$/, '');
  const parts = cleanTitle.split(' - ');
  if (parts.length >= 2) return { title: parts[0].trim(), artist: parts[1].trim(), source: sourceId };
  return { title: cleanTitle, artist: '', source: sourceId };
}

async function detect(): Promise<SongData | null> {
  const open = await runningApps();
  // Native players first, then browser tabs — in that order, as before.
  for (const p of PLAYERS) {
    if (!open.has(p.app)) continue;
    const song = await tryPlayer(p.app, p.source);
    if (song) return song;
  }
  for (const b of BROWSERS) {
    if (!open.has(b.app)) continue;
    const song = await tryBrowserTab(b.app, b.source);
    if (song) return song;
  }
  return null;
}

async function poll(): Promise<void> {
  let song: SongData | null = null;
  try {
    song = await detect();
  } catch {
    song = null;
  }
  if (!running) return;

  if (!song) {
    if (lastKey !== null) {
      lastKey = null;
      getDb().prepare('DELETE FROM settings WHERE key = ?').run('current_song');
      broadcast('song-clear', {});
    }
  } else {
    const key = `${song.title}|${song.artist}`;
    if (key !== lastKey) {
      lastKey = key;
      getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('current_song', JSON.stringify(song));
      broadcast('song-update', song);
      console.log(`[NowPlaying] ${song.title} — ${song.artist} (${song.source})`);
    }
  }
  // The next look waits for this one: no overlap however slow AppleScript is.
  pollTimer = setTimeout(() => { void poll(); }, song ? ACTIVE_INTERVAL_MS : IDLE_INTERVAL_MS);
}

export function startNowPlaying(): void {
  if (running) return;
  running = true;
  void poll();
  console.log('[NowPlaying] macOS detection started');
}

export function stopNowPlaying(): void {
  running = false;
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  console.log('[NowPlaying] macOS detection stopped');
}

export function isNowPlayingRunning(): boolean {
  return running;
}

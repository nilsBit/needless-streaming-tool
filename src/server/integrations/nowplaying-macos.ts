import { execSync } from 'child_process';
import { broadcast } from '../websocket/index';
import { getDb } from '../db/index';
import type { SongData } from '../../shared/types';

let pollInterval: ReturnType<typeof setInterval> | null = null;
let lastKey: string | null = null;

const ACTIVE_INTERVAL_MS = 3000;
const IDLE_INTERVAL_MS = 10000;
let isActive = false;

function tryPlayer(appName: string, sourceId: string): SongData | null {
  try {
    const script = appName === 'Spotify'
      ? `tell application "Spotify" to if player state is playing then return name of current track & "|||" & artist of current track & "|||" & artwork url of current track`
      : `tell application "${appName}" to if player state is playing then return name of current track & "|||" & artist of current track`;
    const result = execSync(
      `osascript -e '${script}'`,
      { timeout: 2000, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    if (!result) return null;
    const parts = result.split('|||');
    const title = parts[0]?.trim();
    if (!title) return null;
    const song: SongData = { title, artist: (parts[1] || '').trim(), source: sourceId };
    if (parts[2]?.trim()) song.artworkUrl = parts[2].trim();
    return song;
  } catch {
    return null;
  }
}

function tryBrowserTab(): SongData | null {
  // Check Chrome/Chromium-based browsers for YouTube/SoundCloud playing tabs
  const browsers = [
    { app: 'Google Chrome', source: 'chrome' },
    { app: 'Brave Browser', source: 'brave' },
    { app: 'Microsoft Edge', source: 'edge' },
  ];
  for (const browser of browsers) {
    try {
      const result = execSync(
        `osascript -e 'tell application "${browser.app}" to get {title, URL} of active tab of front window'`,
        { timeout: 2000, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
      ).trim();
      if (!result) continue;
      // Check if it's a music site
      if (result.includes('youtube.com') || result.includes('soundcloud.com') || result.includes('music.youtube.com')) {
        // Extract title — browser tab title usually has "Song - Artist - YouTube"
        const tabTitle = result.split(',')[0].trim();
        const cleanTitle = tabTitle
          .replace(/ - YouTube$/, '')
          .replace(/ - YouTube Music$/, '')
          .replace(/ \| SoundCloud$/, '');
        const parts = cleanTitle.split(' - ');
        if (parts.length >= 2) {
          return { title: parts[0].trim(), artist: parts[1].trim(), source: browser.source };
        }
        return { title: cleanTitle, artist: '', source: browser.source };
      }
    } catch {}
  }
  return null;
}

function poll(): void {
  // Try native players first, then browser tabs
  const song = tryPlayer('Spotify', 'spotify')
    || tryPlayer('Music', 'apple-music')
    || tryBrowserTab();

  if (!song) {
    if (lastKey !== null) {
      lastKey = null;
      getDb().prepare('DELETE FROM settings WHERE key = ?').run('current_song');
      broadcast('song-clear', {});
    }
    setPollingRate(false);
    return;
  }

  setPollingRate(true);
  const key = `${song.title}|${song.artist}`;
  if (key === lastKey) return;
  lastKey = key;
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('current_song', JSON.stringify(song));
  broadcast('song-update', song);
  console.log(`[NowPlaying] ${song.title} — ${song.artist} (${song.source})`);
}

function setPollingRate(active: boolean): void {
  if (active === isActive && pollInterval) return;
  isActive = active;
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(poll, active ? ACTIVE_INTERVAL_MS : IDLE_INTERVAL_MS);
}

export function startNowPlaying(): void {
  if (pollInterval) return;
  setPollingRate(false);
  poll();
  console.log('[NowPlaying] macOS detection started');
}

export function stopNowPlaying(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  isActive = false;
  console.log('[NowPlaying] macOS detection stopped');
}

export function isNowPlayingRunning(): boolean {
  return pollInterval !== null;
}

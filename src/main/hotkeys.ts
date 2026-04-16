import { globalShortcut } from 'electron';
import http from 'http';
import { getApiToken } from '../server/auth-token';
import { HotkeyConfig, DEFAULT_HOTKEYS } from '../shared/types';

function apiCall(method: string, path: string, body?: unknown) {
  const data = body ? JSON.stringify(body) : undefined;
  const options: http.RequestOptions = {
    hostname: 'localhost',
    port: 4000,
    path,
    method,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getApiToken()}` },
  };

  const req = http.request(options);
  req.on('error', (err) => console.error(`[Hotkey] API call failed: ${path}`, err.message));
  if (data) req.write(data);
  req.end();
}

function apiGet(path: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:4000${path}`, { headers: { 'Authorization': `Bearer ${getApiToken()}` } }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error(`Invalid JSON from ${path}`));
        }
      });
    }).on('error', reject);
  });
}

export async function registerHotkeys(config?: Partial<HotkeyConfig>) {
  let hotkeys: HotkeyConfig = { ...DEFAULT_HOTKEYS };

  if (config) {
    hotkeys = { ...hotkeys, ...config };
  } else {
    // Try to load from settings API
    try {
      const saved = await apiGet('/api/settings/hotkeys') as Partial<HotkeyConfig>;
      if (saved && typeof saved === 'object') {
        hotkeys = { ...hotkeys, ...saved };
      }
    } catch (err) {
      console.warn('[Hotkeys] Could not load hotkey config from DB, using defaults:', err);
    }
  }

  // Ctrl+Shift+E — Challenge toggle
  globalShortcut.register(hotkeys.challenge_toggle, async () => {
    try {
      const state = await apiGet('/api/stream-state') as { challenge_status: string };
      if (state.challenge_status === 'in_progress') {
        apiCall('PATCH', '/api/stream-state', { challenge_status: 'idle', timer_running: 0 });
      } else {
        apiCall('PATCH', '/api/stream-state', { challenge_status: 'in_progress' });
      }
    } catch (err) {
      console.error('[Hotkey] Challenge toggle failed:', err);
    }
    console.log(`[Hotkey] ${hotkeys.challenge_toggle} — Challenge toggle`);
  });

  // Timer toggle
  globalShortcut.register(hotkeys.timer_toggle, async () => {
    try {
      const state = await apiGet('/api/stream-state') as { timer_running: number };
      apiCall('PATCH', '/api/stream-state', { timer_running: state.timer_running ? 0 : 1 });
    } catch (err) {
      console.error('[Hotkey] Timer toggle failed:', err);
    }
    console.log(`[Hotkey] ${hotkeys.timer_toggle} — Timer toggle`);
  });

  // Hype Moment
  globalShortcut.register(hotkeys.hype_moment, () => {
    apiCall('POST', '/api/actions/compile-pray', {});
    console.log(`[Hotkey] ${hotkeys.hype_moment} — Hype Moment`);
  });

  // Challenge Done
  globalShortcut.register(hotkeys.challenge_done, () => {
    apiCall('PATCH', '/api/stream-state', { challenge_status: 'done', timer_running: 0 });
    console.log(`[Hotkey] ${hotkeys.challenge_done} — Done`);
  });

  // Challenge Failed
  globalShortcut.register(hotkeys.challenge_failed, () => {
    apiCall('PATCH', '/api/stream-state', { challenge_status: 'failed', timer_running: 0 });
    console.log(`[Hotkey] ${hotkeys.challenge_failed} — Failed`);
  });

  // Glücksrad
  globalShortcut.register(hotkeys.roulette, () => {
    apiCall('POST', '/api/actions/roulette', {});
    console.log(`[Hotkey] ${hotkeys.roulette} — Roulette`);
  });

  // Milestone Minor
  globalShortcut.register(hotkeys.milestone_minor, () => {
    apiCall('POST', '/api/milestones', { level: 'minor' });
    console.log(`[Hotkey] ${hotkeys.milestone_minor} — Milestone Minor`);
  });

  // Milestone Major
  globalShortcut.register(hotkeys.milestone_major, () => {
    apiCall('POST', '/api/milestones', { level: 'major' });
    console.log(`[Hotkey] ${hotkeys.milestone_major} — Milestone Major`);
  });

  // Milestone Epic
  globalShortcut.register(hotkeys.milestone_epic, () => {
    apiCall('POST', '/api/milestones', { level: 'epic' });
    console.log(`[Hotkey] ${hotkeys.milestone_epic} — Milestone Epic`);
  });

  console.log('[Hotkeys] Registered all global shortcuts');
}

export function unregisterHotkeys() {
  globalShortcut.unregisterAll();
  console.log('[Hotkeys] Unregistered all');
}

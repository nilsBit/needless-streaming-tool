import { globalShortcut } from 'electron';
import http from 'http';

function apiCall(method: string, path: string, body?: unknown) {
  const data = body ? JSON.stringify(body) : undefined;
  const options: http.RequestOptions = {
    hostname: 'localhost',
    port: 4000,
    path,
    method,
    headers: { 'Content-Type': 'application/json' },
  };

  const req = http.request(options);
  if (data) req.write(data);
  req.end();
}

export function registerHotkeys() {
  // Ctrl+Shift+E — Experiment toggle
  globalShortcut.register('CommandOrControl+Shift+E', () => {
    // Fetch current state, then toggle
    http.get('http://localhost:4000/api/stream-state', (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        const state = JSON.parse(data);
        if (state.experiment_status === 'in_progress') {
          apiCall('PATCH', '/api/stream-state', { experiment_status: 'idle', timer_running: 0 });
        } else {
          apiCall('PATCH', '/api/stream-state', { experiment_status: 'in_progress' });
        }
      });
    });
    console.log('[Hotkey] Ctrl+Shift+E — Experiment toggle');
  });

  // Ctrl+Shift+T — Timer toggle
  globalShortcut.register('CommandOrControl+Shift+T', () => {
    http.get('http://localhost:4000/api/stream-state', (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        const state = JSON.parse(data);
        apiCall('PATCH', '/api/stream-state', { timer_running: state.timer_running ? 0 : 1 });
      });
    });
    console.log('[Hotkey] Ctrl+Shift+T — Timer toggle');
  });

  // Ctrl+Shift+C — Compile & Pray
  globalShortcut.register('CommandOrControl+Shift+C', () => {
    apiCall('POST', '/api/actions/compile-pray', {});
    console.log('[Hotkey] Ctrl+Shift+C — Compile & Pray');
  });

  // Ctrl+Shift+D — Experiment Done
  globalShortcut.register('CommandOrControl+Shift+D', () => {
    apiCall('PATCH', '/api/stream-state', { experiment_status: 'done', timer_running: 0 });
    console.log('[Hotkey] Ctrl+Shift+D — Done');
  });

  // Ctrl+Shift+F — Experiment Failed
  globalShortcut.register('CommandOrControl+Shift+F', () => {
    apiCall('PATCH', '/api/stream-state', { experiment_status: 'failed', timer_running: 0 });
    console.log('[Hotkey] Ctrl+Shift+F — Failed');
  });

  // Ctrl+Shift+R — Bug Roulette
  globalShortcut.register('CommandOrControl+Shift+R', () => {
    apiCall('POST', '/api/actions/roulette', {});
    console.log('[Hotkey] Ctrl+Shift+R — Roulette');
  });

  console.log('[Hotkeys] Registered all global shortcuts');
}

export function unregisterHotkeys() {
  globalShortcut.unregisterAll();
  console.log('[Hotkeys] Unregistered all');
}

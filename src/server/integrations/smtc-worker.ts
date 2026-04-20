import { parentPort } from 'worker_threads';

if (!parentPort) {
  throw new Error('smtc-worker must be run as a worker thread');
}

const ACTIVE_INTERVAL_MS = 3000;   // 3s when music is playing
const IDLE_INTERVAL_MS = 15000;    // 15s when no music detected
let lastKey: string | null = null;
let currentInterval: ReturnType<typeof setInterval> | null = null;
let isActive = false;

function setPollingRate(active: boolean): void {
  if (active === isActive && currentInterval) return;
  isActive = active;
  if (currentInterval) clearInterval(currentInterval);
  currentInterval = setInterval(poll, active ? ACTIVE_INTERVAL_MS : IDLE_INTERVAL_MS);
}

function poll(): void {
  try {
    const { SMTCMonitor } = require('@coooookies/windows-smtc-monitor');
    const session = SMTCMonitor.getCurrentMediaSession();

    if (!session?.media?.title) {
      if (lastKey !== null) {
        lastKey = null;
        parentPort!.postMessage({ type: 'clear' });
      }
      setPollingRate(false);
      return;
    }

    setPollingRate(true);

    const data = {
      title: String(session.media.title),
      artist: String(session.media.artist || ''),
      source: String(session.sourceAppId || ''),
    };
    const key = `${data.title}|${data.artist}`;
    if (key === lastKey) return;
    lastKey = key;
    parentPort!.postMessage({ type: 'update', data });
  } catch (e) {
    parentPort!.postMessage({ type: 'error', message: (e as Error).message });
  }
}

// Start with idle rate, then poll — poll() will switch to active rate if music is detected
setPollingRate(false);
poll();

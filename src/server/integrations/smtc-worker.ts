import { parentPort } from 'worker_threads';

if (!parentPort) {
  throw new Error('smtc-worker must be run as a worker thread');
}

const POLL_INTERVAL_MS = 3000;
let lastKey: string | null = null;

function poll(): void {
  try {
    const { SMTCMonitor } = require('@coooookies/windows-smtc-monitor');
    const session = SMTCMonitor.getCurrentMediaSession();

    if (!session?.media?.title) {
      if (lastKey !== null) {
        lastKey = null;
        parentPort!.postMessage({ type: 'clear' });
      }
      return;
    }

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

poll();
setInterval(poll, POLL_INTERVAL_MS);

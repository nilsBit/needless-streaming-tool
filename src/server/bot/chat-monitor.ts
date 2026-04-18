import { Client } from 'tmi.js';

const WINDOW_SIZE_MS = 30_000; // 30 seconds per window
const HISTORY_WINDOWS = 10; // 5 minutes of history (10 × 30s)
const COOLDOWN_MS = 60_000; // 60s cooldown after spike

let messageCounts: number[] = []; // ring buffer of window counts
let currentWindowCount = 0;
let currentWindowStart = Date.now();
let lastSpikeTime = 0;

function resetWindow() {
  messageCounts.push(currentWindowCount);
  if (messageCounts.length > HISTORY_WINDOWS) {
    messageCounts = messageCounts.slice(-HISTORY_WINDOWS);
  }
  currentWindowCount = 0;
  currentWindowStart = Date.now();
}

function getAverage(): number {
  if (messageCounts.length === 0) return 0;
  return messageCounts.reduce((a, b) => a + b, 0) / messageCounts.length;
}

export function initChatMonitor(client: Client, onSpike: (multiplier: number) => void): void {
  // Rotate windows every 30s
  setInterval(() => {
    const avg = getAverage();
    const multiplierSetting = getSpikeMultiplier();

    // Check for spike before rotating
    if (avg > 0 && currentWindowCount > avg * multiplierSetting) {
      const now = Date.now();
      if (now - lastSpikeTime > COOLDOWN_MS) {
        const mult = Math.round((currentWindowCount / avg) * 10) / 10;
        lastSpikeTime = now;
        console.log(`[ChatMonitor] Spike detected: ${currentWindowCount} msgs (${mult}x avg of ${Math.round(avg)})`);
        onSpike(mult);
      }
    }

    resetWindow();
  }, WINDOW_SIZE_MS);

  // Count ALL messages (not just commands)
  client.on('message', () => {
    // Check if we've drifted past the window boundary
    if (Date.now() - currentWindowStart > WINDOW_SIZE_MS * 1.5) {
      resetWindow();
    }
    currentWindowCount++;
  });

  console.log('[ChatMonitor] Initialized');
}

function getSpikeMultiplier(): number {
  try {
    // Dynamic import would be circular — use a simple approach
    // The auto-clips module will set this externally
    return (global as unknown as { __chatMonitorMultiplier?: number }).__chatMonitorMultiplier || 3;
  } catch {
    return 3;
  }
}

export function setSpikeMultiplier(mult: number): void {
  (global as unknown as { __chatMonitorMultiplier: number }).__chatMonitorMultiplier = mult;
}

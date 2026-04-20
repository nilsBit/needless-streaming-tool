import { useState, useEffect, useRef } from 'react';

/**
 * Client-side countdown that syncs from a server value and ticks locally.
 * Only runs a setInterval while counting down (no CPU waste when idle).
 *
 * @param serverValue - Remaining seconds from the server (resyncs when changed)
 * @param onComplete - Optional callback when countdown reaches 0
 * @returns Current countdown value in seconds
 */
export function useCountdown(serverValue: number, onComplete?: () => void): number {
  const [count, setCount] = useState(0);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Sync from server value
  useEffect(() => {
    if (serverValue > 0) setCount(serverValue);
    else setCount(0);
  }, [serverValue]);

  // Tick locally — effect only re-fires when counting starts/stops (boolean dep)
  const isActive = count > 0;
  useEffect(() => {
    if (!isActive) return;
    const id = setInterval(() => {
      setCount(c => {
        if (c <= 1) {
          onCompleteRef.current?.();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [isActive]);

  return count;
}

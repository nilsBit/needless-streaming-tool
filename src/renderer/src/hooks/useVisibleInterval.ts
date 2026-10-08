import { useEffect, useRef } from 'react';

/**
 * Runs `callback` every `ms` while the window can be seen, and once as soon
 * as it can be seen again (08.10.). Minimized or in the tray, the app does
 * not poll — the server keeps doing its work, the window catches up on show.
 */
export function useVisibleInterval(callback: () => void, ms: number, enabled = true): void {
  const saved = useRef(callback);
  saved.current = callback;

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer || document.hidden) return;
      timer = setInterval(() => saved.current(), ms);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.hidden) { stop(); return; }
      saved.current();
      start();
    };
    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [ms, enabled]);
}

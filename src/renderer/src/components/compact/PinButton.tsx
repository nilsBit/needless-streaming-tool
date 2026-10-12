import React, { useEffect, useState } from 'react';

const STORAGE_KEY = 'nst.alwaysOnTop';

// "Immer im Vordergrund": the window stays above OBS. Remembered per machine
// and set again on start. Only inside the app — a browser has no such window.
export default function PinButton() {
  const api = window.electronAPI;
  const [on, setOn] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
  });

  useEffect(() => {
    void api?.setAlwaysOnTop?.(on);
    try { localStorage.setItem(STORAGE_KEY, on ? '1' : '0'); } catch { /* ignore */ }
  }, [api, on]);

  if (!api?.setAlwaysOnTop) return null;
  return (
    <button
      type="button"
      className={`compact-icon-btn${on ? ' on' : ''}`}
      aria-pressed={on}
      aria-label="Immer im Vordergrund"
      title={on ? 'Bleibt über anderen Fenstern – antippen zum Lösen' : 'Immer im Vordergrund'}
      onClick={() => setOn(!on)}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 17v5M9 3h6l-1 7 4 3H6l4-3z" /></svg>
    </button>
  );
}

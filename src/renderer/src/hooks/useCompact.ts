import { useEffect, useState } from 'react';

// The window is small — a narrow column beside OBS or a little window in a
// corner (12.10.). Below these sizes the app shows its compact view: one bar
// on top, one row per card on "Im Stream".
export const COMPACT_QUERY = '(max-width: 699px), (max-height: 559px)';

export function useCompact(): boolean {
  const [compact, setCompact] = useState(() => typeof window !== 'undefined' && window.matchMedia(COMPACT_QUERY).matches);
  useEffect(() => {
    const media = window.matchMedia(COMPACT_QUERY);
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return compact;
}

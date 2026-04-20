import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost } from '../../hooks/useApi';

interface Result {
  seen: boolean;
  loading: boolean;
  markSeen: () => Promise<void>;
}

export function useFirstTouch(name: string): Result {
  const key = `ux_hint_seen_${name}`;
  const [seen, setSeen] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    apiGet<{ value: string | null }>(`/settings/get/${encodeURIComponent(key)}`).then((data) => {
      if (cancelled) return;
      setSeen(data?.value === 'true');
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [key]);

  const markSeen = useCallback(async () => {
    setSeen(true); // optimistic
    await apiPost('/settings/set', { key, value: 'true' });
  }, [key]);

  return { seen, loading, markSeen };
}

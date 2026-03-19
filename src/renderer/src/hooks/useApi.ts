import { useState, useEffect, useCallback } from 'react';

const API_BASE = 'http://localhost:4000/api';

export function useApi<T>(endpoint: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`${API_BASE}${endpoint}`);
    const json = await res.json();
    setData(json);
    setLoading(false);
  }, [endpoint]);

  useEffect(() => { refetch(); }, [refetch]);

  return { data, loading, refetch };
}

export async function apiPost<T>(endpoint: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function apiPatch<T>(endpoint: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function apiDelete(endpoint: string): Promise<void> {
  await fetch(`${API_BASE}${endpoint}`, { method: 'DELETE' });
}

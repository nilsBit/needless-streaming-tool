import { useState, useEffect, useCallback } from 'react';

const API_BASE = 'http://localhost:4000/api';

// Extract API token from URL hash (set by Electron main process)
function getToken(): string {
  const hash = window.location.hash.substring(1);
  const params = new URLSearchParams(hash);
  return params.get('token') || '';
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  };
}

export function getApiToken(): string {
  return getToken();
}

export function useApi<T>(endpoint: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error(`[useApi] ${endpoint}:`, err);
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => { refetch(); }, [refetch]);

  return { data, loading, refetch };
}

export async function apiPost<T>(endpoint: string, body: unknown): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  } catch (err) {
    console.error(`[apiPost] ${endpoint}:`, err);
    return null;
  }
}

export async function apiPatch<T>(endpoint: string, body: unknown): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  } catch (err) {
    console.error(`[apiPatch] ${endpoint}:`, err);
    return null;
  }
}

export async function apiDelete(endpoint: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return true;
  } catch (err) {
    console.error(`[apiDelete] ${endpoint}:`, err);
    return false;
  }
}

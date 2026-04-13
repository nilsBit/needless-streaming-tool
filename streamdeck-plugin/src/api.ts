import { getConfig } from './config';

async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const { token, baseUrl } = getConfig();
  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
}

export async function createClip(tag: string): Promise<boolean> {
  try {
    const res = await apiFetch('/clips', {
      method: 'POST',
      body: JSON.stringify({ tag }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function triggerCompilePray(): Promise<boolean> {
  try {
    const res = await apiFetch('/actions/compile-pray', { method: 'POST' });
    return res.ok;
  } catch {
    return false;
  }
}

/** Returns true if roulette spun, false if on cooldown or error */
export async function triggerBugRoulette(): Promise<{ success: boolean; onCooldown: boolean }> {
  try {
    const res = await apiFetch('/actions/roulette', { method: 'POST' });
    if (res.status === 429) return { success: false, onCooldown: true };
    return { success: res.ok, onCooldown: false };
  } catch {
    return { success: false, onCooldown: false };
  }
}

export async function switchScene(scene: string): Promise<boolean> {
  try {
    const res = await apiFetch('/obs/scene', {
      method: 'POST',
      body: JSON.stringify({ scene }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function getScenes(): Promise<string[]> {
  try {
    const res = await apiFetch('/obs/scenes');
    if (!res.ok) return [];
    const data = await res.json() as { scenes: { sceneName: string }[]; currentScene: string };
    return data.scenes.map((s) => s.sceneName);
  } catch {
    return [];
  }
}

export async function getStreamState(): Promise<{ is_live: number } | null> {
  try {
    const res = await apiFetch('/stream-state');
    if (!res.ok) return null;
    return res.json() as Promise<{ is_live: number }>;
  } catch {
    return null;
  }
}

export async function getOpenBugCount(): Promise<number> {
  try {
    const res = await apiFetch('/bugs');
    if (!res.ok) return 0;
    const bugs = await res.json() as { status: string }[];
    return bugs.filter((b) => b.status === 'open').length;
  } catch {
    return 0;
  }
}

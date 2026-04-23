export interface Settings {
  host: string;
  port: number;
  apiToken: string;
}

export const DEFAULT_SETTINGS: Settings = { host: 'localhost', port: 4000, apiToken: '' };

let currentSettings: Settings = { ...DEFAULT_SETTINGS };

export function getSettings(): Readonly<Settings> {
  return currentSettings;
}

export function updateSettings(partial: Partial<Settings>): void {
  currentSettings = { ...currentSettings, ...partial };
}

export function getBaseUrl(): string {
  const { host, port } = currentSettings;
  return `http://${host || 'localhost'}:${port || 4000}`;
}

export async function request<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const url = `${getBaseUrl()}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${currentSettings.apiToken}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export const apiGet = <T = unknown>(path: string): Promise<T> => request<T>('GET', path);
export const apiPost = <T = unknown>(path: string, body?: unknown): Promise<T> => request<T>('POST', path, body);
export const apiPatch = <T = unknown>(path: string, body?: unknown): Promise<T> => request<T>('PATCH', path, body);

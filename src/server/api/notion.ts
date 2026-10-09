import { getDb } from '../db/index';

// Notion for Worldbuilder sources (characters, the active entry). The clip
// database sync went with the content board on 2026-10-09.
const NOTION_VERSION = '2022-06-28';

function getNotionToken(): string | null {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get('notion_token') as { value: string } | undefined;
  return row?.value || null;
}

// --- Rate limiter: max 3 concurrent Notion requests, one 500ms retry on 429 ---
let active = 0;
const queue: Array<() => void> = [];

function acquire(): Promise<void> {
  return new Promise((resolve) => {
    if (active < 3) { active++; resolve(); return; }
    queue.push(() => { active++; resolve(); });
  });
}

function release(): void {
  active--;
  const next = queue.shift();
  if (next) next();
}

export async function notionFetch(path: string, init: RequestInit & { method: string }): Promise<Response> {
  const token = getNotionToken();
  if (!token) throw new Error('no_token');
  await acquire();
  try {
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    };
    let res = await fetch(`https://api.notion.com${path}`, { ...init, headers });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 500));
      res = await fetch(`https://api.notion.com${path}`, { ...init, headers });
    }
    return res;
  } finally {
    release();
  }
}

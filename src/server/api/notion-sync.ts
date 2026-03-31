import { getDb } from '../db/index';

// Notion database ID for clips
const NOTION_CLIPS_DB = '063fe6bb48384ddfab0afebf32244308';

function getNotionToken(): string | null {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get('notion_token') as { value: string } | undefined;
  return row?.value || null;
}

interface ClipRow {
  id: number;
  tag: string;
  note: string | null;
  session_date: string;
  created_at: string;
}

export async function syncClipToNotion(clip: ClipRow): Promise<boolean> {
  const token = getNotionToken();
  if (!token) {
    console.log('[Notion] No token configured — skipping sync');
    return false;
  }

  const time = new Date(clip.created_at).toLocaleTimeString('de-DE', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  try {
    const res = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        parent: { database_id: NOTION_CLIPS_DB },
        properties: {
          'Clip': { title: [{ text: { content: `${clip.tag} — ${time}` } }] },
          'Tag': { select: { name: clip.tag } },
          'Session': { date: { start: clip.session_date } },
          'Zeitstempel': { rich_text: [{ text: { content: time } }] },
          'Notiz': clip.note
            ? { rich_text: [{ text: { content: clip.note } }] }
            : { rich_text: [] },
          'Synced': { checkbox: true },
        },
      }),
    });

    if (res.ok) {
      console.log(`[Notion] Synced clip ${clip.id}`);
      return true;
    } else {
      const data = await res.json();
      console.error(`[Notion] Sync failed:`, data.message || data);
      return false;
    }
  } catch (err) {
    console.error('[Notion] Sync error:', err);
    return false;
  }
}

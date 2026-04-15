import { getDb } from '../db/index';

function getNotionToken(): string | null {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get('notion_token') as { value: string } | undefined;
  return row?.value || null;
}

function getNotionClipsDbId(): string | null {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get('notion_clips_db') as { value: string } | undefined;
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

  const dbId = getNotionClipsDbId();
  if (!dbId) {
    console.log('[Notion] No clips database ID configured — skipping sync');
    return false;
  }

  const time = new Date(clip.created_at + 'Z').toLocaleTimeString('de-DE', {
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
        parent: { database_id: dbId },
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

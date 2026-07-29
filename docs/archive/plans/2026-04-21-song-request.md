# Song Request Queue — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chat-Command `!sr <url>` mit oEmbed-Metadaten, Song-Request-Queue im SongPanel, und OBS-Overlay.

**Architecture:** Neue DB-Tabelle `song_requests`, neuer Express-Router `song-requests.ts`, oEmbed-Resolution via `fetch`. Chat-Commands `!sr` und `!queue` in `commands.ts`. Queue-Section im bestehenden SongPanel. Standalone HTML-Overlay mit WebSocket.

**Tech Stack:** Express, better-sqlite3, tmi.js, React, WebSocket, oEmbed (YouTube + Spotify)

**Spec:** `docs/superpowers/specs/2026-04-21-song-request-design.md`

**Convention note:** Keine automatisierten Tests. Verifikation per `npm run typecheck`, `npm run lint`, manuelles QA. Frequent commits.

---

### Task 1: Schema + Types

**Files:**
- Modify: `src/server/db/schema.ts`
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Schema-Version bumpen und Tabelle hinzufügen**

In `src/server/db/schema.ts`:

Suche:
```ts
export const SCHEMA_VERSION = 12;
```
Ersetze durch:
```ts
export const SCHEMA_VERSION = 13;
```

Suche das Ende des SCHEMA-Strings (vor dem letzten `` `; ``):
```sql
);
`;
```
(Das ist die schließende Klammer der `milestones`-Tabelle + Template-String-Ende)

Füge **vor** `` `; `` ein:
```sql

CREATE TABLE IF NOT EXISTS song_requests (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  url           TEXT NOT NULL,
  title         TEXT NOT NULL,
  artist        TEXT,
  source        TEXT NOT NULL,
  requested_by  TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

- [ ] **Step 2: Types hinzufügen**

In `src/shared/types.ts`, suche:
```ts
export const VALID_MILESTONE_STATUS = ['pending', 'completed'] as const;
```

F��ge **danach** ein:
```ts

export interface SongRequest {
  id: number;
  url: string;
  title: string;
  artist: string | null;
  source: string;
  requested_by: string;
  status: string;
  created_at: string;
}

export const VALID_SONG_REQUEST_STATUS = ['pending', 'playing', 'done', 'skipped'] as const;
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`

- [ ] **Step 4: Commit**

```bash
git add src/server/db/schema.ts src/shared/types.ts
git commit -m "feat(db): add song_requests table and SongRequest type"
```

---

### Task 2: API-Routes + oEmbed

**Files:**
- Create: `src/server/api/song-requests.ts`
- Modify: `src/server/index.ts`

- [ ] **Step 1: Song-Requests-Router erstellen**

Erstelle `src/server/api/song-requests.ts`:

```ts
import { Router } from 'express';
import { getDb } from '../db/index';
import { broadcast } from '../websocket/index';
import { VALID_SONG_REQUEST_STATUS } from '../../shared/types';

const router = Router();

const YOUTUBE_RE = /(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]+)/i;
const SPOTIFY_RE = /open\.spotify\.com\/track\/([\w]+)/i;

interface OEmbedResult {
  title: string;
  artist: string | null;
  source: 'youtube' | 'spotify';
}

export async function resolveOEmbed(url: string): Promise<OEmbedResult | null> {
  try {
    if (YOUTUBE_RE.test(url)) {
      const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return null;
      const data = await res.json() as { title: string; author_name?: string };
      return { title: data.title, artist: data.author_name || null, source: 'youtube' };
    }
    if (SPOTIFY_RE.test(url)) {
      const res = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return null;
      const data = await res.json() as { title: string };
      // Spotify oEmbed title is often "Song - Artist"
      const parts = data.title.split(' - ');
      if (parts.length >= 2) {
        return { title: parts[0].trim(), artist: parts.slice(1).join(' - ').trim(), source: 'spotify' };
      }
      return { title: data.title, artist: null, source: 'spotify' };
    }
    return null;
  } catch {
    return null;
  }
}

export function detectSource(url: string): 'youtube' | 'spotify' | null {
  if (YOUTUBE_RE.test(url)) return 'youtube';
  if (SPOTIFY_RE.test(url)) return 'spotify';
  return null;
}

// GET / — queue (pending + playing)
router.get('/', (_req, res) => {
  const rows = getDb().prepare(
    "SELECT * FROM song_requests WHERE status IN ('pending', 'playing') ORDER BY CASE status WHEN 'playing' THEN 0 ELSE 1 END, created_at ASC"
  ).all();
  res.json(rows);
});

// POST /clear — skip all pending
router.post('/clear', (_req, res) => {
  getDb().prepare("UPDATE song_requests SET status = 'skipped' WHERE status = 'pending'").run();
  broadcast('sr-update', {});
  res.json({ success: true });
});

// POST /:id/play
router.post('/:id/play', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM song_requests WHERE id = ?').get(req.params.id);
  if (!existing) { res.status(404).json({ error: 'Not found' }); return; }
  db.prepare("UPDATE song_requests SET status = 'done' WHERE status = 'playing'").run();
  db.prepare("UPDATE song_requests SET status = 'playing' WHERE id = ?").run(req.params.id);
  broadcast('sr-update', {});
  res.json({ success: true });
});

// POST /:id/skip
router.post('/:id/skip', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM song_requests WHERE id = ?').get(req.params.id);
  if (!existing) { res.status(404).json({ error: 'Not found' }); return; }
  db.prepare("UPDATE song_requests SET status = 'skipped' WHERE id = ?").run(req.params.id);
  broadcast('sr-update', {});
  res.json({ success: true });
});

// DELETE /:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM song_requests WHERE id = ?').get(req.params.id);
  if (!existing) { res.status(404).json({ error: 'Not found' }); return; }
  db.prepare('DELETE FROM song_requests WHERE id = ?').run(req.params.id);
  broadcast('sr-update', {});
  res.status(204).send();
});

export default router;
```

- [ ] **Step 2: Route in server/index.ts registrieren**

In `src/server/index.ts`, suche:
```ts
import overlayConfigRouter, { getOverlayConfig } from './api/overlay-config';
```

Füge **danach** ein:
```ts
import songRequestsRouter from './api/song-requests';
```

Suche:
```ts
  app.use('/api/overlay-config', overlayConfigRouter);
```

Füge **danach** ein:
```ts
  app.use('/api/song-requests', songRequestsRouter);

  // Public read-only endpoint for overlay (no auth)
  app.get('/public/song-queue', (_req, res) => {
    const rows = getDb().prepare(
      "SELECT * FROM song_requests WHERE status IN ('pending', 'playing') ORDER BY CASE status WHEN 'playing' THEN 0 ELSE 1 END, created_at ASC"
    ).all();
    res.json(rows);
  });
```

Note: This requires importing `getDb` in `src/server/index.ts`. Check if it's already imported — if not, add:
```ts
import { getDb } from './db/index';
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`

- [ ] **Step 4: Commit**

```bash
git add src/server/api/song-requests.ts src/server/index.ts
git commit -m "feat(api): add song request queue routes with oEmbed resolution"
```

---

### Task 3: Chat-Commands (`!sr` + `!queue`)

**Files:**
- Modify: `src/server/bot/commands.ts`

- [ ] **Step 1: Import hinzufügen**

Suche:
```ts
import { broadcast } from '../websocket/index';
```

Füge **danach** ein:
```ts
import { resolveOEmbed, detectSource } from '../api/song-requests';
```

- [ ] **Step 2: Commands registrieren**

Suche:
```ts
  vote: '!vote',
};
```

Ersetze durch:
```ts
  vote: '!vote',
  sr: '!sr',
  queue: '!queue',
};
```

- [ ] **Step 3: matchCommand anpassen**

Das Problem: `!sr <url>` enthält Argumente, aber `matchCommand` vergleicht nur den ersten Token (`input`). Der erste Token ist bereits `!sr` — das matcht korrekt. Kein Change nötig hier.

- [ ] **Step 4: !sr Handler einfügen**

Suche das Ende des `vote`-Case-Blocks:
```ts
        break;
      }
    }
  });
}
```

Ersetze durch (füge die neuen Cases vor `}` → `});` → `}` ein):
```ts
        break;
      }

      case 'sr': {
        const url = message.trim().split(/\s+/)[1];
        const username = tags['display-name'] || tags.username || 'anon';
        if (!url) {
          client.say(channel, '❌ Benutzung: !sr <YouTube oder Spotify URL>');
          break;
        }
        const source = detectSource(url);
        if (!source) {
          client.say(channel, '❌ Nur YouTube- und Spotify-Links erlaubt.');
          break;
        }
        try {
          const db = getDb();
          const maxRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('sr_max_per_user') as { value: string } | undefined;
          const max = parseInt(maxRow?.value || '2', 10);
          const count = db.prepare("SELECT COUNT(*) as c FROM song_requests WHERE requested_by = ? AND status = 'pending'").get(username) as { c: number };
          if (count.c >= max) {
            client.say(channel, `❌ Du hast bereits ${max} Songs in der Queue, @${username}.`);
            break;
          }
          const meta = await resolveOEmbed(url);
          if (!meta) {
            client.say(channel, '❌ Konnte den Song nicht laden.');
            break;
          }
          db.prepare('INSERT INTO song_requests (url, title, artist, source, requested_by) VALUES (?, ?, ?, ?, ?)').run(url, meta.title, meta.artist, meta.source, username);
          const pos = db.prepare("SELECT COUNT(*) as c FROM song_requests WHERE status = 'pending'").get() as { c: number };
          broadcast('sr-update', {});
          client.say(channel, `🎵 "${meta.title}" von @${username} zur Queue hinzugefügt (Position ${pos.c})`);
        } catch (err) {
          console.error('[SR] Error:', err);
          client.say(channel, '❌ Konnte den Song nicht laden.');
        }
        break;
      }

      case 'queue': {
        const db = getDb();
        const pending = db.prepare("SELECT title, requested_by FROM song_requests WHERE status = 'pending' ORDER BY created_at ASC LIMIT 3").all() as Array<{ title: string; requested_by: string }>;
        if (pending.length === 0) {
          client.say(channel, '🎵 Die Queue ist leer. Requeste mit !sr <URL>');
        } else {
          const list = pending.map((s, i) => `${i + 1}. "${s.title}" (@${s.requested_by})`).join(' | ');
          client.say(channel, `🎵 Queue: ${list}`);
        }
        break;
      }
    }
  });
}
```

- [ ] **Step 5: Typecheck + Lint**

Run: `npm run typecheck && npm run lint`

- [ ] **Step 6: Commit**

```bash
git add src/server/bot/commands.ts
git commit -m "feat(bot): add !sr and !queue chat commands for song requests"
```

---

### Task 4: i18n-Keys

**Files:**
- Modify: `src/renderer/src/i18n/translations.ts`

- [ ] **Step 1: Keys hinzufügen**

Suche den `// ---- Guided Tour ----` Kommentar. Füge **davor** ein:

```ts
  // ---- Song Request Queue ----
  'sr.title': { de: 'Song Queue', en: 'Song Queue' },
  'sr.empty': { de: 'Queue ist leer — Viewer können mit !sr einen Song requesten', en: 'Queue is empty — viewers can request with !sr' },
  'sr.clear': { de: 'Queue leeren', en: 'Clear queue' },
  'sr.play': { de: 'Abspielen', en: 'Play' },
  'sr.skip': { de: 'Überspringen', en: 'Skip' },
  'sr.position': { de: 'Position', en: 'Position' },
  'sr.requested_by': { de: 'von', en: 'by' },
  'sr.cleared': { de: 'Queue geleert', en: 'Queue cleared' },
  'sr.cmd_sr': { de: 'Song zur Queue hinzufügen (!sr <URL>)', en: 'Add song to queue (!sr <URL>)' },
  'sr.cmd_queue': { de: 'Nächste Songs anzeigen', en: 'Show next songs' },

```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/i18n/translations.ts
git commit -m "feat(i18n): add song request queue translation keys"
```

---

### Task 5: SongPanel Queue-Section

**Files:**
- Modify: `src/renderer/src/panels/SongPanel.tsx`
- Modify: `src/renderer/src/index.css`

- [ ] **Step 1: Imports erweitern**

In `SongPanel.tsx`, suche:
```ts
import React, { useState } from 'react';
import { useApi, apiPost } from '../hooks/useApi';
```

Ersetze durch:
```ts
import React, { useState } from 'react';
import { useApi, apiPost, apiDelete } from '../hooks/useApi';
```

Suche:
```ts
import { useToast } from '../i18n/ToastContext';
```

Füge **danach** ein:
```ts
import { SongRequest } from '../../../shared/types';
import ChatCommands from '../components/ChatCommands';
```

- [ ] **Step 2: Queue-State und WebSocket hinzufügen**

Suche:
```ts
  useWebSocket((event) => {
    if (event === 'song-update' || event === 'song-clear') refetch();
  });
```

Ersetze durch:
```ts
  const { data: queue, refetch: refetchQueue } = useApi<SongRequest[]>('/song-requests');

  useWebSocket((event) => {
    if (event === 'song-update' || event === 'song-clear') refetch();
    if (event === 'sr-update') refetchQueue();
  });
```

- [ ] **Step 3: Queue-Handler hinzufügen**

Suche:
```ts
  const autoSupported = data?.auto_detect_supported ?? false;
```

Füge **davor** ein:
```ts
  const playSong = async (id: number) => {
    const result = await apiPost(`/song-requests/${id}/play`, {});
    if (!result) { toast.error(t('error.action_failed')); return; }
    refetchQueue();
  };

  const skipSong = async (id: number) => {
    const result = await apiPost(`/song-requests/${id}/skip`, {});
    if (!result) { toast.error(t('error.action_failed')); return; }
    refetchQueue();
  };

  const deleteSong = async (id: number) => {
    const ok = await apiDelete(`/song-requests/${id}`);
    if (!ok) { toast.error(t('error.action_failed')); return; }
    refetchQueue();
  };

  const clearQueue = async () => {
    const result = await apiPost('/song-requests/clear', {});
    if (!result) { toast.error(t('error.action_failed')); return; }
    toast.success(t('sr.cleared'));
    refetchQueue();
  };

  const pendingQueue = (queue || []).filter(s => s.status === 'pending');
  const playingNow = (queue || []).find(s => s.status === 'playing');

```

- [ ] **Step 4: Queue-Section rendern**

Suche:
```ts
    </div>
  );
}
```
(Das ist das schließende `</div>` + `);` + `}` am Ende der Komponente, Zeilen 137-139)

Ersetze durch:
```ts
      <div className="sr-section">
        <div className="sr-header">
          <h3>🎵 {t('sr.title')} <span className="sr-badge">{pendingQueue.length}</span></h3>
          {pendingQueue.length > 0 && (
            <button className="btn-export-small" onClick={clearQueue}>{t('sr.clear')}</button>
          )}
        </div>

        {playingNow && (
          <div className="sr-row sr-playing">
            <span className="sr-row-pos">▶</span>
            <span className="sr-row-title">{playingNow.title}{playingNow.artist ? ` — ${playingNow.artist}` : ''}</span>
            <span className="sr-row-source">{playingNow.source === 'youtube' ? '🔴' : '🟢'}</span>
            <span className="sr-row-user">@{playingNow.requested_by}</span>
            <a className="sr-row-link" href={playingNow.url} target="_blank" rel="noopener noreferrer" title="Open">🔗</a>
            <button className="btn-clip-delete" onClick={() => skipSong(playingNow.id)} title={t('sr.skip')}>⏭</button>
          </div>
        )}

        {pendingQueue.length === 0 && !playingNow ? (
          <p className="empty">{t('sr.empty')}</p>
        ) : (
          pendingQueue.map((sr, i) => (
            <div key={sr.id} className="sr-row">
              <span className="sr-row-pos">{i + 1}</span>
              <span className="sr-row-title">{sr.title}{sr.artist ? ` — ${sr.artist}` : ''}</span>
              <span className="sr-row-source">{sr.source === 'youtube' ? '🔴' : '🟢'}</span>
              <span className="sr-row-user">@{sr.requested_by}</span>
              <a className="sr-row-link" href={sr.url} target="_blank" rel="noopener noreferrer" title="Open">🔗</a>
              <button className="btn-clip-delete" onClick={() => playSong(sr.id)} title={t('sr.play')}>▶</button>
              <button className="btn-clip-delete" onClick={() => skipSong(sr.id)} title={t('sr.skip')}>⏭</button>
              <button className="btn-clip-delete" onClick={() => deleteSong(sr.id)} title={t('tooltip.delete')}>✕</button>
            </div>
          ))
        )}
      </div>

      <ChatCommands commands={[
        { cmd: '!sr', desc: t('sr.cmd_sr') },
        { cmd: '!queue', desc: t('sr.cmd_queue') },
      ]} />
    </div>
  );
}
```

- [ ] **Step 5: CSS-Styles hinzufügen**

Am Ende von `src/renderer/src/index.css` einfügen:

```css
/* ---------- Song Request Queue ---------- */
.sr-section { margin-top: 20px; }
.sr-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.sr-header h3 { font-size: 15px; font-weight: 600; }
.sr-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 10px;
  background: var(--accent, #4a9eff);
  color: white;
  font-size: 11px;
  font-weight: 600;
  margin-left: 6px;
}
.sr-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 4px;
  font-size: 13px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  transition: background 0.12s;
}
.sr-row:last-child { border-bottom: none; }
.sr-row:hover { background: rgba(255,255,255,0.03); }
.sr-playing {
  border-left: 3px solid var(--accent, #4a9eff);
  padding-left: 8px;
  background: rgba(74,158,255,0.05);
}
.sr-row-pos { min-width: 20px; font-size: 12px; color: var(--muted, #888); text-align: center; }
.sr-row-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sr-row-source { font-size: 14px; }
.sr-row-user { font-size: 12px; color: var(--muted, #888); white-space: nowrap; }
.sr-row-link { font-size: 12px; text-decoration: none; opacity: 0.5; }
.sr-row-link:hover { opacity: 1; }
.sr-row .btn-clip-delete { opacity: 0; }
.sr-row:hover .btn-clip-delete { opacity: 1; }

[data-theme="light"] .sr-row { border-bottom-color: rgba(0,0,0,0.08); }
[data-theme="light"] .sr-row:hover { background: rgba(0,0,0,0.02); }
[data-theme="light"] .sr-playing { background: rgba(74,158,255,0.06); }
```

- [ ] **Step 6: Typecheck + Lint**

Run: `npm run typecheck && npm run lint`

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/panels/SongPanel.tsx src/renderer/src/index.css
git commit -m "feat(song): add song request queue section to SongPanel"
```

---

### Task 6: OBS Overlay

**Files:**
- Create: `src/overlays/song-queue/index.html`

- [ ] **Step 1: Overlay erstellen**

Erstelle `src/overlays/song-queue/index.html`:

```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --color-primary: #ff2d7b;
      --color-secondary: #00d4ff;
      --color-accent: #39ff14;
      --color-text: #ffffff;
      --color-bg: #0a0a0a;
      --color-bg-opacity: 0.92;
      --color-bg-secondary: #0d0d0d;
      --color-primary-rgb: 255 45 123;
      --color-secondary-rgb: 0 212 255;
      --color-accent-rgb: 57 255 20;
      --color-bg-rgb: 10 10 10;
      --font-display: 'Bebas Neue', sans-serif;
      --font-body: 'Inter', sans-serif;
      --font-size-base: 14px;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: transparent !important; font-family: var(--font-body); overflow: hidden; }

    #container { display: flex; flex-direction: column; gap: 6px; padding: 8px; }

    .sr-now {
      display: none;
      align-items: center;
      gap: 12px;
      padding: 10px 16px;
      background: rgb(var(--color-bg-rgb) / 0.92);
      border: 2px solid var(--color-accent);
      box-shadow: 0 0 12px rgb(var(--color-accent-rgb) / 0.3);
      animation: srSlideIn 0.4s ease-out;
    }
    .sr-now.visible { display: flex; }

    .sr-now-label {
      font-family: var(--font-display);
      font-size: 10px;
      letter-spacing: 3px;
      color: var(--color-accent);
      text-transform: uppercase;
    }
    .sr-now-title {
      font-family: var(--font-display);
      font-size: 18px;
      color: var(--color-text);
      letter-spacing: 1px;
      text-transform: uppercase;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .sr-now-artist {
      font-size: 12px;
      color: var(--color-secondary);
    }
    .sr-now-user {
      font-size: 11px;
      color: #ff6b35;
      margin-left: auto;
      white-space: nowrap;
    }

    .sr-next {
      display: none;
      flex-direction: column;
      gap: 2px;
      padding: 6px 12px;
      background: rgb(var(--color-bg-rgb) / 0.75);
      border-left: 2px solid rgba(255,255,255,0.15);
    }
    .sr-next.visible { display: flex; }

    .sr-next-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: rgba(255,255,255,0.6);
      animation: srFadeIn 0.3s ease-out;
    }
    .sr-next-pos { min-width: 16px; color: rgba(255,255,255,0.3); }
    .sr-next-title { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sr-next-user { color: rgba(255,107,53,0.6); }

    @keyframes srSlideIn {
      0% { opacity: 0; transform: translateY(-20px); }
      100% { opacity: 1; transform: translateY(0); }
    }
    @keyframes srFadeIn {
      0% { opacity: 0; }
      100% { opacity: 1; }
    }
  </style>
</head>
<body>
  <div id="container">
    <div class="sr-now" id="now">
      <div style="display:flex;flex-direction:column;gap:2px;flex:1;min-width:0">
        <span class="sr-now-label">SONG REQUEST</span>
        <span class="sr-now-title" id="now-title"></span>
        <span class="sr-now-artist" id="now-artist"></span>
      </div>
      <span class="sr-now-user" id="now-user"></span>
    </div>
    <div class="sr-next" id="next"></div>
  </div>

  <script>
(function() {
  var name = 'song-queue';
  document.documentElement.style.visibility = 'hidden';
  function hexToRgb(hex) {
    var r = parseInt(hex.slice(1,3), 16);
    var g = parseInt(hex.slice(3,5), 16);
    var b = parseInt(hex.slice(5,7), 16);
    return r + ' ' + g + ' ' + b;
  }
  fetch('http://localhost:4000/public/overlay-config')
    .then(function(r) { return r.json(); })
    .then(function(config) {
      var vars = Object.assign({}, config.global || {}, (config.overrides || {})[name] || {});
      var root = document.documentElement;
      Object.keys(vars).forEach(function(k) { root.style.setProperty(k, vars[k]); });
      ['--color-primary', '--color-secondary', '--color-accent', '--color-bg'].forEach(function(k) {
        if (vars[k]) root.style.setProperty(k + '-rgb', hexToRgb(vars[k]));
      });
    })
    .catch(function() {})
    .finally(function() { document.documentElement.style.visibility = 'visible'; });
  window.__applyOverlayConfig = function(config) {
    var vars = Object.assign({}, config.global || {}, (config.overrides || {})[name] || {});
    var root = document.documentElement;
    Object.keys(vars).forEach(function(k) { root.style.setProperty(k, vars[k]); });
    ['--color-primary', '--color-secondary', '--color-accent', '--color-bg'].forEach(function(k) {
      if (vars[k]) root.style.setProperty(k + '-rgb', hexToRgb(vars[k]));
    });
  };
})();
  </script>
  <script>
    const nowEl = document.getElementById('now');
    const nowTitle = document.getElementById('now-title');
    const nowArtist = document.getElementById('now-artist');
    const nowUser = document.getElementById('now-user');
    const nextEl = document.getElementById('next');

    function render(queue) {
      const playing = queue.find(s => s.status === 'playing');
      const pending = queue.filter(s => s.status === 'pending').slice(0, 3);

      if (playing) {
        nowEl.classList.add('visible');
        nowTitle.textContent = playing.title;
        nowArtist.textContent = playing.artist || '';
        nowUser.textContent = '@' + playing.requested_by;
      } else {
        nowEl.classList.remove('visible');
      }

      if (pending.length > 0) {
        nextEl.classList.add('visible');
        nextEl.innerHTML = pending.map((s, i) =>
          '<div class="sr-next-item">' +
            '<span class="sr-next-pos">' + (i + 1) + '.</span>' +
            '<span class="sr-next-title">' + s.title + '</span>' +
            '<span class="sr-next-user">@' + s.requested_by + '</span>' +
          '</div>'
        ).join('');
      } else {
        nextEl.classList.remove('visible');
        nextEl.innerHTML = '';
      }
    }

    // Initial fetch via public endpoint (no auth needed for overlay)
    fetch('http://localhost:4000/public/song-queue')
      .then(r => r.json())
      .then(render)
      .catch(() => {});

    // WebSocket live updates
    const ws = new WebSocket('ws://localhost:4000?overlay=1');
    ws.onmessage = (msg) => {
      const { event, data } = JSON.parse(msg.data);
      if (event === 'overlay-config' && window.__applyOverlayConfig) window.__applyOverlayConfig(data);
      if (event === 'sr-update') {
        fetch('http://localhost:4000/api/song-requests')
          .then(r => r.json())
          .then(render)
          .catch(() => {});
      }
    };
  </script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add src/overlays/song-queue/index.html
git commit -m "feat(overlay): add song request queue OBS overlay"
```

---

### Task 7: Manuelles QA

- [ ] **Step 1: Dev-Server starten**

Stoppe laufenden Server, dann: `npm run dev`

- [ ] **Step 2: QA — Schema-Migration**

Die App startet ohne Fehler. In den Logs sollte kein Schema-Error auftauchen. Die `song_requests`-Tabelle wird automatisch erstellt.

- [ ] **Step 3: QA — API testen**

```bash
TOKEN=$(grep -o 'token=[^"]*' /dev/null || echo 'test')
# Queue should be empty
curl -s http://localhost:4000/api/song-requests -H "Authorization: Bearer $TOKEN"
```

- [ ] **Step 4: QA — SongPanel**

1. Song-Panel öffnen
2. Queue-Section sichtbar mit "Queue ist leer" Hinweis
3. Chat-Commands-Box zeigt `!sr` und `!queue`

- [ ] **Step 5: QA — Overlay**

1. `http://localhost:4000/overlay/song-queue` im Browser öffnen
2. Sollte komplett leer/transparent sein (keine Queue)

- [ ] **Step 6: QA — Typecheck + Lint**

Run: `npm run typecheck && npm run lint`
Expected: 0 Fehler, nur pre-existing Warnings.

---

## Notes for Implementation

- **Route-Reihenfolge:** `/clear` MUSS vor `/:id` registriert sein
- **oEmbed-Timeout:** 5 Sekunden via `AbortSignal.timeout(5000)`
- **Spotify-Titel:** Best-Effort-Split bei " - ", fragil aber akzeptabel
- **Limit-Default:** Hardcoded `2`, überschreibbar via Settings-Key `sr_max_per_user`
- **WebSocket-Event:** `sr-update` für alle Queue-Änderungen (kein Payload nötig, Client refetcht)
- **Overlay-Auth:** Overlay nutzt `/public/song-queue` für den Initial-Fetch (kein Token nötig, read-only). Panel nutzt `/api/song-requests` (mit Auth). Beides zeigt die gleichen Daten.

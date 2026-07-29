# Song Request Queue

**Datum:** 2026-04-21

## Problem

Viewer haben keine Möglichkeit, Songs über den Chat zu requesten. Es gibt nur ein manuelles Song-Feld und Auto-Detection (Windows).

## Lösung

Chat-Command `!sr <youtube/spotify-url>` baut eine Song-Request-Queue auf. Metadaten werden via oEmbed automatisch aufgelöst. Streamer verwaltet die Queue im SongPanel. OBS-Overlay zeigt den aktuellen + nächste Songs.

## Datenbank

Neue Tabelle `song_requests`:

```sql
CREATE TABLE IF NOT EXISTS song_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  artist TEXT,
  source TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

- `source`: `'youtube'` oder `'spotify'`
- `status`: `'pending'` | `'playing'` | `'done'` | `'skipped'`
- Limit: Max 2 pending Requests pro User (Settings-Key `sr_max_per_user`, Default `'2'`)

Validierungs-Konstante in `src/shared/types.ts`:

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

## oEmbed-Metadaten

Funktion `resolveOEmbed(url: string)` in `src/server/api/song-requests.ts`:

- **YouTube:** `https://www.youtube.com/oembed?url={url}&format=json` → `{ title, author_name }`
  - Akzeptiert `youtube.com/watch?v=`, `youtu.be/`, `youtube.com/shorts/`
- **Spotify:** `https://open.spotify.com/oembed?url={url}` → `{ title }` (Format oft "Song - Artist")
  - Akzeptiert `open.spotify.com/track/`
  - Titel-Parsing: Best-Effort-Split bei " - ". Wenn kein " - " vorhanden, wird der gesamte title als Titel ohne Artist gespeichert. Nicht kritisch — Darstellung funktioniert auch ohne getrennten Artist.

URL-Validierung per Regex vor dem oEmbed-Call. Ungültige URLs werden sofort abgelehnt.

Timeout: 5 Sekunden. Bei Fehler → Chat-Antwort "Konnte den Song nicht laden."

**Limit-Default:** `sr_max_per_user` wird NICHT in der DB geseeded. Code fällt auf Hardcoded-Default `2` zurück wenn der Key nicht existiert: `const max = parseInt(settingsRow?.value || '2', 10)`.

## Chat-Commands

### `!sr <url>`

1. URL-Regex-Check: YouTube oder Spotify?
2. Limit-Check: `SELECT COUNT(*) FROM song_requests WHERE requested_by = ? AND status = 'pending'` >= Max?
3. oEmbed-Fetch: Titel + Artist auslesen
4. INSERT in `song_requests`
5. WebSocket broadcast `sr-update`
6. Chat: `🎵 "{title}" von @{user} zur Queue hinzugefügt (Position {n})`

**Fehler-Antworten:**
- Kein Argument: `❌ Benutzung: !sr <YouTube oder Spotify URL>`
- Ungültige URL: `❌ Nur YouTube- und Spotify-Links erlaubt.`
- Limit erreicht: `❌ Du hast bereits 2 Songs in der Queue, @{user}.`
- oEmbed-Fehler: `❌ Konnte den Song nicht laden.`

### `!queue`

Zeigt die nächsten 3 pending Songs:
```
🎵 Queue: 1. "Sandstorm" (@viewer1) | 2. "Never Gonna..." (@viewer2) | 3. "Levels" (@viewer3)
```
Leere Queue: `🎵 Die Queue ist leer. Requeste mit !sr <URL>`

Neue Einträge in `DEFAULT_COMMANDS`:
```ts
sr: '!sr',
queue: '!queue',
```

## API-Routes

Neuer Router in `src/server/api/song-requests.ts`, registriert als `app.use('/api/song-requests', songRequestsRouter)`.

| Route | Method | Zweck |
|---|---|---|
| `/` | GET | Queue abrufen (pending + playing, sortiert nach created_at ASC) |
| `/clear` | POST | Alle pending Songs auf skipped setzen |
| `/:id/play` | POST | Song als playing markieren. Setzt vorherigen playing-Song auf done. |
| `/:id/skip` | POST | Song auf skipped setzen |
| `/:id` | DELETE | Song aus Queue entfernen |

**Wichtig:** `/clear` muss VOR `/:id` registriert werden, da Express sonst `"clear"` als `:id` matcht.

Der gesamte `!sr`-Handler muss in try/catch gewrapped werden, damit bei oEmbed-/DB-Fehlern immer eine Chat-Antwort gesendet wird (kein silent drop).

Alle Endpoints broadcasten `sr-update` via WebSocket.

## Panel UI

Im bestehenden `SongPanel.tsx`, als neue Section unter dem aktuellen Song-Bereich:

**Layout:**
- Überschrift "🎵 Song Queue" mit Anzahl-Badge (Anzahl pending)
- "Queue leeren"-Button rechts
- Kompakte Row-Liste (gleicher Stil wie die neuen Clip-Rows):
  - `Position/#` | `Titel — Artist` | Source-Icon (🔴 YT / 🟢 Spotify) | `@username` | `▶ Play` | `⏭ Skip` | `✕ Delete`
- Aktuell spielender Song: hervorgehoben mit accent `border-left`
- "▶ Play"-Button nur auf pending Songs
- Leere Queue: Hinweistext "Queue ist leer — Viewer können mit !sr einen Song requesten"

WebSocket-Listener auf `sr-update` → Refetch.

## Overlay

Neue Datei `src/overlays/song-queue/index.html`, erreichbar unter `http://localhost:4000/overlay/song-queue`.

**Darstellung:**
- Aktueller Song (status `playing`): groß, Titel + Artist + Source-Icon + `@username`
- Nächste 2-3 pending Songs: kompakte Liste darunter, kleiner/muted
- Transparenter Hintergrund (für OBS)
- Animierter Einblend-Effekt bei neuen Songs (CSS fade-in)
- Komplett transparent/leer wenn Queue leer

**Technik:**
- WebSocket-Verbindung (`ws://localhost:4000?overlay=1`)
- Listener auf `sr-update` Event
- Initial-Fetch via `GET /api/song-requests` (mit overlay-Token-Auth)
- CSS-Variablen aus `/public/overlay-config` für konsistentes Styling

## Geänderte Dateien

- **Neu:** `src/server/api/song-requests.ts` — API-Routes + oEmbed-Helper
- **Neu:** `src/overlays/song-queue/index.html` — OBS Overlay
- **Modify:** `src/server/db/schema.ts` — `song_requests` Tabelle
- **Modify:** `src/server/bot/commands.ts` — `!sr` und `!queue` Commands
- **Modify:** `src/server/index.ts` — Route registrieren
- **Modify:** `src/shared/types.ts` — `SongRequest` Interface + Validierung
- **Modify:** `src/renderer/src/panels/SongPanel.tsx` — Queue-Section
- **Modify:** `src/renderer/src/i18n/translations.ts` — i18n-Keys
- **Modify:** `src/renderer/src/index.css` — Queue-Row-Styles

## Out of Scope

- Spotify/YouTube API-Keys (nur oEmbed, keine Auth nötig)
- Song-Abspielen innerhalb der App (User spielt manuell in Spotify/YouTube ab)
- Queue-Reordering per Drag-and-Drop (kommt ggf. später)
- Blacklist für URLs oder User
- Cooldown zwischen Requests
- Song-Request-History-Panel

## Konventionen

- Direkter Commit auf `main`, conventional commits
- Typecheck + lint + manuelles QA

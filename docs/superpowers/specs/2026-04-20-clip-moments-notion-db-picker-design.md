# Clip Moments: Notion-DB-Picker + Panel-Redesign

**Date:** 2026-04-20
**Status:** Approved

## Problem

Die aktuelle Notion-Anbindung ist für den Endnutzer (nicht-technischer Streamer) zu umständlich:

- DB muss manuell in Notion angelegt werden, mit genau den richtigen Properties.
- Integration muss manuell per "Add connections" an die DB gehängt werden.
- Die DB-URL muss aus dem Browser kopiert und in die App gepastet werden.
- Sync passiert nur per-Tag-Klick auf "📤 Notion" — leicht zu vergessen.
- Dem User ist nicht ersichtlich, welche Clips bereits in Notion sind.
- Die Notion-Einrichtung ist in `NotionStep.tsx` und `SettingsPanel.tsx` doppelt implementiert.

Außerdem wirkt das `ClipsPanel` optisch flach: "X Clips" pro Tag gibt keinen Überblick über die Art der Clips, Clip-Items sind eine dichte Zeile ohne visuelle Hierarchie, Sync-Status ist nicht sichtbar.

## Goal

1. **Notion-DB-Auswahl per Picker** — nach dem Token-Schritt wählt der User seine Datenbank aus einer Liste, oder lässt sich eine neue mit dem korrekten Schema anlegen. Kein URL-Paste mehr als Pflicht-Flow.
2. **Auto-Sync als Default** — frisch erstellte Clips werden sofort nach Notion gesynct, der User sieht pro Clip den Sync-Status. Toggle für Opt-out bleibt.
3. **ClipsPanel optisch klarer** — Tag-Breakdown im Day-Header, Card-Style-Clip-Items, Sync-Badges.
4. **Einheitliches Notion-Setup-Widget** — gleiche Komponente im Onboarding-Wizard und in den Settings.

## Non-Goals

- Inline-Editieren von Clip-Tag/Note — außerhalb des Scopes.
- Clip-Suche, Bulk-Aktionen — außerhalb des Scopes.
- Bi-direktionaler Sync (Notion → App) — außerhalb des Scopes.
- Andere Notion-Integrationen (Todos, Milestones) — bleiben unverändert.

## Architecture Overview

| Layer | Änderung |
|-------|----------|
| DB-Schema (v11 → v12) | Neue Spalte `clips.notion_page_id TEXT NULL` |
| Settings-Keys | Neu: `notion_auto_sync` (Default `"true"` wenn Token + DB gesetzt) |
| Backend `src/server/api/notion-sync.ts` | Neue Funktionen: `listDatabases`, `listPages`, `createDatabase`, `healDatabase`, `checkDatabase` |
| Backend `src/server/api/settings.ts` | Neue Endpoints für Listen/Create/Heal/Check; existierender `POST /notion/database` speichert nur noch IDs (URL-Parser bleibt als Fallback) |
| Backend `src/server/api/clips.ts` | Auto-Sync-Hook bei `POST /clips` + bei `PATCH /clips/:id` (Auto-Clip-Confirm) |
| Frontend `NotionDatabasePicker.tsx` (neu) | Shared Component für Onboarding + Settings |
| Frontend `ClipSyncBadge.tsx` (neu) | Status-Indikator pro Clip |
| Frontend `ClipsPanel.tsx` | Tag-Breakdown im Day-Header, Card-Style, Sync-Badges, Auto-Sync-Toggle |
| Frontend `NotionStep.tsx` | Nutzt `NotionDatabasePicker`, 6-Schritte-Liste wird auf Token + Picker reduziert |
| Frontend `SettingsPanel.tsx` | Notion-Sektion nutzt `NotionDatabasePicker` statt Duplikat |
| i18n `translations.ts` | Neue Keys für Picker, Sync-Status, Fehler |

## Backend-API

### `GET /api/settings/notion/databases`

Listet alle Notion-Datenbanken, auf die die Integration Zugriff hat.

- Ruft Notion `POST /v1/search` mit `{ filter: { value: "database", property: "object" } }`.
- Token aus `settings.notion_token` holen. Kein Token → `401 { error: "no_token" }`.
- Response:
  ```json
  [
    { "id": "abc...", "title": "Stream Clips", "icon": "📊", "url": "https://...", "missing_properties": [] },
    { "id": "def...", "title": "My Notes", "icon": null, "url": "https://...", "missing_properties": ["Tag", "Session"] }
  ]
  ```
- `missing_properties` wird errechnet indem jede DB gegen den erwarteten Schema (Clip title, Tag select, Session date, Zeitstempel rich_text, Notiz rich_text, Synced checkbox) abgeglichen wird.
- `icon`: Notion liefert entweder `{type:"emoji", emoji:"📊"}` oder `{type:"external"|"file", url}`. Wir geben `emoji` direkt zurück, URLs prefixen wir mit `https:` falls nötig. Kein Icon → `null`.

### `GET /api/settings/notion/pages`

Listet alle Pages, auf die die Integration Zugriff hat — nur für den Parent-Page-Picker beim Create-Flow.

- Ruft Notion `POST /v1/search` mit `{ filter: { value: "page", property: "object" } }`.
- Response: `[{ id, title, icon, url }]`.
- Leere Liste ist gültig (User muss erst eine Page mit der Integration teilen).

### `POST /api/settings/notion/database/create`

Erstellt eine neue DB mit dem korrekten Schema unter einer vom User gewählten Parent-Page.

- Body: `{ parent_page_id: string, title?: string }`. Default-Titel: `"Stream Clips"`.
- Ruft Notion `POST /v1/databases` mit:
  ```json
  {
    "parent": { "type": "page_id", "page_id": "<parent_page_id>" },
    "title": [{ "type": "text", "text": { "content": "<title>" } }],
    "properties": {
      "Clip": { "title": {} },
      "Tag": { "select": { "options": [] } },
      "Session": { "date": {} },
      "Zeitstempel": { "rich_text": {} },
      "Notiz": { "rich_text": {} },
      "Synced": { "checkbox": {} }
    }
  }
  ```
- Bei Erfolg: `settings.notion_clips_db` wird gesetzt, Response: `{ id, title, url }`.
- Bei 403 (Integration hat keinen Zugriff auf Parent): `{ error: "no_parent_access" }`.

### `POST /api/settings/notion/database/heal`

Ergänzt fehlende Properties in einer bestehenden DB.

- Body: `{ database_id: string }`.
- Liest aktuelle Properties via `GET /v1/databases/{id}`, berechnet Delta gegen erwartetes Schema.
- Für jede fehlende Property einen `PATCH /v1/databases/{id}` mit der entsprechenden Property-Definition.
- Response: `{ added: ["Tag", "Synced"] }`.

### `GET /api/settings/notion/database/check`

Prüft den Status der aktuell gespeicherten DB.

- Response: `{ ok: true }` oder `{ ok: false, missing_properties: [...] }` oder `{ ok: false, error: "token_invalid" | "db_gone" | "no_db" }`.
- Wird vom Frontend beim Mount des Pickers gerufen, um den bereits-konfigurierten Zustand anzuzeigen.

### Rate Limiting

Notion erlaubt ~3 req/s. Shared Semaphore (`p-limit` oder eigene Queue) in `notion-sync.ts`: max 3 gleichzeitige Requests. Bei `429` einmalig 500ms warten, dann retry. Danach Fehler.

## Frontend-Komponenten

### `NotionDatabasePicker`

Props:
```ts
interface Props {
  onConfigured: () => void;  // fires nach erfolgreicher DB-Zuweisung
  mode: "onboarding" | "settings";  // kosmetische Unterschiede (z.B. Größe)
}
```

Interne Zustände:
- `phase: "loading" | "picker" | "empty" | "configured" | "creating"`
- `databases: Database[]`
- `pages: Page[]` (nur geladen wenn Create geklickt)
- `error: string | null`

**Phase `picker` (DBs vorhanden, keine konfiguriert):**
```
┌─────────────────────────────────────────────┐
│ Wähle deine Clip-Datenbank           [🔄]   │
├─────────────────────────────────────────────┤
│ [➕ Neue Datenbank für mich erstellen]      │
├─────────────────────────────────────────────┤
│ 📊 Stream Clips                             │
│ 📋 My Notes                 ⚠ 2 fehlend     │
│ 🎬 Highlights 2025                          │
└─────────────────────────────────────────────┘
[🔗 Manuell: ID oder URL einfügen]  (klein, darunter)
```
- Klick auf DB: POST `/notion/database`, dann automatischer POST `/notion/database/heal`. Bei Erfolg Toast "Datenbank bereit". Bei Heal-Fehler Toast mit Details, aber DB bleibt ausgewählt.
- Klick "Neue erstellen": wechselt in Phase `creating`.
- Klick "Manuell": klappt ein Fallback-Input auf (die bestehende URL-Paste-Logik).

**Phase `creating`:**
```
┌─────────────────────────────────────────────┐
│ Neue Datenbank erstellen                    │
│                                             │
│ Name: [Stream Clips________]                │
│                                             │
│ Unter welcher Notion-Seite?                 │
│ ○ 📄 Streaming                              │
│ ○ 📄 2026                                   │
│ ○ 📄 Projects                               │
│                                             │
│ [Abbrechen]              [Erstellen]        │
└─────────────────────────────────────────────┘
```
- Pages-Liste wird per `GET /notion/pages` geladen.
- Leere Pages-Liste: "Noch keine Seite erreichbar — verbinde die Integration erst mit einer Notion-Seite." + Anleitung + [🔄 Erneut suchen].

**Phase `empty` (weder DBs noch Pages erreichbar):**
```
┌─────────────────────────────────────────────┐
│ Noch keine Datenbank erreichbar             │
│                                             │
│ So verbindest du deine Notion:              │
│ 1. Öffne eine Seite in Notion               │
│ 2. "..." → "Add connections"                │
│ 3. Wähle deine Stream-Toolkit-Integration   │
│                                             │
│ [🔄 Erneut suchen]                          │
└─────────────────────────────────────────────┘
```

**Phase `configured` (DB bereits gesetzt):**
```
┌─────────────────────────────────────────────┐
│ 📊 Stream Clips                    ✓ Ready │
│ Schema: alle Properties OK                  │
│                                             │
│ [Andere wählen] [DB in Notion öffnen ↗]    │
└─────────────────────────────────────────────┘
```
- Bei `check`-Fehler `missing_properties`: "⚠ 3 Properties fehlen — [🔧 Reparieren]". Klick triggert `heal`.
- Bei `check`-Fehler `db_gone`: "Datenbank nicht mehr verfügbar — [Andere wählen]".
- Bei `token_invalid`: "Token ungültig — [Zu Token-Einstellungen]".

### `ClipSyncBadge`

```ts
type SyncState = "pending" | "syncing" | "synced" | "failed" | "disabled";

interface Props {
  state: SyncState;
  notionUrl?: string;  // nur für "synced" — Klick öffnet Notion-Page
  onRetry?: () => void;  // nur für "failed"
}
```

Icon-Mapping:
- `pending`: `⋯` (dim)
- `syncing`: `⏳` (mit CSS-Spin-Animation)
- `synced`: `✅` (klickbar → öffnet `notionUrl` in Browser)
- `failed`: `⚠️` (klickbar → retry)
- `disabled`: nicht gerendert (Notion nicht konfiguriert)

Tooltip zeigt den Status als Klartext.

### `ClipsPanel` — UI-Änderungen

**Panel-Header:**
```
🎬 Clip Moments              [☁️ Auto-Sync: An ▼]
```
- Toggle (Switch oder Dropdown) neben `<h2>`. Klick schaltet `notion_auto_sync` um und persistiert sofort via `POST /settings/set {key:"notion_auto_sync", value:"false"|"true"}`.
- Ausgeblendet, wenn Notion nicht konfiguriert ist.

**Day-Header:**
```
▼  Heute (2026-04-20)    ⭐3 💀2 😂1   |  6 Clips    [📤 Re-Sync] [📥 DaVinci]
```
- Tag-Breakdown: nur Tags mit Count > 0 als `emoji count`-Chips.
- "Re-Sync" ersetzt "📤 Notion" — synced Clips des Tages mit `notion_page_id IS NULL`. Kein Shift-Force-Re-Sync in diesem Scope (kann später nachgezogen werden, YAGNI).
- Keine Re-Sync-Button wenn Notion nicht konfiguriert.

**Clip-Item (Card):**
```
┌────────────────────────────────────────────────────┐
│ 🔴 00:42:15  ⏺ 00:38:02 | 19:42:15            ✅  │
│ ⭐ highlight                                   ✕   │
│   "insane ace on mirage"                           │
└────────────────────────────────────────────────────┘
```
- Erste Zeile: Timecodes (Stream prominenter, dann Recording, dann Wallclock) + `ClipSyncBadge` rechts.
- Zweite Zeile: Tag + Delete-Button (bzw. bei Auto-Clip: ✓/✕ Confirm-Pair).
- Dritte Zeile: Note, nur wenn vorhanden.
- Card-Styling: `border-radius: 8px`, leicht erhöhter Background, Hover: heller.

**Empty-States:**
- Keine Clips heute: "Noch keine Clips heute — drück `Strg+Shift+C` zum Speichern." (Hotkey aus Config lesen wenn möglich.)
- Filter leer: "Keine Clips mit Tag „{tag}"." + [Filter entfernen].
- Notion nicht konfiguriert: Sync-Badges ausgeblendet, Day-Button ausgeblendet.

## Auto-Sync-Flow

### Happy Path: Neuer manueller Clip

1. User klickt "Add" im Panel oder drückt Hotkey → `POST /clips { tag, note }`.
2. Backend: INSERT → neue Clip-Row, `notion_page_id = NULL`.
3. Backend: `if (notion_auto_sync && !tag.startsWith("auto-")) queueSync(clip);`
4. Sync läuft async: ruft `syncClipToNotion(clip)`. Bei Erfolg: `UPDATE clips SET notion_page_id=? WHERE id=?`, dann WS-Event `clip-updated` mit `data: { id }` broadcasten.
5. Frontend: `useWebSocket` hört `clip-updated` → `refetchClips()` → Badge geht von `⋯` auf `✅`.
6. Bei Fehler: `notion_page_id` bleibt NULL, WS-Event `clip-sync-failed` mit `data: { id, error }`. Frontend setzt Badge auf `⚠️` und zeigt Toast mit dem Fehler. Der ClipsPanel-Handler matcht jetzt sowohl `clip-*` als auch `clip-sync-failed`.

Der `syncing`-Badge-State (`⏳` mit Spin-Animation) ist **nicht** Teil dieses Features — in der Praxis ist der Sync so schnell, dass ein Pending → Synced-Übergang ausreicht. `syncing` bleibt im Type-Enum als Option für spätere UI-Verbesserungen, wird aktuell aber nicht gesetzt.

### Auto-Clip-Confirm

- Auto-Clip hat Tag `auto-highlight`, wird bei Create **nicht** gesynct.
- User klickt ✓ → `PATCH /clips/:id { tag: "highlight" }`.
- Backend: UPDATE, dann `if (notion_auto_sync && notion_page_id IS NULL) queueSync(clip)`.
- Gleicher Erfolg-/Fehlerpfad wie oben.

### Re-Sync-Button (per Tag)

- Ruft `POST /clips/sync { session_date }` wie bisher.
- Endpoint syncet nur Clips mit `notion_page_id IS NULL` für das Datum.
- Response unverändert: `{ synced, failed, total }`.

### Sync-Queue

In `notion-sync.ts`:
- In-Memory-Queue mit `concurrency = 3`.
- Jeder `queueSync(clip)`-Call reiht ein.
- Bei `429` einmal 500ms warten, dann retry; bei erneutem 429 oder anderem Fehler → `failed`.
- Queue-State wird nicht persistiert (Neustart → Clips bleiben mit `notion_page_id=NULL`, manueller Re-Sync).

## DB-Migration v11 → v12

In `src/server/db/index.ts` an die bestehende Migration-Logik anhängen:

```ts
if (currentVersion < 12) {
  db.exec("ALTER TABLE clips ADD COLUMN notion_page_id TEXT");
  db.pragma("user_version = 12");
  console.log("[DB] Migrated from v11 to v12: added notion_page_id to clips");
}
```

Keine Backfill-Logik — existierende Clips bleiben `NULL` und können per Re-Sync-Button in Notion angelegt werden.

## Shared-Types

In `src/shared/types.ts`:

```ts
export interface Clip {
  // ... bestehende Felder
  notion_page_id?: string | null;
}

export interface NotionDatabase {
  id: string;
  title: string;
  icon: string | null;  // emoji oder URL
  url: string;
  missing_properties: string[];
}

export interface NotionPage {
  id: string;
  title: string;
  icon: string | null;
  url: string;
}

export type NotionDatabaseCheck =
  | { ok: true }
  | { ok: false; missing_properties: string[] }
  | { ok: false; error: "token_invalid" | "db_gone" | "no_db" };
```

## Edge-Cases

| Szenario | Verhalten |
|----------|-----------|
| Token ungültig (401) | `check` → `error:"token_invalid"`; Picker zeigt "Token prüfen" mit Link; Auto-Sync deaktiviert sich faktisch weil Sync fehlschlägt |
| DB in Notion gelöscht | Sync → 404; `notion_page_id` bleibt NULL; Badge `⚠️`; `check` → `error:"db_gone"`; Picker zeigt "Datenbank nicht mehr verfügbar" |
| DB-Schema fehlerhaft | `check` → `missing_properties`; Picker bietet "🔧 Reparieren"; Sync schlägt mit Fehler fehl bis repariert |
| Notion offline / Timeout | 1 Retry mit Backoff, dann `failed`; Re-Sync-Button funktioniert |
| Parent-Page nicht mehr zugreifbar | Create → 403; Toast "Seite nicht mehr zugreifbar"; Picker lädt Pages neu |
| Integration hat keinen Zugriff auf alte DB (nach Reset der Integration in Notion) | Sync-Requests scheitern; `check` → `db_gone`; User wird zum Re-Picking geleitet |
| Clip wird gelöscht während Sync läuft | Sync-Result wird ignoriert, falls Clip nicht mehr existiert (UPDATE betrifft 0 Rows) |
| Zwei gleichzeitige Syncs desselben Clips | Queue garantiert nur einen in-flight-Call pro Clip-ID (Dedup per ID) |

## i18n-Keys (neu)

```ts
'notion.picker.title': { de: 'Wähle deine Clip-Datenbank', en: 'Pick your clip database' }
'notion.picker.create': { de: 'Neue Datenbank für mich erstellen', en: 'Create a new database for me' }
'notion.picker.refresh': { de: 'Erneut suchen', en: 'Refresh' }
'notion.picker.manual': { de: 'Manuell: ID oder URL einfügen', en: 'Manual: paste ID or URL' }
'notion.picker.ready': { de: 'Datenbank bereit', en: 'Database ready' }
'notion.picker.schema_ok': { de: 'Schema: alle Properties OK', en: 'Schema: all properties OK' }
'notion.picker.schema_fix': { de: '{n} Properties fehlen — Reparieren', en: '{n} properties missing — Fix' }
// {n} wird im Component via String.replace('{n}', String(missing.length)) interpoliert — Projekt hat keine Helper-Library für i18n-Interpolation.
'notion.picker.other': { de: 'Andere wählen', en: 'Pick another' }
'notion.picker.open_in_notion': { de: 'DB in Notion öffnen', en: 'Open DB in Notion' }
'notion.picker.empty_title': { de: 'Noch keine Datenbank erreichbar', en: 'No databases reachable yet' }
'notion.picker.empty_help_1': { de: 'Öffne eine Seite in Notion', en: 'Open any page in Notion' }
'notion.picker.empty_help_2': { de: '"..." → "Add connections"', en: '"..." → "Add connections"' }
'notion.picker.empty_help_3': { de: 'Wähle deine Stream-Toolkit-Integration', en: 'Pick your Stream Toolkit integration' }
'notion.picker.create_name': { de: 'Name', en: 'Name' }
'notion.picker.create_parent': { de: 'Unter welcher Notion-Seite?', en: 'Under which Notion page?' }
'notion.picker.create_button': { de: 'Erstellen', en: 'Create' }
'notion.picker.create_cancel': { de: 'Abbrechen', en: 'Cancel' }
'notion.picker.error_token': { de: 'Token ungültig — bitte prüfen', en: 'Token invalid — please check' }
'notion.picker.error_db_gone': { de: 'Datenbank nicht mehr verfügbar', en: 'Database no longer available' }
'clips.auto_sync': { de: 'Auto-Sync', en: 'Auto-sync' }
'clips.auto_sync_on': { de: 'An', en: 'On' }
'clips.auto_sync_off': { de: 'Aus', en: 'Off' }
'clips.re_sync': { de: 'Re-Sync', en: 'Re-sync' }
'clips.sync_status.pending': { de: 'Wartet auf Sync', en: 'Waiting for sync' }
'clips.sync_status.syncing': { de: 'Synchronisiert...', en: 'Syncing...' }
'clips.sync_status.synced': { de: 'In Notion — klicken zum Öffnen', en: 'In Notion — click to open' }
'clips.sync_status.failed': { de: 'Sync fehlgeschlagen — klicken für Retry', en: 'Sync failed — click to retry' }
```

Bestehende `notion.step1` … `notion.step6` werden entfernt (durch den Picker obsolet).

## Verifikation

Projekt hat keine Auto-Tests. Verifikation erfolgt per:

1. `npm run typecheck` — muss durchgehen.
2. `npm run lint` — muss sauber sein.
3. **Manuelle QA-Pfade** (in `npm run dev`):
   - Onboarding-Flow: frisches Profil → NotionStep → Token eingeben → Liste wird angezeigt → DB anklicken → "Ready".
   - Create-Flow: Token eingeben → "Neue erstellen" → Page auswählen → "Erstellen" → DB in Notion prüfen (alle 6 Properties vorhanden).
   - Heal-Flow: DB in Notion mit fehlenden Properties anlegen → in App auswählen → "Reparieren" drücken → Properties in Notion prüfen.
   - Settings-Picker: gleiches Verhalten wie im Onboarding.
   - Auto-Sync: Clip hinzufügen → Badge geht `⋯` → `✅`, Clip in Notion sichtbar.
   - Auto-Clip-Confirm: Auto-Clip triggern (Chat-Spike oder via Bot-Command) → ✓ klicken → Badge geht auf `✅`.
   - Re-Sync-Button: Clip manuell erstellen bei offline-Zustand → Sync failt → Netz wieder an → Re-Sync-Button drücken → Badge auf `✅`.
   - Toggle: Auto-Sync abschalten → neuer Clip bleibt bei `⋯` → Re-Sync-Button funktioniert.
   - Token-Invalid: Token in Settings auf Müll setzen → Picker zeigt Fehler, Sync schlägt fehl, Badge `⚠️`.
   - DB gelöscht: DB in Notion löschen → nächster Sync failt, `check` meldet `db_gone`.
   - i18n: DE und EN beide durchklicken.
   - Empty-DB Edge: frische DB ohne Clips → Panel zeigt passenden Empty-State.

## Offene Punkte

Keine — alle Entscheidungen sind im Spec festgelegt.

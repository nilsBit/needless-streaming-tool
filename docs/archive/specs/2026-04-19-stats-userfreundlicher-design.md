# Stats-Panel userfreundlicher — Design

**Datum:** 2026-04-19
**Status:** Approved
**Scope:** Redesign des `StatsPanel` + `/api/stats` Response + CSS + Live-Update-Hook

## Problem

Die aktuelle Stats-Ansicht zeigt 10 flache Zahlen-Kacheln ohne Kontext, Gruppierung oder Zeitbezug. Es fehlen CSS-Regeln für `.stats-grid` / `.stat-card`, daher rendert das Panel ungestylt. Schmerzpunkte des Users:

- Sieht ungestylt aus.
- Rohe Zahlen ohne Vergleich sind wenig aussagekräftig.
- Kein Zeitbezug — keine Veränderung über Zeit erkennbar.
- Zusammengehörende Zahlen (z.B. `done_todos` + `total_todos`) sind als getrennte Kacheln dargestellt.

Die bestehende Metrik-Auswahl ist grundsätzlich richtig, nur Präsentation und Kontext fehlen. Das Panel soll in drei Nutzungskontexten funktionieren: während des Streams (Live-Counter), nach dem Stream (Session-Review), zwischen Streams (Trend).

## Zielbild

Gewählter Ansatz: **Hero + Fortschritt + Trend** — drei gestaffelte Bereiche ohne Modus-Schalter. Jeder Bereich bedient einen der drei Nutzungskontexte implizit. Keine Schema-Änderungen nötig — alle Tabellen haben `created_at`, `clips` zusätzlich `session_date`, `milestones` zusätzlich `completed_at`.

## Architektur

```
StatsPanel (renderer)
   │
   ├─ fetch GET /api/stats          (initial + on 'stats:dirty')
   │
   └─ WebSocket listener 'stats:dirty' → throttled refetch (max 1× / 2s)

server/api/stats.ts (backend)
   │
   ├─ GET /              → aggregierte Stats (neue geschachtelte Shape)
   │
   └─ nach write ops auf clips/todos/issues/milestones/raids/rewards:
        broadcast({ type: 'stats:dirty' })
```

## Karten-Inhalte

### Bereich „Heute" (4 Hero-Karten)

Große Karten mit Delta-Pill rechts oben.

| Icon | Zahl                           | Delta                   |
| ---- | ------------------------------ | ----------------------- |
| 🎬   | Clips heute                    | vs. gestern             |
| ✅   | Todos erledigt heute           | vs. 7-Tages-Durchschnitt |
| ⚠️   | Neue Issues heute              | vs. gestern             |
| 🏆   | Milestones erreicht heute      | vs. gestern             |

„Erledigt heute" für Todos wird aus `todos.done = 1 AND created_at >= today` abgeleitet. Falls dadurch die Metrik ungenau ist (Todo könnte viel früher erstellt und heute erst abgehakt worden sein), dokumentieren wir das akzeptiert — ein neues `completed_at`-Feld auf `todos` ist außerhalb des Scopes.

### Bereich „Fortschritt" (3 Compound-Karten)

Jede Karte: `done / total`, Progress-Bar, Prozentzahl.

| Icon | Darstellung                                            |
| ---- | ------------------------------------------------------ |
| 📝   | Todos `done / total` + orange Bar + %                  |
| 🎯   | Milestones `completed / total` + orange Bar + %        |
| ⚠️   | Issues `offen / gesamt` + invertierte Bar (wenig = grün, viel = rot) |

### Bereich „Gesamt & Trend" (4 Karten mit 14-Tage-Sparkline)

| Icon | Wert                                           |
| ---- | ---------------------------------------------- |
| 🎬   | Clips gesamt                                   |
| ⚔️   | Raids gesamt                                   |
| 🎁   | Rewards gesamt                                 |
| 📅   | Aktive Stream-Tage (letzte 30, distinct `clips.session_date`) |

**Entfernte Kacheln** gegenüber heute: `total_todos`, `total_milestones` — sind nun in den Progress-Karten absorbiert.

## API

### Neue Response-Shape von `GET /api/stats`

```ts
interface Stats {
  today: {
    clips: number;
    delta_clips: number;       // today - yesterday
    todos_done: number;
    delta_todos: number;       // today - avg(last 7 days)
    new_issues: number;
    delta_issues: number;      // today - yesterday
    milestones: number;
    delta_milestones: number;  // today - yesterday
  };
  progress: {
    todos:      { done: number; total: number };
    milestones: { completed: number; total: number };
    issues:     { open: number; total: number };
  };
  totals: {
    clips: number;
    raids: number;
    rewards: number;
    active_days_30d: number;
  };
  trends: {
    clips:   number[];   // genau 14 Einträge, älteste zuerst
    raids:   number[];
    rewards: number[];
    active:  number[];   // 1 wenn Tag ≥ 1 clip hatte (Stream-Tag), sonst 0
  };
}
```

### Implementierungs-Hinweise

- Alles bleibt in `src/server/api/stats.ts`, keine neuen Endpoints.
- Delta-Berechnungen per SQL-Subqueries (eine Query mit mehreren `SELECT ... AS delta_x`).
- Trends: eine Query pro Entität mit `GROUP BY strftime('%Y-%m-%d', created_at)` für die letzten 14 Tage, JS füllt fehlende Tage mit `0` damit jedes Array exakt 14 Einträge hat.
- `active_days_30d`: `SELECT COUNT(DISTINCT session_date) FROM clips WHERE session_date >= date('now', '-30 days')`.
- `trends.active`: über die letzten 14 Tage, pro Tag `1` falls `EXISTS(SELECT 1 FROM clips WHERE session_date = day)`, sonst `0`.

### Shared Type

`src/shared/types.ts`: `Stats` interface wird auf die neue geschachtelte Shape umgestellt. Alte flache Keys (`total_clips`, `today_clips`, `total_issues`, …) entfallen — es gibt aktuell nur einen Consumer (`StatsPanel`), also kein Backwards-Compat nötig.

## Live-Updates

Bestehender WebSocket-Kanal wird reused.

**Broadcast-Punkte** (Server): nach `POST` / `PATCH` / `DELETE` auf den sechs relevanten Entitäten broadcastet der Server `{ type: 'stats:dirty' }`. Zentrale Helper-Funktion `markStatsDirty()` wird aus den jeweiligen Route-Handlern aufgerufen.

**Listener** (Renderer): `StatsPanel` registriert einen WebSocket-Listener. Bei `stats:dirty` wird ein Refetch getriggert, throttled auf maximal eine Anfrage pro 2 Sekunden (damit Burst-Mutationen nicht 10× fetchen).

**Panel collapsed**: Refetch läuft auch im collapsed-Zustand weiter — Kosten trivial, und beim Aufklappen sind die Zahlen sonst stale.

**Verworfene Alternative**: 5s-Polling — einfacher zu implementieren, aber unnötiger Traffic und spürbar laggy beim „Clip wurde erstellt"-Moment.

## Styling

Konsistent mit bestehendem Dark-Theme, Orange-Akzent `#e67e22`.

### Layout

- Drei Bereiche vertikal, jeder mit `<h3>`-Header (`Heute` / `Fortschritt` / `Gesamt & Trend`).
- CSS Grid: `repeat(auto-fill, minmax(140px, 1fr))`, bei Hero-Bereich `minmax(180px, 1fr)`.

### Karten

- Hintergrund `#1a1a1a`, Border `1px solid #2a2a2a`, Radius `6px`, Padding `10px`.
- Icon oben (`24px`), Zahl darunter (`28px` normal / `36px` Hero, `font-weight: 700`), Label `#888` darunter.
- Delta-Pill rechts oben: `▲ +N` grün (`#2ecc71`), `▼ −N` rot (`#e74c3c`), `0` grau (`#666`), `11px`.

### Progress-Bar

- Horizontal, `6px` Höhe, Hintergrund `#2a2a2a`, Füllung `#e67e22`.
- „Issues offen" invertiert: Farbe interpoliert grün → rot je nach Anteil offener Issues (`open/total`).

### Sparkline

- Inline SVG, `80×24px`, 14 Punkte, Stroke `#e67e22 2px` ohne Fill, rounded joins.
- Kein Tooltip, keine Achsen — reines Dekor-Glyph.

### i18n

- Neue Labels in `translations.ts` für `de` und `en`. Key-Schema:
  `stats.section.today`, `stats.section.progress`, `stats.section.totals`,
  `stats.today.clips`, `stats.today.todos_done`, `stats.today.new_issues`, `stats.today.milestones`,
  `stats.progress.todos`, `stats.progress.milestones`, `stats.progress.issues`,
  `stats.totals.clips`, `stats.totals.raids`, `stats.totals.rewards`, `stats.totals.active_days`,
  `stats.delta.vs_yesterday`, `stats.delta.vs_7d_avg`.
- Alte Keys `stats.total_todos`, `stats.total_milestones` entfernen.

## Testing

Manuell, da es keine Test-Suite im Projekt gibt:

- App starten, StatsPanel öffnen — alle drei Bereiche rendern, Zahlen stimmen mit DB überein.
- Clip/Todo/Issue/Milestone/Raid/Reward anlegen → Panel aktualisiert sich innerhalb 2s ohne Refresh.
- 10 Clips schnell hintereinander erstellen → nicht mehr als 5 Fetches auslösen (Throttle greift).
- Bei leerer DB: Sparklines rendern als flache Linie (14× `0`), Deltas sind `0`.
- Sprache umschalten DE↔EN → alle Labels wechseln.

## Offene Punkte / Out of Scope

- Kein neues `completed_at`-Feld auf `todos` — „Todos erledigt heute" ist approximativ (verwendet `created_at`).
- Keine Per-Session-Definition (kein `is_live`-Zeitraum-basiertes Fenster) — „heute" = Kalendertag, lokale Zeitzone.
- Keine Export-Funktion, keine Filter-UI, keine Drill-Down-Views.

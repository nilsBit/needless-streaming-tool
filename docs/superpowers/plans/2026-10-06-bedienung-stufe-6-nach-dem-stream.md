# Bedienung neu aufbauen — Stufe 6: Nach dem Stream, Einstellungen, Hilfe — Implementation Plan

> Gebaut am 06.10.2026 als letzte Stufe des Umbaus. Enthält die eine neue Funktion des Umbaus: das Content-Planungsbrett (#26).

**Goal:** „Nach dem Stream“ ist der Ort, an dem aus Momenten Content wird: ein Brett mit vier Schritten, Karten mit Plattform, Termin und Hook, ein Archiv. Die Statistik beginnt mit einem Satz. Kanalpunkte sind eine Rangliste je Zuschauer neben einem Verlauf in Sätzen. Einstellungen und Tastenkürzel sprechen Deutsch und kommen ohne Symbole aus. Die Hilfe erklärt das Brett.

**Architecture:** Die Tabelle `clips` trägt seit Schema v25 `status` (new · planned · cut · published), `platforms` (JSON-Liste), `planned_for`, `published_at`, `hook`, `archived_at`; `ensureColumns` ergänzt sie auch in einer Datenbank, die die Migration verpasst hat. `PATCH /api/clips/:id` nimmt die neuen Felder und prüft sie; `POST /api/clips` mit `idea: true` legt eine Idee ohne Zeitmarken an; `POST /api/clips/archive-run` tut, was der Server beim Start und alle sechs Stunden tut – Veröffentlichtes nach 30 Tagen archivieren. `GET /api/reward-stats/breakdown` liefert jeden Zuschauer mit jeder Belohnung; die Rangliste entsteht im Renderer.

**Spec:** `docs/superpowers/specs/2026-10-05-bedienung-neuaufbau-design.md`, Abschnitt „Nach dem Stream“. Issue: #26.

## Dateien

| Datei | Aufgabe |
|---|---|
| `src/server/db/schema.ts`, `db/index.ts` | **Ändern.** v25: sechs Spalten an `clips`, auch über `ensureColumns`. |
| `src/shared/types.ts` | **Ändern.** `Clip` mit Brett-Feldern, `ClipStatus`, `CLIP_STATUSES`. |
| `src/server/api/clips.ts` | **Neu geschrieben.** Filter `status`/`archived`, Ideen, PATCH mit Prüfung, Archiv-Lauf; Export, Notion-Sync und Löschen wie zuvor. |
| `src/server/index.ts` | **Ändern.** Archiv-Lauf beim Start und alle sechs Stunden. |
| `src/server/api/reward-stats.ts` | **Ändern.** `GET /breakdown`. |
| `src/server/__tests__/clips-board.test.ts` | **Neu.** Brett über HTTP: Schritte, Plattformen, Termin, Hook, Idee, Archiv, Auto-Moment behalten; Aufschlüsselung der Kanalpunkte. |
| `src/renderer/src/panels/ClipsPanel.tsx` | **Neu geschrieben.** Das Brett: vier Spalten, Karten (Titel, Datum · Minute · Schlagwort, ab Geplant Plattformen und Termin), Ziehen, Dialog, „+ Idee“, Auto-Momente behalten/verwerfen, Archiv, CSV für DaVinci je Stream-Tag, Notion. |
| `src/renderer/src/panels/StatsPanel.tsx` | **Neu geschrieben.** Satz zuerst, dann Heute, Stand der Listen, Gesamt und Verlauf – deutsch, ohne Symbole. |
| `src/renderer/src/panels/RewardStatsPanel.tsx` | **Neu geschrieben.** Rangliste je Zuschauer mit Aufschlüsselung, Verlauf in Sätzen, Suche, Filter, Dialoge „Bearbeiten“ und „Eintrag von Hand“. |
| `src/renderer/src/panels/SettingsPanel.tsx`, `HotkeysPanel.tsx` | **Ändern.** Keine Symbole, deutsche Wörter (Erscheinungsbild, Mit dem Rechner starten, Sicherung, Sync-Ordner, Tastenkürzel benannt nach dem, was sie tun). |
| `src/renderer/src/docs/help-de.ts` | **Ändern.** Abschnitt „Content planen“. |
| `src/renderer/src/index.css` | **Ändern.** `.board-*`, `.stats-sentence`, `.rewards-*`. |

## Tasks

- [x] Schema, Typ, API, Archiv-Lauf, Aufschlüsselung; Tests an der HTTP-Naht.
- [x] Brett mit Dialog, Ziehen, Ideen, Archiv; Auto-Momente; DaVinci und Notion bleiben erreichbar.
- [x] Statistik mit Satz; Kanalpunkte als Rangliste und Verlauf.
- [x] Einstellungen und Tastenkürzel ohne Symbole, deutsch.
- [x] Hilfe: „Content planen“.
- [x] Typecheck, Tests, Lint; Durchlauf; alle Seiten und Dialoge in Chrome fotografiert.
- [ ] Am Windows-Rechner: die alten Test-Momente in „Neu“ verwerfen (die Mac-Datenbank hatte 36), einen echten Moment durch alle vier Schritte schieben, Ziehen mit der Maus prüfen.

## Bewusst nicht in dieser Stufe

Ein Knopf „Twitch-Clip öffnen“ (im Prototyp vorgesehen): das Tool speichert keinen Twitch-Clip-Link zu einem Moment, nur die Zeitmarken. Die Plattform-Liste ist fest (TikTok, Shorts, Reels, Discord, Twitch-Clip); eigene Plattformen kämen über die Einstellungen. Hochladen, Terminieren, Kalender – nichts davon (siehe #26).

# Einrichtung beim ersten Start — Implementation Plan

> Gebaut am 06.10.2026, direkt nach dem Umbau der Bedienung. Spec: `docs/superpowers/specs/2026-10-06-einrichtung-design.md`. Prototyp: Claude-Design-Leinwand „NST Einrichtung“.

**Goal:** Wer das Tool frisch installiert, wird gefragt, was sein Stream können soll, verbindet nur das Nötige, bekommt die Browserquellen in OBS angelegt und sieht zum Schluss, was steht. Die App zeigt danach nur die gewählten Funktionen. Nils' persönliche Welt-Funktionen erscheinen nur, wo der Worldbuilder eingerichtet ist.

**Architecture:** `src/shared/features.ts` ist die eine Tabelle: achtzehn Funktionen mit Gruppe, Satz, Verbindungen, Overlays, eingebauten Befehlen, Panels, Tastenkürzeln und Prüfpunkten – dazu die reinen Fragen `panelVisible`, `commandVisible`, `overlayVisible`, `hotkeyVisible`, `readinessVisible`, `connectionsNeeded`, `overlaysOf`. Der Server speichert die Auswahl als JSON unter `features` (`src/server/features.ts`); fehlt sie, ist alles an. Die Oberfläche hält sie im `FeaturesContext` und filtert damit Navigation (`visibleNavigation`), Karten, Overlay-Liste, Tastenkürzel, OBS-Panel und Verbindungsmarken. Die Einrichtung selbst ist eine Seite (`SetupPage`) mit vier Schritt-Bausteinen, die die Shell statt der Seitenleiste zeigt, solange `setup_done` fehlt oder sie aus den Einstellungen geöffnet wurde.

## Dateien

| Datei | Aufgabe |
|---|---|
| `src/shared/features.ts` | **Neu.** Die Funktionstabelle und die reinen Sichtbarkeitsfragen. |
| `src/server/features.ts` | **Neu.** Auswahl lesen und speichern, `setup_done`, Worldbuilder eingerichtet (Anschlussdatei oder gewählte Quelle), `commandEnabled`. |
| `src/server/api/setup.ts` | **Neu.** `GET /api/setup`, `POST /api/setup/features`, `POST /api/setup/done`. |
| `src/server/obs/place-overlay.ts`, `obs/index.ts`, `api/obs.ts` | **Neu / ändern.** `placeOverlay` (rein, mit Stand-in testbar), `placeOverlayNow`, `POST /api/obs/place-overlay`. |
| `src/server/db/schema.ts`, `db/index.ts` | **Ändern.** v26: bestehende Datenbank → `setup_done`, alle Funktionen an. |
| `src/server/overlays/catalog.ts`, `readiness.ts`, `bot/commands.ts`, `bot/command-list.ts` | **Ändern.** `feature` je Overlay; Prüfpunkte nach Auswahl; eingebaute Befehle ausgeschalteter Funktionen schweigen und fehlen in `!befehle`. |
| `src/server/__tests__/setup.test.ts`, `obs-place-overlay.test.ts`, `readiness.test.ts` | **Neu / ändern.** Einrichtung über HTTP; Platzierung gegen das OBS-Stand-in; Bereitschaft ohne Worldbuilder. |
| `src/renderer/src/contexts/FeaturesContext.tsx` | **Neu.** `useFeatures()`: Auswahl, `isOn`, `panelVisible`, `save`, `finish`, `openSetup`. |
| `src/renderer/src/navigation.ts`, `__tests__/navigation.test.ts` | **Ändern.** `visibleNavigation(on)`; Test mit Vorauswahl, nichts, allem. |
| `src/renderer/src/pages/SetupPage.tsx`, `components/setup/{FeaturesStep,ConnectionsStep,ObsStep,FinishStep}.tsx` | **Neu.** Die vier Schritte. |
| `src/renderer/src/components/settings/ConnectionCards.tsx` | **Neu.** Die Verbindungskarten aus `SettingsPanel` herausgelöst, mit `only` für die Einrichtung; Worldbuilder-Karte dazu. |
| `src/renderer/src/components/settings/FeaturesCard.tsx` | **Neu.** „Was dein Stream kann“ unter Programm. |
| `Shell.tsx`, `App.tsx`, `pages/StreamPage.tsx`, `panels/{OverlaysPanel,HotkeysPanel,ObsPanel,SettingsPanel}.tsx`, `components/ux/ConnectionMarks.tsx` | **Ändern.** Einrichtung statt Seitenleiste; Filter nach Auswahl. |
| `src/renderer/src/docs/help-de.ts`, `index.css` | **Ändern.** Abschnitt „Einrichtung: Was dein Stream kann“; `.setup-*`, `.feature-*`, `.obs-row*`. |

## Tasks

- [x] Stufe 1, Server: Tabelle, Speicherung, Routen, Katalog, Bereitschaft, Befehle, Platzierung; Tests.
- [x] Stufe 2, Oberfläche: Kontext, Navigation, vier Schritte, Verbindungskarten, Karte in den Einstellungen, Filter, Hilfe.
- [x] Typecheck, Tests, Lint; Durchlauf mit 23 Panels; alle vier Schritte und die Einstellungen in Chrome fotografiert; Erststart gegen die laufende App geprüft.
- [ ] Am Windows-Rechner: pullen, mit OBS verbunden Schritt 3 einmal gegen eine Testszene laufen lassen („In OBS anlegen“ legt `NST <Name>` an), danach die Quellen in OBS prüfen.

## Entscheidungen beim Bauen

- **`POST` statt `PUT` fürs Speichern.** Die CORS-Liste des Servers kennt kein `PUT`; die Oberfläche kam nicht durch. Ein `POST` auf dieselbe Adresse tut dasselbe.
- **Worldbuilder „eingerichtet“ heißt: Anschlussdatei da oder als Quelle gewählt.** Die Datei schreibt der Worldbuilder nur, solange er läuft; auf dem Mac gab es sie nicht, und Nils' Welt-Funktionen wären verschwunden. Die gewählte Quelle bleibt.
- **Ohne gespeicherte Auswahl ist alles an**, nicht die Vorauswahl. Wer die Einrichtung überspringt, sieht die ganze App wie bisher; die Tests laufen mit frischer Datenbank und erwarten alles.

## Bewusst nicht in dieser Stufe

Belohnungen in Twitch anlegen (#24). Tastenkürzel im Hauptprozess abschalten. Eine Zählung „2 von 3 verbunden“ in Schritt 2 – die Karten zeigen es je einzeln.

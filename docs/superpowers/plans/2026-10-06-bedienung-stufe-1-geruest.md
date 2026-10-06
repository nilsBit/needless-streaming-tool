# Bedienung neu aufbauen — Stufe 1: Gerüst — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nach dieser Stufe ist alles im Tool auffindbar: eine feste Leiste links mit sieben Bereichen nach Situation, eine Kopfzeile je Seite mit einem Satz, Unterreiter, deutsche Namen – und jedes heutige Panel steht an genau einem neuen Ort. Das Brett (Verschieben, Anpinnen, Ausblenden, Einklappen, Leiste „Ausgeblendet“) ist weg. Die Panels selbst sehen innen noch aus wie heute; das ändern die Stufen 2–6.

**Architecture:** `navigation.ts` ist die eine Quelle für Bereiche, Unterreiter, Namen und Sätze (reine Daten, ohne React, deshalb in Node testbar). `panelRegistry.tsx` bildet Panel-Schlüssel auf Komponenten ab. `Shell.tsx` rendert Leiste, Kopfzeile, Unterreiter und die Seite; `AreaPage.tsx` rendert die Panels eines Unterreiters untereinander; `StartPage.tsx` zeigt vorerst nur die Bereichskarten (Zustandsmarken und Prüfliste kommen in Stufe 2). `App.tsx` schrumpft auf Shell plus Update-Hinweis. Der heutige Settings-Reiter „Features“ wird in drei Bausteine zerlegt, weil seine Teile in drei Bereiche wandern.

**Tech Stack:** React + TypeScript (Renderer, Vite), vitest (Node-Umgebung, läuft in Electron per `ELECTRON_RUN_AS_NODE=1`), playwright-core mit lokalem Chrome für den Durchlauf gegen das laufende Tool.

**Spec:** `docs/superpowers/specs/2026-10-05-bedienung-neuaufbau-design.md` (freigegeben am 06.10.2026). Klickbarer Prototyp: https://claude.ai/artifact/5Nw7Ci85coRGA526iNv8u7

## Global Constraints

- Code, Kommentare, Commits auf **Englisch** (`CLAUDE.md`); alles, was der Nutzer liest, auf **Deutsch** mit echten Umlauten.
- Renderer-Komponenten sind bewusst **ungetestet** (`CLAUDE.md`). Die einzige Ausnahme dieser Stufe ist `navigation.ts`: reine Daten, Test in Node – mit Nils in der Spezifikation vereinbart. Kein Rendering-Test, kein jsdom.
- Server-Tests bleiben an der einen Naht (HTTP). Diese Stufe ändert am Server nichts außer dem optionalen Skript aus Task 8.
- Vor jedem Commit einzeln, Exit-Code je Befehl prüfen: `npm run typecheck`, `npm test`, `npm run lint`. In zsh den Code mit `$?` abholen, nicht auf `set -e` verlassen.
- **Dev-Server nicht starten, wenn 4000 oder 5273 belegt sind**; nie laufende Prozesse beenden. Der Renderer lädt per Vite-HMR neu; Änderungen unter `src/server`/`src/main` starten Electron neu, deshalb gebündelt speichern.
- `npm run build*` / `electron-builder` nicht aufrufen.
- Nichts sendet etwas an OBS oder in den Stream.
- Commits lokal; **Push nur nach Rückfrage bei Nils.**
- Funktionen bleiben, wie sie sind. Diese Stufe verschiebt und benennt um; sie baut nichts Neues außer der Startseite mit Bereichskarten.
- Begriffe aus `CONTEXT.md` verwenden; neue Begriffe dort eintragen: **Bereich** (einer der sieben Einträge der Leiste), **Unterreiter**, **Seite**.

## Wohin was wandert

| Bereich | Unterreiter (Stufe 1) | Panels / Bausteine |
|---|---|---|
| **Start** | — | `StartPage` (Bereichskarten aus `navigation.ts`) |
| **Im Stream** | — | ChallengePanel, IssuesPanel, DesignsPanel, ProgressPanel, SongPanel, WorldPanel |
| **Chat & Bot** | Befehle · Von selbst | TextCommandsPanel · `ChatBotSettings` (Erinnerung, Pause für eingebaute Befehle, Shoutout – heute Settings → Features → Chat Commands) |
| **Overlays & Alerts** | Overlays · Alerts · Meilensteine · Szenen in OBS | OverlaysPanel (mit seinen inneren Reitern Design/Figma, Aufteilung in Stufe 5) · AlertSettings · MilestonesPanel · ObsPanel |
| **Nach dem Stream** | Content planen · Statistik · Kanalpunkte | ClipsPanel + `AutoClipsSettings` (heute Settings → Features → Auto-Clips) · StatsPanel · RewardStatsPanel |
| **Einstellungen** | Verbindungen · Programm · Daten | SettingsPanel ohne „Features“, je Kategorie ein Unterreiter; HotkeysPanel unter Programm, falls es funktioniert (siehe Task 4) |
| **Hilfe** | — | HelpPanel |

Namen laut Spezifikation: Challenge → Ziel für heute, Progress Tracker → Fortschritt, Now Playing → Musik, Clip Moments → Content planen, Reward Stats → Kanalpunkte, Milestones → Meilensteine, OBS Scenes → Szenen in OBS, Erklär-Commands → Befehle, Settings → Einstellungen, App → Programm, Daten & API → Daten, Abstimmungen bleibt, Glücksrad bleibt, Welt → Eintrag aus der Welt. Die Chat-Befehle selbst (`!challenge`, `!progress` …) ändern sich nicht.

## Dateien

| Datei | Aufgabe |
|---|---|
| `src/renderer/src/navigation.ts` | **Neu.** Bereiche, Unterreiter, Namen, Sätze, Stichworte, Panel-Schlüssel. Reine Daten. |
| `src/renderer/src/panelKeys.ts` | **Neu.** Die Liste aller Panel-Schlüssel als `const`-Array (ohne React), damit der Test sie kennt. |
| `src/renderer/src/panelRegistry.tsx` | **Neu.** Panel-Schlüssel → Komponente. |
| `src/renderer/src/Shell.tsx` | **Neu.** Leiste, Kopfzeile, Unterreiter, Seite; merkt Bereich und Unterreiter in `localStorage`. |
| `src/renderer/src/pages/AreaPage.tsx` | **Neu.** Panels eines Unterreiters untereinander, je in `ErrorBoundary`. |
| `src/renderer/src/pages/StartPage.tsx` | **Neu.** Bereichskarten (Name, Satz, Stichworte, Knopf „Öffnen“). |
| `src/renderer/src/components/ux/PageHeader.tsx`, `SubTabs.tsx` | **Neu.** Gemeinsame Bausteine (Wörter statt Symbole). |
| `src/renderer/src/components/settings/ChatBotSettings.tsx` | **Neu.** Aus SettingsPanel „Features“ herausgelöst: Erinnerung, Pause eingebaute Befehle, Shoutout. |
| `src/renderer/src/components/settings/AutoClipsSettings.tsx` | **Neu.** Aus SettingsPanel „Features“ herausgelöst: Auto-Clips. |
| `src/renderer/src/panels/SettingsPanel.tsx` | **Ändern.** Kategorie „Features“ entfernt; nimmt die Kategorie als Prop statt eigener innerer Reiter. |
| `src/renderer/src/panels/*.tsx` (16 Panels) | **Ändern.** Die erste `<h2>`-Kopfzeile mit Symbol entfällt – die Seite trägt den Namen. |
| `src/renderer/src/App.tsx` | **Ändern.** Verliert `AREAS`/`TABS`, Brett, Drag & Drop, Leiste „Ausgeblendet“; rendert `Shell`. |
| `src/renderer/src/hooks/useDashboardLayout.ts` | **Löschen.** |
| `src/renderer/src/panels/HotkeysPanel.tsx` | **Prüfen.** Heute nirgends eingebunden: funktioniert es gegen die heutige API, kommt es unter Einstellungen → Programm; sonst löschen. |
| `src/renderer/src/index.css` | **Ändern.** Neue Regeln für Leiste, Kopfzeile, Unterreiter, Seite, Bereichskarten; alte Regeln für `.area-nav`, `.tab-nav`, `.dashboard-hero-layout`, `.panel-grid`, `.panel-header-bar`, `.drag-handle`, `.pin-btn`, `.hidden-bar*`, `.panel-collapsed-list` raus. |
| `src/renderer/src/__tests__/navigation.test.ts` | **Neu.** Jeder Panel-Schlüssel genau einmal, jeder Bereich hat Inhalt, keine alten Namen. |
| `src/renderer/src/docs/help-de.ts` | **Ändern.** Abschnitt „Dashboard Panels“ raus; neuer Abschnitt „Wo finde ich was“ (alt → neu); Pfade in anderen Abschnitten auf die neuen Wege. |
| `CONTEXT.md` | **Ändern.** Begriffe Bereich, Unterreiter, Seite. |
| `scripts/server-headless.mjs` | **Neu (optional, Task 8).** Startet nur den Server in Electron ohne Fenster – für Durchläufe und Aufnahmen. |
| `scripts/ui-walk.mjs` | **Neu (Task 8).** Öffnet jede Seite im Chrome, zählt Panels, fotografiert nach `design/ui-walk/` (nicht eingecheckt). |

---

### Task 1: `navigation.ts`, `panelKeys.ts` und der Test

**Files:**
- Create: `src/renderer/src/panelKeys.ts`, `src/renderer/src/navigation.ts`
- Test: `src/renderer/src/__tests__/navigation.test.ts`

**Interfaces:**

```ts
// panelKeys.ts — no React here, so the test can import it under Node.
export const PANEL_KEYS = [
  'challenge', 'issues', 'designs', 'progress', 'song', 'world',
  'textcommands', 'chatbot-settings',
  'overlays', 'alerts', 'milestones', 'obs',
  'clips', 'autoclips-settings', 'stats', 'rewardstats',
  'settings-connections', 'settings-app', 'settings-data', 'hotkeys',
  'help',
] as const;
export type PanelKey = (typeof PANEL_KEYS)[number];

// navigation.ts
export interface SubTab { key: string; label: string; sentence: string; panels: PanelKey[] }
export interface Area {
  key: 'start' | 'stream' | 'chat' | 'overlays' | 'after' | 'settings' | 'help';
  label: string;        // „Im Stream“
  sentence: string;     // one sentence for header and start card
  keywords: string[];   // for the start card: „Glücksrad, Abstimmung, Fortschritt …“
  group: 'main' | 'secondary'; // secondary = Einstellungen, Hilfe (below the divider)
  subTabs: SubTab[];    // one entry when the area has no visible sub tabs
}
export const AREAS: Area[];
export function findSubTab(areaKey: string, subKey: string | null): SubTab;
```

**Steps:**
- [ ] `panelKeys.ts` anlegen. `hotkeys` bleibt drin, bis Task 4 entschieden hat; fällt es weg, hier und in `navigation.ts` streichen.
- [ ] `navigation.ts` nach der Tabelle oben füllen. Sätze aus dem Prototyp übernehmen (z. B. Im Stream: „Alles, was du auslöst, während du live bist.“). Keine Emoji in Labels.
- [ ] Test: (a) jeder Schlüssel aus `PANEL_KEYS` kommt in genau einem Unterreiter vor, (b) kein Unterreiter ohne Panel außer `start`, (c) kein Label aus der Verbotsliste `['Settings', 'Progress Tracker', 'Clip Moments', 'Reward Stats', 'Now Playing', 'Challenge', 'Milestones', 'OBS Scenes', 'Live', 'Produktion']`, (d) `findSubTab` fällt auf den ersten Unterreiter zurück, wenn der Schlüssel unbekannt ist.
- [ ] `npm test` – die vitest-Konfiguration findet `src/**/__tests__/**/*.test.ts` bereits, nichts anpassen.

---

### Task 2: Settings → „Features“ zerlegen

**Files:**
- Create: `src/renderer/src/components/settings/ChatBotSettings.tsx`, `src/renderer/src/components/settings/AutoClipsSettings.tsx`
- Modify: `src/renderer/src/panels/SettingsPanel.tsx`

**Steps:**
- [ ] In `SettingsPanel.tsx` den Render- und State-Teil für Erinnerung (`/settings/reminder`), Pause eingebaute Befehle (`/settings/builtin-cooldown`) und Shoutout nach `ChatBotSettings.tsx` ziehen – Verhalten und API-Aufrufe unverändert, nur verschoben. Toasts bleiben.
- [ ] Auto-Clips (`auto_clips_enabled`, `auto_clip_trigger_*`) nach `AutoClipsSettings.tsx` ziehen, gleiches Prinzip.
- [ ] `<AlertSettings />` wird nicht mehr von SettingsPanel gerendert; es ist ein eigener Panel-Schlüssel `alerts`.
- [ ] `SettingsPanel` bekommt `props.category: 'connections' | 'app' | 'data'` und rendert nur diese; die eigene Kategorie-Leiste und `'features'` entfallen. `CATEGORIES` wird zu `'app' → 'Programm'`, `'data' → 'Daten'` nur noch als Überschriften-Text, falls überhaupt noch nötig.
- [ ] Im laufenden Tool prüfen: Erinnerung speichern, Pause ändern, Auto-Clips umschalten – jeweils die Antwort des Servers im Netzwerk-Tab sehen. Kein Test (Renderer).

---

### Task 3: Registry, Shell, Seiten

**Files:**
- Create: `src/renderer/src/panelRegistry.tsx`, `src/renderer/src/Shell.tsx`, `src/renderer/src/pages/AreaPage.tsx`, `src/renderer/src/pages/StartPage.tsx`, `src/renderer/src/components/ux/PageHeader.tsx`, `src/renderer/src/components/ux/SubTabs.tsx`
- Modify: `src/renderer/src/App.tsx`
- Delete: `src/renderer/src/hooks/useDashboardLayout.ts`

**Steps:**
- [ ] `panelRegistry.tsx`: `Record<PanelKey, React.ComponentType>`; `settings-*` zeigen auf `() => <SettingsPanel category="…" />`.
- [ ] `Shell.tsx`: Leiste links (`<nav aria-label="Bereiche">`, Knöpfe mit `aria-current="page"`), Trennlinie vor den `secondary`-Bereichen, Logo oben; rechts `PageHeader` (Label + Satz), darunter `SubTabs` (nur wenn > 1), darunter die Seite. Gemerkt wird `{ area, subTab }` unter `localStorage['nst.navigation']`; die alten Schlüssel `stream_area` und `dashboard-layout` werden beim Start gelöscht.
- [ ] `AreaPage.tsx`: Panels des Unterreiters untereinander, je in `ErrorBoundary` (Fallback wie heute), Klasse `page-panels`.
- [ ] `StartPage.tsx`: eine Karte je Bereich außer Start (Label, Satz, Stichworte, Knopf „Öffnen“ → `onNavigate(area)`). Platz oberhalb für Zustandsmarken und Prüfliste (Stufe 2) lassen, aber nichts davon bauen.
- [ ] `App.tsx`: nur noch Toast-Provider-Nutzung für den Update-Hinweis und `<Shell />`. `AREAS`, `TABS`, Drag-Handler, Hero/Collapsed/Hidden entfernen; `logo.svg` wandert in die Shell.
- [ ] `useDashboardLayout.ts` löschen. `grep -rn "useDashboardLayout\|dashboard-layout\|stream_area" src/` muss leer sein.
- [ ] `npm run typecheck`.

---

### Task 4: Panels ohne Kopfzeile, HotkeysPanel klären

**Files:**
- Modify: alle 16 Dateien unter `src/renderer/src/panels/` sowie `components/AlertSettings.tsx`
- Decide: `src/renderer/src/panels/HotkeysPanel.tsx`

**Steps:**
- [ ] In jedem Panel die erste `<h2>` mit Symbol entfernen (z. B. `<h2>🎬 Clip Moments</h2>`). Nur die Kopfzeile – innere `<h3>` und Texte bleiben. In einer Runde speichern.
- [ ] `HotkeysPanel.tsx`: Welche API ruft es? Existiert sie noch (`grep` im Server)? Ja → unter Einstellungen → Programm einhängen (`hotkeys`). Nein → Datei löschen, Schlüssel aus `panelKeys.ts`/`navigation.ts` streichen, Hilfe-Abschnitt „Tastenkürzel“ prüfen.
- [ ] `npm run lint` (ungenutzte Importe nach dem Entfernen der Kopfzeilen).

---

### Task 5: CSS

**Files:**
- Modify: `src/renderer/src/index.css`

**Steps:**
- [ ] Neue Regeln: `.shell` (Grid: Leiste 220 px | Seite), `.shell-nav`, `.shell-nav-btn[aria-current]` (Akzent `#e67e22`, Rahmen statt Füllung – wie im Prototyp), `.page-header`, `.sub-tabs` (Unterstrich 2 px in Akzentfarbe), `.page-panels` (eine Spalte, Abstand 24 px), `.start-cards` (Raster `auto-fit, minmax(300px, 1fr)`). Farben und Schrift bleiben die heutigen.
- [ ] Alte Regeln entfernen: `.app-header`, `.area-nav`, `.area-btn`, `.tab-nav`, `.tab-btn`, `.dashboard-hero-layout`, `.hero-panel`, `.hero-badge`, `.panel-grid`, `.panel-wrapper`, `.panel-header-bar`, `.panel-header-controls`, `.panel-header-btn`, `.drag-handle`, `.dragging`, `.drag-over`, `.pin-btn`, `.panel-collapse-btn`, `.collapse-icon`, `.collapse-label`, `.panel-collapsed-list`, `.hidden-bar`, `.hidden-bar-label`, `.hidden-bar-btn`. Vorher `grep` im Renderer, dass keine Klasse mehr benutzt wird.
- [ ] Schmales Fenster (unter 900 px): die Leiste wird zur Zeile oben, die Seite darunter – kein horizontales Scrollen. Mit dem Durchlauf aus Task 8 bei 1360 und 900 px prüfen.

---

### Task 6: Hilfe und `CONTEXT.md`

**Files:**
- Modify: `src/renderer/src/docs/help-de.ts`, `CONTEXT.md`

**Steps:**
- [ ] Abschnitt „Dashboard Panels“ (Verschieben, Anpinnen, Ausblenden) entfernen.
- [ ] Neuer Abschnitt „Wo finde ich was“ gleich nach „Erste Schritte“: eine Tabelle alt → neu nach der Tabelle „Wohin was wandert“ oben, in Nutzersprache.
- [ ] Alle Pfade in anderen Abschnitten ersetzen: „Settings → Features → Alerts“ → „Overlays & Alerts → Alerts“, „Projekt → Erklär-Commands“ → „Chat & Bot → Befehle“, „Live → OBS Scenes“ → „Overlays & Alerts → Szenen in OBS“, „Settings → Overlays“ → „Overlays & Alerts → Overlays“, „Settings → Discord“ → „Einstellungen → Verbindungen“, „Projekt → Welt“ → „Im Stream“. `grep -n "Settings →\|Projekt →\|Live →\|Produktion" src/renderer/src/docs/help-de.ts` muss danach leer sein.
- [ ] `CONTEXT.md`: Bereich, Unterreiter, Seite eintragen; „Dashboard“/„Tab“ als veraltet markieren oder streichen.

---

### Task 7: `docs/STAND.md`

**Steps:**
- [ ] Abschnitt „Hier aufgehört“ ergänzen: Stufe 1 gebaut, was wo liegt, was die Stufen 2–6 noch bringen; Hinweis, dass `localStorage`-Layout der alten Oberfläche beim ersten Start gelöscht wird.

---

### Task 8: Durchlauf in Chrome gegen das laufende Tool

**Files:**
- Create: `scripts/server-headless.mjs` (optional), `scripts/ui-walk.mjs`
- Modify: `package.json` (Skripte `server:headless`, `ui:walk`), `.gitignore` (`design/ui-walk/`)

**Steps:**
- [ ] `server-headless.mjs`: startet `dist/server/index.js` in Electron ohne Fenster (`app.whenReady().then(startServer)`), `process.chdir` ins Repo, `NST_DEV=1`; vorher `tsc -p tsconfig.node.json`. Bricht ab, wenn Port 4000 belegt ist. Beendet sich mit SIGINT sauber (der Server löscht `~/.nst/connection.json`).
- [ ] `ui-walk.mjs`: holt das Session-Token aus dem Serverlog bzw. `GET /api/auth/token`-Äquivalent, wie die App es tut; öffnet `http://localhost:5273/#token=…` (Vite) oder die gebaute Renderer-Seite; klickt jeden Bereich und Unterreiter, zählt `.page-panels > *`, schreibt `design/ui-walk/<bereich>-<unterreiter>.png` bei 1360×900 und 900×700. Druckt eine Tabelle Bereich · Unterreiter · Panels.
- [ ] Erwartung: Summe der Panels über alle Seiten = Anzahl `PANEL_KEYS` (ohne `start`), jede Seite öffnet ohne Fehler in der Konsole.
- [ ] Nur lesend. Nichts klicken, was speichert oder sendet (`Im Stream testen`, `Szenen anlegen`, `Speichern`).

---

### Task 9: Abschluss

- [ ] `npm run typecheck && echo ok; npm test > /tmp/test.log 2>&1; echo $?; npm run lint > /tmp/lint.log 2>&1; echo $?`
- [ ] Commit (englisch), z. B. `refactor(ui): navigation by situation — shell, areas, sub tabs; dashboard board removed (stage 1)`.
- [ ] Nils fragen, bevor gepusht wird. Danach auf dem Windows-Rechner: `git pull`, `npm run dev`, einmal durch alle Bereiche klicken.

## Nicht in dieser Stufe

Startseite mit Zustandsmarken und Prüfliste (Stufe 2), die vereinte Befehlsliste mit Filtern und Dialog (Stufe 3), Karten und „im Bild“ (Stufe 4), Overlay-Liste mit Vorschau und OBS-Zustand, Aufteilung von OverlaysPanel in Overlays/Aussehen, Entfernen des Song-Queue-Overlays (Stufe 5), Content-Planungsbrett, Dialog als gemeinsamer Baustein, Hilfe-Feinschliff (Stufe 6).

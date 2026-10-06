# Bedienung neu aufbauen — Stufe 5: Overlays & Alerts — Implementation Plan

> Gebaut am 06.10.2026 nach Stufe 3. Die Bausteine aus den Stufen davor (Dialog, Karten-Stile, Chips) trugen auch hier.

**Goal:** Unter „Overlays & Alerts“ sieht Nils, was es an Overlays gibt, wie jedes aussieht, wo es in OBS liegt und was er damit tun kann – ohne Zeilen voller Symbolknöpfe. Alerts sind Karten mit der Tafel als Vorschau. „Aussehen“ ist ein eigener Unterreiter. Szenenfelder sind Auswahllisten. Das Song-Queue-Overlay ist weg.

**Architecture:** Der Server kennt die Overlays jetzt als **Katalog** (`src/server/overlays/catalog.ts`, `GET /api/overlays/catalog`): deutscher Name, ein Satz, Gruppe, Größe und Vorschau-Zustand aus dem Showcase, und ob die Optik geändert wurde (HTML-Override, eigene Farben, übernommener Figma-Entwurf) – denn nur im Standard-Layout zeigt die Vorschau Beispieldaten. `GET /api/obs/overlay-scenes` sagt je Overlay, in welchen OBS-Szenen eine Browserquelle darauf zeigt (`overlaysByScene`, derselbe Walk wie fürs Sichtbare, auch durch Gruppen und Unterszenen, an oder aus). Die Oberfläche bettet das Overlay als `<iframe>` ein – mit `?state=<Vorschau>` im Standard-Layout, sonst live – und skaliert es in den Kasten.

**Spec:** `docs/superpowers/specs/2026-10-05-bedienung-neuaufbau-design.md`, Abschnitte „Overlays & Alerts → Overlays“ und „→ Alerts“.

## Dateien

| Datei | Aufgabe |
|---|---|
| `src/server/overlays/catalog.ts` | **Neu.** Katalog; Metadaten-Tabelle je Overlay. |
| `src/server/api/custom-overlays.ts` | **Ändern.** `GET /catalog`. |
| `src/server/obs/visible-overlays.ts`, `obs/index.ts`, `api/obs.ts` | **Ändern.** `overlaysByScene`, `getOverlayScenes`, `GET /overlay-scenes`. |
| `src/server/readiness.ts` | **Ändern.** Prüfpunkt „Overlays als Browserquellen in OBS“ (nur beurteilbar, wenn OBS verbunden ist). |
| `src/server/__tests__/overlay-catalog.test.ts`, `obs-visible-overlays.test.ts`, `readiness.test.ts` | **Neu / ändern.** Katalog über HTTP (Namen, Gruppen, Größe, Vorschau, `customized` nach eigenen Farben); Platzierung je Szene gegen das OBS-Stand-in; Bereitschaft. |
| `src/overlays/song-queue/`, `states.json`, `index.ts` (`/public/song-queue`), `actions.ts` (Test-Songs), `overlay-test-songs.test.ts` | **Gelöscht.** Das Overlay fällt weg; `!sr` und `!queue` bleiben. |
| `src/renderer/src/panels/OverlaysPanel.tsx` | **Neu geschrieben.** Liste links (Gruppen, Punkt „in OBS“), Detail rechts (Vorschau, Chip Beispieldaten/Live, OBS-Zustand mit Szenen, Adresse + Größe, „Groß im Browser ansehen“, „Im Stream testen“, „HTML bearbeiten“, „HTML zurücksetzen“/„Löschen“), Dialoge „Eigenes Overlay“ und HTML. |
| `src/renderer/src/panels/AppearancePanel.tsx` | **Neu.** Stil, Farben und Schrift, einzelne Overlays, Entwürfe aus Figma, Alles zurücksetzen – aus dem alten Overlays-Panel herausgelöst. |
| `src/renderer/src/components/AlertSettings.tsx` | **Neu geschrieben.** Karten je Anlass mit Tafel-Vorschau (Beispielname, Platzhalter mit Beispielwerten), Ton-Chip, Dialog „bearbeiten“ (Überschrift, Text, Ton, Lautstärke, Anhören, „Speichern und im Stream testen“), Dialog „Töne verwalten“. |
| `src/renderer/src/panels/ObsPanel.tsx` | **Ändern.** „Szene per Kanalpunkt“, Wortknöpfe, Hinweis, wo Belohnungen entstehen. |
| `panelKeys.ts`, `navigation.ts`, `panelRegistry.tsx`, `index.css`, `help-de.ts` | **Ändern.** Schlüssel `appearance`, Unterreiter „Aussehen“, Stile, Pfade in der Hilfe. |

## Tasks

- [x] Katalog mit Test; Platzierung je Szene mit Test; Route und Readiness-Prüfpunkt.
- [x] Song-Queue-Overlay samt Route, Test-Aktion, Test und Verweisen entfernt.
- [x] Overlays-Seite als Liste + Detail; Vorschau mit Beispieldaten nur im Standard-Layout (sonst live, mit Grund); Vorschau skaliert in den Kasten.
- [x] Alerts als Karten mit Dialog; Zählung ohne Ton; Töne verwalten.
- [x] „Aussehen“ als Unterreiter; Szenen-Panel umbenannt und mit Wortknöpfen.
- [x] Typecheck, Tests, Lint; Durchlauf: 23 Panels; alle Seiten und Dialoge in Chrome fotografiert.
- [ ] Mit OBS am Windows-Rechner prüfen: Punkte und „in OBS · Szenen“ in der Liste, Prüfpunkt „Overlays als Browserquellen“ im Balken.

## Bewusst nicht in dieser Stufe

Das Overlay-Verzeichnis `song-queue` ist weg, aber die Browserquelle dafür steht vielleicht noch in OBS auf dem Windows-Rechner („music“ in *clip studio paint*) – dort auf `/overlay/song/` umstellen oder entfernen. Die Hilfe-Tabelle der Overlays bleibt so lang wie der Katalog.

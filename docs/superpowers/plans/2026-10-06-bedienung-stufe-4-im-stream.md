# Bedienung neu aufbauen — Stufe 4: Im Stream — Implementation Plan

> Gebaut am 06.10.2026 direkt nach Stufe 1 und der Bereitschaft (Marken + Balken statt Start), weil Nils die Seite am meisten sieht. Stufe 3 (Befehlsliste) folgt danach.

**Goal:** „Im Stream“ zeigt jede Auslösung als Karte in einem Raster: Name, ein Satz, rechts oben „im Bild“ / „nicht im Bild“, darunter das Panel, das die Arbeit macht. Oben rechts in der Kopfzeile steht die laufende OBS-Szene als Hinweis. Eine Karte „Moment merken“ kommt dazu. Die Panels selbst bleiben die heutigen Bausteine.

**Architecture:** `GET /api/obs/visible-overlays` liest aus OBS, welche eigenen Browserquellen in der laufenden Szene an sind (Gruppen und verschachtelte Szenen eingeschlossen) und nennt sie nach ihrem Overlay-Ordner (`roulette`, `character`, `custom/<name>`). Der Walk über die Szenen-Elemente ist eine reine Funktion über einem `ObsCaller`, wie das Nachladen der Browserquellen. OBS meldet Szenenwechsel und Quellen-Schalter per Event; der Server reicht beides als `obs-scene-changed` an die Oberfläche weiter. `StreamPage` rendert die Panels der Area `stream` in `StreamCard`s; die Karten-Sätze und die Zuordnung Panel → Overlay-Namen stehen in `StreamPage`.

**Spec:** `docs/superpowers/specs/2026-10-05-bedienung-neuaufbau-design.md`, Abschnitt „Im Stream“.

## Dateien

| Datei | Aufgabe |
|---|---|
| `src/server/obs/visible-overlays.ts` | **Neu.** `visibleOverlays(obs, port, scene)`, `overlayNameFromUrl`. |
| `src/server/obs/index.ts` | **Ändern.** `getVisibleOverlays()`; Events `CurrentProgramSceneChanged`, `SceneItemEnableStateChanged` → `obs-scene-changed`. |
| `src/server/api/obs.ts` | **Ändern.** `GET /visible-overlays`. |
| `src/server/__tests__/obs-visible-overlays.test.ts` | **Neu.** Walk gegen ein OBS-Stand-in (Gruppen, aus, fremde Quellen, Schleife); Route über HTTP ohne OBS. |
| `src/renderer/src/pages/StreamPage.tsx` | **Neu.** Karten-Raster aus `navigation.ts`, Sätze, Overlay-Zuordnung, „Moment merken“. |
| `src/renderer/src/components/ux/StreamCard.tsx` | **Neu.** Karte mit Chip. |
| `src/renderer/src/components/ux/SceneHint.tsx` | **Neu.** „Szene in OBS: main“ in der Kopfzeile. |
| `src/renderer/src/components/stream/MomentCard.tsx` | **Neu.** Notiz + „Jetzt merken“ → `POST /api/clips`. |
| `src/renderer/src/components/ux/PageHeader.tsx` | **Ändern.** Platz rechts (`aside`). |
| `src/renderer/src/Shell.tsx` | **Ändern.** `stream` → `StreamPage`, Kopfzeile mit `SceneHint`. |
| `src/renderer/src/index.css` | **Ändern.** `.stream-cards`, `.stream-card`, `.stream-chip`, `.moment-card`; Panel-Rahmen und Panel-Satz in der Karte ausgeblendet. |
| `scripts/ui-walk.mjs` | **Ändern.** Zählt `[data-panel]`, auch in Karten. |

## Tasks

- [x] `visible-overlays.ts` und Test. Overlay-Namen aus der URL, Gruppen, verschachtelte Szenen (höchstens drei tief, Schleifen erkannt), fremde Quellen ignoriert.
- [x] `getVisibleOverlays()` und die beiden OBS-Events; Route; HTTP-Test ohne OBS liefert `{ scene: null, overlays: [] }`.
- [x] `StreamCard`, `StreamPage`, `MomentCard`, `SceneHint`; `PageHeader.aside`; Shell.
- [x] CSS. Ohne OBS kein Chip (nichts zu sagen); mit OBS „im Bild“ orange, „nicht im Bild“ grau, Karte mit Overlay im Bild bekommt den orangen Rahmen.
- [x] `npm run typecheck && npm test && npm run lint`; Durchlauf in Chrome: 21 Panels, kein Überlauf, keine unbehandelten Fehler.
- [ ] Mit OBS am Windows-Rechner prüfen: Chips wechseln beim Szenenwechsel und beim Ein-/Ausschalten einer Quelle; die Zuordnung Panel → Overlay stimmt (`progress` deckt `progress` und `todos`).

## Bewusst nicht in dieser Stufe

Die Panels innen (Felder, Knöpfe mit Symbolen, „Chat Commands ▸“) – sie sind die Bausteine und werden in einem eigenen Schritt verschlankt, sobald Nils sagt, was in jeder Karte wirklich gebraucht wird. „Overlays als Quellen in OBS gefunden“ als Prüfpunkt der Bereitschaft (nutzt dieselbe Abfrage; kommt mit Stufe 5).

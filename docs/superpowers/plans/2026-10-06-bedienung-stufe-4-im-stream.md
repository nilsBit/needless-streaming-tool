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

## Nachtrag am selben Tag: die Karten innen verschlankt

Nils beim Blick auf die erste Fassung: „Da wird Im Stream wieder überladen.“ Also wurden die
sechs Panels auf das Maß des Prototyps gebracht – je Karte eine Eingabe, ein Knopf, eine
Zustandszeile, Wortlinks statt Symbolknöpfe; alles Verwaltende liegt hinter einem Wortlink in
einem **Dialog** (`components/ux/Dialog.tsx`, in `<body>` gerendert, Escape und Klick daneben
schließen). Keine Funktion fiel weg, keine API änderte sich.

- [x] **Glücksrad:** Thema hinzufügen, „Rad drehen“, Zustand, „Dran: …“. Dialog „Themen verwalten“: Name des Rads, Offen (Erledigt/Löschen), Erledigt.
- [x] **Ziel für heute:** Feld + „Los“; läuft eins: Satz, Uhr, „Pause/Weiter“, „Geschafft“, „Nicht geschafft“, „Abbrechen“.
- [x] **Abstimmung:** Vorschlag hinzufügen, Dauer, „Abstimmung starten“; läuft eine: Balken, Countdown, „Beenden“, „Abbrechen“. Dialog „Vorschläge verwalten“.
- [x] **Fortschritt:** Projekt, Balken, der aktive Punkt mit seinen Aufgaben zum Abhaken und einem Feld. Dialog „Aufgaben bearbeiten“: das ganze Brett (Vorrat · Aktiv · Erledigt), Ziehen oder Wortknöpfe, Meilensteine je Aufgabe, Umbenennen, CSV.
- [x] **Musik:** was läuft, Schalter fürs Erkennen, „Als Nächstes: n Wünsche“. Dialoge „Titel von Hand setzen“ und „Wünsche verwalten“ (Abspielen/Überspringen/Löschen/Reihe leeren).
- [x] **Eintrag aus der Welt:** der Eintrag im Overlay, „Folgt dem Worldbuilder nach n s“ mit „Festpinnen“/„Wieder folgen“. Dialog „Eintrag wählen“: Quelle, Arten, Suche, Liste mit „Ins Overlay“, rechts die Schalter „Zeigen/Ausblenden“ je Feld.
- [x] **Hinweisbalken** ist eine Zeile („Noch nicht bereit: OBS ist nicht verbunden · … · 1 Hinweis“, „Anzeigen“ klappt die Einzelheiten auf).
- [x] Typecheck, Tests, Lint grün; Durchlauf: 21 Panels, kein Überlauf; alle Dialoge in Chrome geöffnet und fotografiert.

## Bewusst nicht in dieser Stufe

`ChatCommands` (der Klapptext „Chat Commands ▸“) wird nur noch vom Befehle-Panel benutzt und fällt mit Stufe 3. Karten abwählen (Einstellungen → Programm) kommt, wenn Nils es braucht. „Overlays als Quellen in OBS gefunden“ als Prüfpunkt der Bereitschaft (nutzt dieselbe Abfrage; kommt mit Stufe 5).

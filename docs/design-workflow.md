# Overlays gestalten — Figma hin und zurück

Spezifikation: `docs/superpowers/specs/2026-09-21-overlay-design-workflow-design.md`.

## Einmal einrichten

1. `cd figma-plugin`, dann `npm install` und `npm run build`.
2. Figma Desktop → *Plugins → Entwicklung → Plugin aus Manifest importieren…* →
   `figma-plugin/manifest.json`.
3. Plugin „NST-Brücke" öffnen, das API-Token eintragen. Es steht beim Start des
   Tools im Log: `[Auth] Fixed API token: …`. Ein falsches Token meldet das
   Plugin als „Token falsch".

## Ansehen

`http://localhost:4000/overlay/showcase/` — jedes Overlay in jedem Zustand, mit
Testdaten. Nichts davon erreicht OBS. Zustände und Größen stehen in
`src/overlays/showcase/states.json`; ein Zustand einzeln:
`/overlay/<name>/index.html?state=<zustand>`.

## Nach Figma

1. Tool läuft (`npm run dev`).
2. `npm run showcase:capture` (oder `-- <overlay>` für eins).
3. Im Plugin **Aus NST einlesen** — landet auf einer neuen Seite „Import …",
   Farben an die Variablen der Sammlung „NST" gebunden, das Originalbild als
   ausgeblendete Ebene „Vorlage" in jedem Frame.

## Zurück

1. Frames heißen `<overlay> / <zustand>` — genau so, wie der Import sie anlegt.
2. Frames markieren → **An NST senden**. Landet in
   `design/drafts/<overlay>/<zustand>/` (Entwurf, 1x- und 2x-Bild). Die
   ausgeblendete Ebene „Vorlage" wird dabei nie mit exportiert, auch wenn sie
   sichtbar geschaltet wurde.
3. Bescheid sagen: „character ist fertig". Umgesetzt wird mit
   `npm run showcase:compare -- <overlay>` als Abgleich.

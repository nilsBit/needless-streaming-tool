# Overlays gestalten — Figma hin und zurück

Spezifikation: `docs/superpowers/specs/2026-09-21-overlay-design-workflow-design.md`.

## Einmal einrichten

Erfassen (`npm run showcase:capture`) und Abgleichen (`npm run showcase:compare`)
brauchen Google Chrome am üblichen Ort des Systems — unter Windows
`C:/Program Files/Google/Chrome/Application/chrome.exe`, unter macOS
`/Applications/Google Chrome.app` (überschreibbar mit der Umgebungsvariable
`CHROME_PATH`).

1. `cd figma-plugin`, dann `npm install` und `npm run build`.
2. Figma Desktop → *Plugins → Entwicklung → Plugin aus Manifest importieren…* →
   `figma-plugin/manifest.json`.
3. Plugin „NST-Brücke" öffnen, das **Figma-Token** eintragen. Es steht beim
   Start des Tools im Log: `[Auth] Figma token: …`. Es gilt nur für
   `/api/design/*` — nicht das „Fixed API token“ nehmen, das öffnet die ganze
   API. Ein falsches Token meldet das Plugin als „Token falsch".

## Ansehen

`http://localhost:4000/overlay/showcase/` — jedes Overlay in jedem Zustand, mit
Testdaten. Nichts davon erreicht OBS. Zustände und Größen stehen in
`src/overlays/showcase/states.json`; ein Zustand einzeln:
`/overlay/<name>/index.html?state=<zustand>`.

Beides friert nach dem Abspielen ein, so wie das Erfassen es sieht. Mit
`?live` (Showcase: `/overlay/showcase/?live`, einzeln `&live` anhängen) läuft
alles weiter — so lässt sich eine Animation mit den Augen beurteilen. In der
Showcase-Ansicht in Bewegung hat jeder Zustand **↻ Nochmal** (spielt ihn von
vorn, etwa wenn sich ein Alert schon ausgeblendet hat) und die Aktionen seines
Overlays — Punkt abhaken, Rad drehen, Song wechseln … Sie stehen je Overlay
unter `actions` in `states.json`: neue Testdaten (`public`) und Ereignisse
(`events`), die `boot.js` in das Overlay spielt.

## Nach Figma

1. Tool läuft (`npm run dev`).
2. `npm run showcase:capture` (oder `-- <overlay>` für eins). Die Overlays laden
   ihre Schriften von Google Fonts — beim Erfassen online sein, sonst fällt
   Chrome auf Georgia zurück.
3. Im Plugin **Aus NST einlesen** — landet auf einer neuen Seite „Import …",
   Farben an die Variablen der Sammlung „NST" gebunden, das Originalbild als
   ausgeblendete Ebene „Vorlage" in jedem Frame.
4. Unter jedem Frame liegt eine gelbe **Notiz** (`<overlay> / <zustand> · Notiz`).
   Figma kennt nur Standbilder: Ein animierter Balken steht im Frame in
   irgendeinem angehaltenen Moment. Die Notiz sagt deshalb in Worten, was sich
   im Code gerade bewegt — Dauer, Wiederholung, Verzögerung, Schlüsselbilder —
   und hat darunter Platz unter **Wünsche:**.

## Zurück

1. Frames heißen `<overlay> / <zustand>` — genau so, wie der Import sie anlegt.
   Die Frame-Füllung leer lassen (keine Farbe): der Abgleich zählt Transparenz mit.
2. Frames markieren → **An NST senden**. Landet in
   `design/drafts/<overlay>/<zustand>/` (Entwurf, 1x- und 2x-Bild). Die
   ausgeblendete Ebene „Vorlage" wird dabei nie mit exportiert, auch wenn sie
   sichtbar geschaltet wurde.
3. Was das Bild nicht zeigt, gehört in die Notiz unter **Wünsche:** — Bewegung
   („Balken ruhiger, nie ganz flach"), Einblendungen, Verhalten bei langem
   Text. Die Notiz reist beim Senden mit (`note` in `draft.json`); sie selbst
   wird nicht als Entwurf gesendet, auch wenn sie mit markiert ist. Gestaltet
   wird bei Animationen das Aussehen, bei Einblendungen der Endzustand.
4. Beim Eingang übernimmt das Stream Tool **sofort**, was eine eindeutige
   CSS-Entsprechung hat: Palette (Variablen der Sammlung „NST"), Textfarbe,
   Schriftgröße (in `rem`, der Regler wirkt weiter), Schriftschnitt, eine der
   beiden Palettenschriften, Laufweite, Zeilenhöhe, Groß-/Kleinschreibung,
   Füllung, Rahmenfarbe und -stärke, Ecken, Deckkraft. Das Plugin vergleicht
   dafür jede Ebene mit dem Stand beim Import (Plugin-Daten `nst`), nicht mit
   dem Browser — was nur zwischen Figma und Browser verschieden aussieht, zählt
   nicht. Die Änderungen liegen als Überschreibungen in der Datenbank
   (`design_applied`), `boot.js` spielt sie live ein — ohne `!important`, damit
   Animationen und vom Skript gesetzte Werte weiter gewinnen.

   **Was ein Entwurf darf:** Nur Selektoren, die die Erfassung dieses
   Zustands erzeugt hat; Farben nur als `#rrggbb` oder als Palettenvariable,
   Zahlen nur als Zahlen, Palettenwerte nur in ihrer Schreibweise. Alles
   andere wartet. Beim Ausliefern wird das CSS noch einmal gegen eine enge
   Zeichenliste geprüft — die Datenbank kommt auch über Backups zurück.
5. Alles andere **wartet**: Verschieben, Größen, neue oder entfernte Ebenen,
   Sichtbarkeit, Schatten, geänderter Text, fremde Schriften und die Wünsche.
   Es steht in `design/drafts/<overlay>/<zustand>/status.json` (`done: false`)
   und in der App unter *Settings → Overlays → Figma*. Dort lässt sich auch
   jede übernommene Änderung zurücknehmen, eine Palettenänderung auch
   „behalten“ (von der Liste, Wert bleibt). Jede Änderung ist ein Paar aus
   Element und Eigenschaft: Wer dieselbe Eigenschaft erneut ändert, ersetzt
   den alten Wert; sonst nimmt ein neuer Versand nichts zurück — Zurücknehmen
   geht nur in der App. Was noch wartet, bleibt auf der Liste, auch wenn ein
   späterer Versand desselben Frames es nicht mehr enthält.
6. Umgesetzt wird in einer Claude-Sitzung — läuft eine, beobachtet sie
   `design/drafts` und fängt von selbst an. Dabei wandern die vorläufigen
   Überschreibungen fest ins Overlay-CSS und werden zurückgenommen, danach
   `POST /api/design/drafts/<overlay>/<zustand>/done`. Abgleich mit
   `npm run showcase:compare -- <overlay>`; die Wünsche stehen dort mit in der
   Ausgabe. Animierte Stellen weichen immer ein wenig ab, weil der angehaltene
   Moment nie ganz derselbe ist.

Neu einlesen ist jederzeit sicher: Die Erfassung zeigt das Overlay mit allen
übernommenen Änderungen, die Palette kommt live vom Server
(`/api/design/palette`), und ein neuer Frame vergleicht nur mit sich selbst.
Frames aus einem Import vor dem 22.09. haben keinen gespeicherten Stand; das
Plugin sagt das, der Server nimmt nichts zurück und vermerkt den Versand als
offen.

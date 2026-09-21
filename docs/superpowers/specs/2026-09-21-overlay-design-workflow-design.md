# Overlays in Figma gestalten — der Weg hin und zurück

Entwurf vom 21. September 2026.

## Auslöser

„wir haben ja in nst ganz viele overlays die noch designt werden müssen.
können wir den workflow irgendwie optimieren. also z.B. eine Figma file etc"

Zwölf Overlays (`src/overlays/<name>/index.html`) warten auf ihre
Gestaltung. Heute gibt es dafür keinen Weg außer Code: keine Seite, die alle
Overlays in allen Zuständen zeigt, keine Design-Datei, und die Test-Ereignisse
(`POST /api/actions/overlay-test/<name>`) gehen an **alle** Overlays, also
auch live in OBS. `docs/overlay-variablen.md` beschreibt einen Figma-Weg,
ist aber älter als der Lexikon-Umbau.

## Entscheidungen

**Der Nutzer gestaltet in Figma Desktop; Claude setzt um.** Figma ist die
Quelle des Entwurfs, der Code die Quelle des Overlays.

**Kein Figma-MCP, keine REST-API.** Der Figma-Tarif ist Starter (kostenlos);
dort sind beide auf wenige Aufrufe im Monat begrenzt. Ein eigenes
Entwicklungs-Plugin läuft in Figma Desktop ohne solche Grenzen und kostet
nichts.

**Die Datei beginnt mit den bestehenden Overlays**, nicht leer: Überarbeiten
statt bei null anfangen.

**Nichts in diesem Weg erreicht den Stream.** Der Schaukasten spielt
Zustände im Browser ab, nicht über den Server.

**Beim Empfang eines Entwurfs ändert das Tool nichts von selbst** — weder
Overlay noch Palette.

## 1. Der Schaukasten

Eine Seite unter `http://localhost:4000/overlay/schaukasten/`, die jedes
Overlay in jedem seiner Zustände zeigt: je Zustand ein iframe in der
OBS-Größe des Overlays, mit festen Testdaten.

**Zustände über `?zustand=<name>`.** `boot.js` erkennt den Parameter und

- ersetzt `WebSocket` durch eine Attrappe, die die Ereignisse dieses
  Zustands in ihrer Reihenfolge und mit ihren Abständen abspielt,
- beantwortet Abfragen an `/public/...` aus den Testdaten des Zustands statt
  aus der Datenbank,
- hält nach dem Anhaltezeitpunkt des Zustands alle Animationen an
  (`document.getAnimations()`), damit eine Einblendung nicht halb erfasst
  wird.

Ohne den Parameter verhält sich `boot.js` wie heute. Die Overlay-Dateien
selbst ändern sich nicht. Die Palette lädt weiter aus der echten
Konfiguration, Änderungen im Einstellungs-Panel greifen also auch im
Schaukasten.

Das setzt voraus, dass jedes Overlay `boot.js` vor seinem eigenen Skript
lädt und `WebSocket` sowie `fetch` erst danach benutzt. Wo ein Overlay das
nicht tut, wird es beim Bau angeglichen.

**Die Zustandsliste** steht an einer Stelle,
`src/overlays/schaukasten/zustaende.js`: je Overlay eine Liste von
Zuständen mit Name, Größe (Breite × Höhe der OBS-Quelle), Ereignissen,
Testdaten für `/public/...` und Anhaltezeitpunkt. Beispiele:
`character` mit Bild / ohne Bild / langer Text; `roulette` wartet / dreht /
Gewinner; `alerts` Follow / Sub / Raid; `todos` leer / voll. Die Größen
kommen aus der OBS-Szene „clip studio paint" (Eintragskarte 568×497,
`music` 350×110, Vollbild-Overlays 1920×1080); was dort fehlt, aus
`docs/overlay-variablen.md`.

Die Seite selbst liest die Liste und legt die iframes an, gruppiert nach
Overlay.

## 2. Nach Figma

### Erfassen

`npm run schaukasten:erfassen` startet den lokal installierten Chrome
headless über `playwright-core` (neue Entwicklungsabhängigkeit), öffnet jeden
Zustand einzeln in seiner Größe und schreibt nach
`design/erfasst/<overlay>/<zustand>.json`:

- **Kästen:** Position und Größe relativ zum Frame, Hintergrundfarbe,
  Rahmen je Seite (Breite, Farbe, Stil), Radien, erster Schatten,
  Deckkraft, Verschachtelung.
- **Texte:** Inhalt, Schriftfamilie, Größe, Gewicht, kursiv, Farbe,
  Zeilenhöhe, Laufweite, Ausrichtung.
- **Bilder** als PNG, **Inline-SVGs** als SVG-Text.
- **Token-Bezug:** Entspricht eine Farbe genau dem Wert eines der zehn
  Tokens (`VALID_KEYS` in `src/server/api/overlay-config.ts`), wird der
  Token vermerkt. Abgeleitete Töne (`--lex-*`) bleiben feste Farben.
- **Gesamtbild** `<zustand>.png` zum Vergleich.

Die Erfassung wird nicht eingecheckt.

### Einlesen

Das Plugin liegt unter `figma-plugin/` (TypeScript, gebaut mit esbuild,
eingebunden über *Plugins → Entwicklung → Plugin aus Manifest
importieren*). Es darf nur `http://localhost:4000` erreichen
(`networkAccess` im Manifest).

„Aus NST einlesen":

- holt die Liste der Erfassungen und die Dateien vom laufenden Stream Tool
  (neuer Endpunkt, liest `design/erfasst/`),
- legt die Variablensammlung **„NST"** an oder aktualisiert sie: die zehn
  Tokens als Farb-, Zahl- und Text-Variablen,
- baut je Zustand einen Frame namens `<overlay> / <zustand>` in OBS-Größe,
  darin Rahmen, Texte, Bilder und Vektoren, absolut platziert; erkannte
  Token-Farben werden an die Variablen gebunden,
- legt das Gesamtbild als ausgeblendete, gesperrte Ebene „Vorlage" in den
  Frame,
- setzt jeden Import auf eine **neue Seite** („Import <Datum>") und
  überschreibt nie Vorhandenes,
- ersetzt fehlende Schriften durch Inter und listet die betroffenen Stellen.

**Grenzen:** keine Auto-Layouts; `color-mix()`, Verläufe und Doppelrahmen
werden angenähert. Das Ergebnis ist ein naher Startpunkt, kein
pixelgleicher Klon.

## 3. Zurück zu NST

„An NST senden" im Plugin, für die markierten Frames:

- Overlay und Zustand kommen aus dem Frame-Namen. Unbekannte Namen werden
  nicht geraten — das Plugin lässt einen aus der Zustandsliste wählen.
- Export: PNG in 1x und 2x; Ebenenbaum als JSON mit Positionen, Größen,
  Füllungen **samt gebundener Variable**, Rahmen, Radien, Effekten,
  Textwerten, Auto-Layout (falls benutzt), Ebenen- und Komponentennamen;
  dazu die aktuellen Werte der Sammlung „NST".
- Das API-Token trägt der Nutzer einmal im Plugin ein; es liegt in
  `figma.clientStorage`.

`POST /api/design/eingang` (hinter der bestehenden Token-Prüfung) legt ab:

```
design/entwuerfe/<overlay>/<zustand>/entwurf.json
design/entwuerfe/<overlay>/<zustand>/bild.png
design/entwuerfe/<overlay>/<zustand>/bild@2x.png
```

Erneutes Senden überschreibt; den Verlauf hält git — `design/entwuerfe/`
wird eingecheckt. Pfadteile werden gegen die Zustandsliste geprüft, nichts
außerhalb von `design/entwuerfe/` wird geschrieben.

## 4. Umsetzen

Je Overlay:

1. Der Nutzer sendet die Zustände eines Overlays und sagt Bescheid.
2. Claude setzt `entwurf.json` + `bild.png` im HTML/CSS des Overlays um,
   gebundene Variablen als Tokens. Ein neuer Token (z.B. eine vierte Farbe)
   wird erst vorgeschlagen, dann eingeführt: `VALID_KEYS`, Panel, Migration,
   Figma-Variable.
3. `npm run schaukasten:vergleich <overlay>` rendert die Zustände neu und
   legt je Zustand ein Bild in `design/vergleich/` (nicht eingecheckt):
   Entwurf links, Overlay rechts, darunter die Abweichungen. Claude arbeitet
   nach, bis es passt, und zeigt dann das Vergleichsbild.
4. Blick auf die echte OBS-Quelle per Screenshot über den OBS-WebSocket.
   Test-Ereignisse im Stream nur nach Ansage.
5. Commit je Overlay; Push nach Rückfrage.

## Reihenfolge

1. Schaukasten (Attrappe in `boot.js`, Zustandsliste, Seite)
2. Erfassen
3. Plugin: Einlesen
4. Plugin: Senden + Eingang
5. Pilot `character` — einmal den ganzen Kreis, bevor die anderen elf
   folgen

## Prüfen

- Unit-Tests (vitest) für die Attrappe in `boot.js`, die Zustandsliste
  (jedes Overlay hat mindestens einen Zustand, jeder Zustand eine Größe),
  die Token-Erkennung der Erfassung und den Eingang (Pfadprüfung, Token,
  Ablage).
- Die Erfassung selbst ist der Test des Schaukastens: Jeder Zustand muss
  rendern, ohne Fehler in der Konsole.
- Das Plugin wird am Pilot geprüft, in Figma Desktop durch den Nutzer.
- Vor jedem Commit: `npm run typecheck`, `npm test`, `npm run lint`.

## Aufräumen

`docs/overlay-variablen.md` wird durch die Zustandsliste und eine kurze
Anleitung `docs/design-workflow.md` ersetzt (einrichten, einlesen, senden,
Bescheid sagen).

## Nicht in diesem Vorhaben

Die Overlays selbst neu zu gestalten (das ist die Arbeit, die dieser Weg
ermöglicht); Auto-Layout beim Einlesen; Figma-Komponenten aus den Overlays;
Abgleich in beide Richtungen, bei dem der Code Figma-Frames aktualisiert;
eigene Overlays unter `/overlay/custom/`.

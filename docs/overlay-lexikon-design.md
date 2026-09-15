# Alle Overlays im Lexikon-Stil

Entwurf vom 15. September 2026.

Dieses Dokument beschreibt, wie die elf übrigen Overlays auf das Design der
Eintragskarte gehoben werden — und wie die Karte selbst dabei vom Sonderfall
zum normalen Overlay wird. Betroffen sind damit alle zwölf. Es ist ein Entwurf,
keine Aufgabenliste — offene Arbeit gehört nach `CLAUDE.md` in die GitHub
Issues.

## Anlass

Die STAND.md hält seit der Entscheidung zu #19 fest: „Das Design aller Overlays
wird am Ende noch einmal überarbeitet." Dieses Ende ist erreicht — die
Anbindung an den Worldbuilder steht, und die Eintragskarte ist der einzige Ort,
an dem der Lexikon-Stil bereits umgesetzt ist.

Der Bestand zerfällt heute in zwei Welten:

- **`character`** trägt einen eigenen `--lex-*`-Block, Cormorant Garamond und
  Source Serif 4, Pergament auf Dunkel. Sie hat **kein** Startskript und steht
  damit außerhalb des Einstellsystems.
- **Die übrigen elf** laufen auf `--color-*` und Inter. Sie holen ihre Werte
  über `/public/overlay-config` und schreiben sie per `style.setProperty` auf
  `:root`.

Daraus folgt der Punkt, an dem eine reine CSS-Überarbeitung wirkungslos bliebe:
**Inline-Stile schlagen das Stylesheet.** Die gespeicherte `overlay_config`
enthält `#e67e22` und Inter; solange sie das tut, überschreibt sie jede neue
Vorgabe in den Dateien.

## Entscheidungen

1. **Die Variablennamen bleiben, ihre Werte werden Lexikon.**
   `--color-primary`, `--font-body` und die übrigen acht sind der Vertrag
   zwischen App, Einstell-Panel und Overlays. Sie umzubenennen hieße, Server
   und Panel mit anzufassen, ohne dass irgendjemand etwas davon hat.

2. **Die Eintragskarte wird ein normales Overlay.** Ihre `--lex-*`-Werte gehen
   in die gemeinsamen Namen über, sie bekommt das Startskript. Danach erreicht
   sie das Einstell-Panel wie alle anderen — heute ist sie der einzige
   Sonderfall.

3. **Feine Töne werden abgeleitet, nicht eingestellt.** Rahmen, Innenrahmen,
   Trennlinien und die beiden gedämpften Textfarben entstehen per `color-mix()`
   aus den zehn Grundwerten. Zwanzig Regler, von denen achtzehn nie zueinander
   passen, sind schlechter als zehn, die immer stimmen.

4. **Drei Gewichte statt einer Schablone.** Die Karte ist 720 px breit und steht
   minutenlang; das Song-Overlay misst 300 × 80 px, ein Alert blitzt zwei
   Sekunden. Derselbe Buchrahmen überall wäre auf den kleinen Flächen albern.

5. **Das Startskript wird einmal abgelegt.** Es steht heute dreizehnmal
   identisch in den Dateien.

## Die zehn einstellbaren Werte

| Name | Wert | Wofür |
|---|---|---|
| `--color-bg` | `#0e0c0a` | dunkle Seite des Verlaufs |
| `--color-bg-secondary` | `#282018` | warme Seite des Verlaufs |
| `--color-bg-opacity` | `0.95` | wie viel Stream durchscheint |
| `--color-text` | `#e1d6c2` | Pergament, Fließtext |
| `--color-primary` | `#f4ead7` | Titel, hellstes Pergament |
| `--color-secondary` | `#b8a98c` | Beschriftungen, Gedämpftes |
| `--color-accent` | `#c9a45c` | Gold: Siegel, Rückfall für die Art-Farbe |
| `--font-display` | `'Cormorant Garamond', Georgia, serif` | Titel, Kapitälchen |
| `--font-body` | `'Source Serif 4', Georgia, serif` | Fließtext |
| `--font-size-base` | `15px` | Grundmaß |

### Abgeleitet in `lexikon.css`

Diese behalten bewusst das `--lex-`-Präfix: Es kennzeichnet, was **nicht**
einstellbar ist. Wer im Panel etwas sucht, findet dort nur `--color-*` und
`--font-*` — und alles, was `--lex-` heißt, ergibt sich daraus von selbst.

```css
--lex-frame:       color-mix(in srgb, var(--color-primary) 20%, transparent);
--lex-frame-inner: color-mix(in srgb, var(--color-primary)  8%, transparent);
--lex-rule:        color-mix(in srgb, var(--color-primary) 15%, transparent);
--lex-soft:        color-mix(in srgb, var(--color-text)  82%, var(--color-bg));
--lex-faint:       color-mix(in srgb, var(--color-text)  60%, var(--color-bg));
```

`--art` bleibt wie bisher pro Eintrag gesetzt und fällt auf `--color-accent`
zurück.

**Zu prüfen beim Umbau:** Die heutigen Rahmentöne der Karte stammen von
`#e9d6b2`, die Ableitung nimmt `--color-primary` (`#f4ead7`). Der Unterschied
ist bei 20 % Deckkraft über dunklem Grund klein, aber nicht null — die Karte
gehört nach der Umstellung nebeneinandergelegt und angeschaut, nicht bloß
durchgewinkt.

## Gemeinsame Dateien

### `/overlay/boot.js`

Übernimmt, was heute dreizehnmal dasteht:

- `/public/overlay-config` holen
- `global` mit `overrides[name]` mischen
- Werte auf `:root` schreiben
- `-rgb`-Varianten für die vier Farben ableiten
- `--font-display` und `--font-body` von Google Fonts nachladen
- das Dokument bis dahin verborgen halten
- auf das WS-Ereignis `overlay-config` hören und neu anwenden

Der Overlay-Name kommt als `data-overlay="song"` am Script-Tag, statt wie heute
als Variable im Rumpf.

### `/overlay/lexikon.css`

Reset und Transparenz, die abgeleiteten Töne, die Größenstufen und die
Formelemente: Doppelrahmen, gesperrte Kapitälchenzeile, Trennlinie, Siegel.

## Die drei Gewichte

| Gewicht | Kennzeichen | Overlays |
|---|---|---|
| **Voll** | Doppelrahmen, Siegel, Kapitälchen | `character`, `reward-leaderboard` |
| **Schlank** | eine Linie, Serifen, kein Rahmen | `song`, `song-queue`, `todos`, `progress`, `milestone`, `challenge`, `poll` |
| **Flüchtig** | nur Schrift und Akzent | `alerts`, `reward-rankchange`, `roulette` |

Bei „Flüchtig" bleibt der Zierrat bewusst weg: Was zwei Sekunden sichtbar ist,
muss auf einen Blick lesbar sein, und ein Rahmen, der mit einblendet, zieht die
Aufmerksamkeit auf sich statt auf den Text.

## Migration auf Schema v20

Setzt `overlay_config.global` auf die zehn Werte oben. **`overrides` bleibt
unangetastet** — was pro Overlay abweichend eingestellt wurde, war eine
bewusste Entscheidung und gehört nicht überschrieben.

Ohne diesen Schritt bleibt die Überarbeitung unsichtbar.

## Prüfung

Die Testnaht ist nach `CLAUDE.md` die HTTP-Schnittstelle; Aussehen wird „durch
Benutzen" verifiziert. Über HTTP prüfbar und daher zu testen:

- `/public/overlay-config` liefert nach der Migration die Lexikon-Werte
- `overrides` überlebt die Migration
- `/overlay/boot.js` und `/overlay/lexikon.css` werden ausgeliefert
- jedes Overlay bindet beide ein

Das Aussehen selbst wird im Browser gegen den laufenden Server angesehen, je
Gewicht mindestens eines.

## Reihenfolge

1. `lexikon.css` und `boot.js` anlegen und ausliefern; `song` umstellen —
   kleinste Fläche, beweist die Mechanik
2. `character` auf die gemeinsamen Namen heben — beweist „Voll" und dass die
   Konfiguration die Karte nun erreicht
3. die übrigen zehn in ihren Gewichtsgruppen
4. Migration auf v20
5. `_template` nachziehen, damit künftige Overlays richtig anfangen

## Bewusst nicht enthalten

- **Schriften selbst ausliefern.** Sie kommen von `fonts.googleapis.com`; das
  funktioniert in OBS, hängt aber vom Netz zum Streamstart ab. Eigene Scheibe.
- **Das Einstell-Panel umbauen.** Es kennt die zehn Namen und funktioniert
  weiter; es zeigt nach der Migration andere Werte an, sonst nichts.
- **`docs/overlay-variablen.md`.** Beschreibt noch Bugs, Glücksrad und „Farben
  aus dem Spiel" — gehört auf Worldbuilding umgeschrieben, aber als eigener
  Schritt, nicht im selben Aufwasch wie das CSS.

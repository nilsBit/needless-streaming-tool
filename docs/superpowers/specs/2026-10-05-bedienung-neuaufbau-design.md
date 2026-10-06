# Bedienung neu aufbauen — Spezifikation

Stand: 2026-10-05. Klickbarer Prototyp (sieben Seiten): https://claude.ai/artifact/5Nw7Ci85coRGA526iNv8u7

**Freigegeben von Nils am 06.10.2026**, nach dem Durchklicken aller sieben Seiten und den
Änderungen desselben Tages (im Text mit „06.10.“ markiert). Umsetzungsplan Stufe 1:
`docs/superpowers/plans/2026-10-06-bedienung-stufe-1-geruest.md`.

## Wozu

Nils findet sich im Tool nicht zurecht: Er sieht nicht, was es kann, und nicht, wo und
wie er etwas anlegt — vor dem Stream, im Stream und beim Ändern gleichermaßen. Die
Funktionen bleiben, wie sie sind. Geändert werden Aufbau, Benennung und Wegführung.

Gelungen ist der Umbau, wenn Nils ohne Nachfragen

- vor dem Stream sieht, was verbunden ist und was noch fehlt,
- im Stream jede Auslösung auf einer Seite findet,
- einen Befehl, einen Alert oder ein Overlay in höchstens zwei Klicks erreicht.

## Was heute stört

- Zwei Navigationen oben: „Live / Produktion“ und daneben „Live / Settings / Hilfe“
  bzw. „Produktion / Projekt / Settings / Hilfe“. „Live“ und „Produktion“ stehen doppelt.
- Dinge liegen nach Technik sortiert: Erklär-Commands unter Produktion → Projekt,
  Alerts und Bot-Erinnerung in Settings → Features, Overlays und Meilensteine in Settings.
- Jeder Reiter ist ein Brett aus Kästen mit Verschieben, Anpinnen und Ausblenden;
  Ausgeblendetes landet in einer Leiste am unteren Rand.
- Deutsch und Englisch gemischt („Progress Tracker“, „Clip Moments“, „Reward Stats“).
- Knöpfe nur als Symbole (⏸️ ✏️ 🗑️), kein Einstieg, kein Überblick über den Zustand.

## Der neue Aufbau

Eine feste Leiste links mit vier Bereichen nach Situation, darunter Einstellungen und
Hilfe, ganz unten die Verbindungsmarken (Twitch, OBS, Worldbuilder). Ein Bereich zeigt eine Seite; hat er mehrere Themen, stehen sie als Unterreiter
oben auf der Seite. Die Kopfzeile jeder Seite nennt den Bereich und einen Satz dazu.

| Bereich | Unterreiter | Kommt aus (heute) |
|---|---|---|
| **Im Stream** | — (Karten) | ChallengePanel, IssuesPanel, DesignsPanel, ProgressPanel, SongPanel, laufende OBS-Szene als Hinweis (neu, nur Anzeige), „Moment merken“ aus ClipsPanel |
| **Chat & Bot** | Befehle · Von selbst · Ausprobieren | TextCommandsPanel, CommandOverview, Settings → Features → Chat Commands (Erinnerung, Shoutout) |
| **Overlays & Alerts** | Overlays · Alerts · Meilensteine · Szenen in OBS · Aussehen | OverlaysPanel (Overlays, Design, Figma), AlertSettings, MilestonesPanel, ObsPanel (Szenen anlegen, Zuordnung) |
| **Nach dem Stream** | Content planen · Statistik · Kanalpunkte | ClipsPanel, StatsPanel, RewardStatsPanel, Settings → Features → Auto-Clips |
| **Einstellungen** | Verbindungen · Programm · Daten | SettingsPanel ohne „Features“, HotkeysPanel |
| **Hilfe** | — | HelpPanel |

„Welt“ (WorldPanel: Quelle Worldbuilder/Notion, aktueller Eintrag) wandert als Karte
nach **Im Stream**, die Wahl der Quelle nach **Einstellungen → Verbindungen**.

### Benennung

Durchgehend Deutsch, in der Sprache des Tuns statt der Technik. „Overlay“ und „Alert“
bleiben — das sind die Wörter, die Nils selbst benutzt (der Versuch „Bild & Ton“ /
„Einblendungen“ war ihm unklar):

| heute | neu |
|---|---|
| Challenge | Ziel für heute |
| Progress Tracker | Fortschritt |
| Now Playing | Musik |
| Clip Moments | Content planen (Momente) |
| Reward Stats | Kanalpunkte |
| Milestones | Meilensteine |
| OBS Scenes | Szenen |
| Erklär-Commands / Chat Commands | Befehle |
| Settings | Einstellungen |

Die Befehle im Chat selbst (`!challenge`, `!progress` …) bleiben unverändert.

### Regeln für jede Seite

- Jeder Knopf trägt ein Wort („Bearbeiten“, „Ausschalten“, „Löschen“), kein bloßes Symbol.
- Jede Liste hat oben rechts genau einen Anlegen-Knopf („+ Neuer Befehl“).
- Jede Karte und jeder Unterreiter beginnt mit einem Satz, was man hier tut.
- Ausgeschaltetes ist von Aktivem getrennt (Filter), nicht nur blasser.
- Leere Zustände sagen, wie man den ersten Eintrag anlegt.
- Bearbeiten passiert in einem **Dialog in der Bildmitte** über der Seite. Nichts klappt unten
  oder am Rand auf: Das ist eine Desktop-App, deren Fenster schmal sein kann (06.10.).

### Was wegfällt

- Die Umschaltung „Live / Produktion“ und die Reiterzeile daneben.
- Das Overlay „Song Queue“ (`/overlay/song-queue/`). Im Bild steht nur der laufende Titel
  („Musik“); die Wünsche bleiben über `!sr` und `!queue` im Chat (entschieden am 06.10.).
  Der Code geht in Stufe 5 raus, mit Hilfe-Seite und Showcase-Zustand.
- Verschieben, Anpinnen, Ausblenden und Einklappen von Kästen samt der Leiste
  „Ausgeblendet“ (`useDashboardLayout`, Einstellung `ui.dashboard_layout`).
  **Annahme** — im Entwurf benannt, von Nils nicht beanstandet. Was er im Stream nicht
  braucht (Bestenliste, Ziel), lässt sich stattdessen in Einstellungen → App abwählen.

## Die Seiten

**Kein Start mehr** (entschieden am 06.10. nach dem ersten Blick auf Stufe 1: „Brauchen wir
Start überhaupt, wenn alles verbunden ist?“). Was die Startseite leisten sollte, liegt dort,
wo man es ohnehin sieht: **Verbindungsmarken** unten in der Leiste – Twitch, OBS, Worldbuilder
als Punkt mit Wort, grün/rot/grau, ein Klick führt zur richtigen Stelle – und ein
**Hinweisbalken oben auf „Im Stream“**, nur solange etwas fehlt: je Punkt, was fehlt, was es
im Stream bedeutet und „Dorthin“. Ist alles da, gibt es den Balken nicht. Die App öffnet auf
„Im Stream“. Die Prüfpunkte liefert `GET /api/readiness` (`src/server/readiness.ts`): Twitch
verbunden und Bot im Kanal · OBS verbunden · Szenen `start`/`brb`/`end` vorhanden (nur
beurteilbar, wenn OBS verbunden ist) · Worldbuilder erreichbar (Fehler, wenn er die Quelle
ist; Hinweis, wenn Notion gewählt ist) · mindestens ein eigener Befehl an · alle Alerts mit
Ton (Hinweis). „Overlays als Quellen in OBS gefunden“ kommt mit Stufe 4 dazu.

**Im Stream.** Karten in einem Raster, jede mit Titel, einem Satz, der einen Eingabe
und der einen Auslösung. Rechts oben an der Karte steht „im Bild“ / „nicht im Bild“ —
ob die zugehörige OBS-Quelle in der laufenden Szene sichtbar ist. Die Kopfzeile nennt die laufende
OBS-Szene, nur als Hinweis. Umgeschaltet wird in OBS oder am Stream Deck, nicht im Tool
(entschieden am 06.10.: eine dritte Stelle zum Umschalten verwirrt eher).

**Chat & Bot → Befehle.** Eine Liste der pflegbaren Befehle, gruppiert in „Eigene Texte“ und
„Aus der Welt nachschlagen“. Filter „Aktiv / Ausgeschaltet“. Die eingebauten Befehle
(`!song`, `!sr`, `!todo` …) stehen nicht in der Liste (entschieden am 06.10.); ihre Pause
steht unter „Von selbst“. Je Zeile:
Stern (steht in `!befehle` vorn), Name, der eine Satz für Zuschauer, Zweitnamen,
Zeichenzahl gegen die 500, „Bearbeiten“, „Ausschalten“. Bearbeiten öffnet einen Dialog
mit Name, Antwort, Satz für Zuschauer, Zweitnamen, Pause — damit ist die heutige
Trennung zwischen Textliste, „Übersicht für Zuschauer“ und Zweitnamen-Block aufgehoben.
„Von selbst“ hält Erinnerung und Shoutout bei Raid. „Ausprobieren“ ist das heutige
Testfeld.

**Overlays & Alerts → Overlays.** Links eine Liste aller Overlays, nach Zweck gruppiert
(Immer im Bild · Mitmachen · Heute im Stream · Kanalpunkte · Ganze Bilder · Meldungen); je
Zeile Name, Szenen und ein Punkt: grün „in OBS“, grau „noch nicht in OBS“. Rechts das
gewählte Overlay: ein Satz, eine Vorschau, der OBS-Zustand mit den Szenen, die Adresse
mit „Adresse kopieren“ und empfohlener Größe, „Groß im Browser ansehen“, „Im Stream testen“
mit dem Hinweis, dass Zuschauer es sehen. Keine Knopfreihe je Zeile (06.10.: sechzehn Zeilen
mit je drei Knöpfen waren zu unruhig, und man sah nicht, was ein Overlay ist). Die Vorschau
zeigt **Beispieldaten** (den Showcase-Zustand), solange das Overlay im Standard-Layout ist,
also ohne eigene Überschreibungen und ohne angewendeten Figma-Entwurf; ist es angepasst,
zeigt sie das Overlay **live**, so wie es gerade in OBS steht (06.10.).

**Overlays & Alerts → Alerts.** Eine Karte je Anlass: Name, wann er kommt, die Tafel als
Vorschau mit Beispielname, Ton-Zustand („Kein Ton“ orange), „Bearbeiten“ für Text, Ton und
Lautstärke in einem Schritt, „Im Stream testen“. Oben eine Zählung der Alerts ohne Ton.
Meilensteine, Szenen und Aussehen (Themes, Schrift, Figma) sind Unterreiter mit ihrem
heutigen Inhalt. In „Szenen in OBS“ heißt die Zuordnung „Szene per Kanalpunkt“: Belohnung
→ Szene, „Zurück nach n Sekunden zu“ Szene oder „Vorherige Szene“; jedes Szenenfeld ist eine
Auswahlliste aller OBS-Szenen, nie ein Textfeld (06.10.).

**Nach dem Stream.** Drei Unterreiter. **Content planen** ist der Kern (entschieden am
06.10.): Die gemerkten Momente sind nicht bloß Clip-Marken, sondern der Anfang der
Content-Planung. Ein Brett mit vier Schritten – Neu · Geplant · Geschnitten · Veröffentlicht –,
jeder Moment steht in genau einem. Die Spalten sind nur eine Kopfzeile mit Zahl, keine Kästen.
Eine Karte ist ein einziger Klick (die ganze Karte öffnet den Dialog) und zeigt höchstens
drei Zeilen: Titel oder Hook · Datum, Minute im Stream, Schlagwort · ab „Geplant“ Plattformen
und Termin in einer Zeile; fehlen sie, steht dort „Noch ohne Plattform und Termin“.
**Weiterschieben** geht auf zwei Wegen: im Dialog über die Schritt-Reihe (vier
Pillen, die aktuelle markiert, jede andere anklickbar) und den großen Knopf „Weiter zu
<nächster Schritt>“ – oder per Ziehen der Karte in eine andere Spalte (Maus; der Dialog
ist der Weg für Tastatur). Der Dialog hält außerdem Plattformen, Termin, Titel/Hook,
Notiz, „Twitch-Clip öffnen“, Notion-Übergabe und Löschen; „Fertig“ oder „Schließen“ beendet ihn. Was das Tool von selbst gemerkt hat,
steht in „Neu“ orange umrandet mit „Behalten“ / „Verwerfen“ als einzige sichtbare Knöpfe auf
dem Brett. Oben ein Satz und „+ Idee“; unten eine Zeile „Von selbst merken ist an …“ mit
„Ändern“ statt einer Einstellungs-Karte. Veröffentlichtes bleibt 30 Tage sichtbar, dann Archiv.
**Das geht über das heutige Clips-Panel hinaus** (Status, Plattform, Termin, Ideen ohne
Moment, Archiv) und ist damit die eine neue Funktion im Umbau; sie bekommt ein eigenes Issue
und wird in Stufe 6 gebaut, die Notion-Übergabe bleibt als Textlink. Die Statistik beginnt
mit einem Satz über den letzten Stream, dann Zahlen. Kanalpunkte als Rangliste je Zuschauer
(Platz, Name, Einlösungen, Aufschlüsselung) neben einem Verlauf in Sätzen („Kartograph hat
das Glücksrad gedreht.“), keine Tabellenspalten.

## Technischer Zuschnitt

- `App.tsx` verliert `AREAS`/`TABS` und das Brett. Neu: `navigation.ts` (Bereiche,
  Unterreiter, Namen, je ein Satz — die eine Quelle für Leiste, Kopfzeilen und
  Start-Karten), `Shell.tsx` (Leiste + Kopfzeile + Seite), `pages/<Bereich>Page.tsx`.
- Die bestehenden Panels bleiben zunächst als Bausteine erhalten und werden von den
  Seiten eingebunden; ihre Kopfzeilen (h2, Symbol) entfallen, weil die Seite sie trägt.
- Gemeinsame Bausteine unter `components/ux/`: `PageHeader`, `SubTabs`, `ListRow`,
  `StatusChip`, `Dialog`. Emoji-Symbole weichen Wörtern.
- Neuer Server-Endpunkt `GET /api/readiness`: liefert die Prüfpunkte als Liste
  `{ id, ok, title, consequence?, target? }`. Die Logik liegt in
  `src/server/readiness.ts` und ist ohne Oberfläche prüfbar.
- „im Bild“: `GET /api/obs/visible-overlays` — welche Overlay-Quellen in der
  laufenden Szene sichtbar sind (Gruppen mitgelesen); bei jedem Szenenwechsel per
  WebSocket neu.
- Vorschau in „Overlays“: ein `<iframe>` auf `/overlay/<name>/index.html?state=<Zustand>`,
  solange `overlay_config.overrides[<name>]` leer ist und kein Figma-Entwurf angewendet;
  sonst `/overlay/<name>/index.html` ohne `state`. Welcher Zustand als Beispiel dient, steht
  je Overlay in `states.json` (`preview: true`).
- Der zuletzt offene Bereich und Unterreiter werden in `localStorage` gemerkt.
- Farben und Schrift bleiben die heutigen (`index.css`, Akzent `#e67e22`).

## Reihenfolge

Jede Stufe ist für sich benutzbar und wird einzeln geplant und gebaut.

1. **Gerüst.** Leiste, Kopfzeilen, Unterreiter, neue Namen; alle heutigen Panels an
   ihren neuen Ort; Brett-Funktionen entfernt. Danach ist schon alles auffindbar. (Gebaut am 06.10.)
2. **Bereitschaft.** Verbindungsmarken in der Leiste, `readiness`, Hinweisbalken auf „Im
   Stream“ (statt einer Startseite; gebaut am 06.10. direkt nach Stufe 1).
3. **Chat & Bot.** Eine Befehlsliste mit Filtern und Bearbeiten-Dialog.
4. **Im Stream.** Einheitliche Karten, „im Bild“.
5. **Overlays & Alerts.** Overlay-Liste mit OBS-Zustand; Unterreiter aufgeräumt.
6. **Nach dem Stream** mit dem Content-Planungsbrett, **Einstellungen** bereinigt; Hilfe-Texte
   auf die neuen Wege.

## Prüfen

- Unit-Tests für `navigation.ts` (jedes heutige Panel hat genau einen Ort),
  `readiness.ts` und die Sichtbarkeits-Abfrage.
- Je Stufe ein Durchlauf in Chrome gegen das laufende Tool (Token im URL-Hash):
  jede Seite öffnen, zählen, fotografieren. Kein Klick im Fenster des Nutzers.
- Schreibende Prüfungen nur gegen eine Kopie der `stream.db`.

## Nicht Teil davon

Neue Funktionen – mit einer Ausnahme, dem Content-Planungsbrett unter „Nach dem Stream“
(eigenes Issue, Stufe 6). Außerdem nicht: der Kompendium-Stil der Overlays, das
Stream-Deck-Plugin, der Figma-Pilot, eine englische Fassung der Oberfläche.

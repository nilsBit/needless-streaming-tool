# Bedienung neu aufbauen — Spezifikation

Stand: 2026-10-05. Klickbarer Prototyp (sieben Seiten): https://claude.ai/artifact/5Nw7Ci85coRGA526iNv8u7

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

Eine feste Leiste links mit fünf Bereichen nach Situation, darunter Einstellungen und
Hilfe. Ein Bereich zeigt eine Seite; hat er mehrere Themen, stehen sie als Unterreiter
oben auf der Seite. Die Kopfzeile jeder Seite nennt den Bereich und einen Satz dazu.

| Bereich | Unterreiter | Kommt aus (heute) |
|---|---|---|
| **Start** | — | neu |
| **Im Stream** | — (Karten) | ChallengePanel, IssuesPanel, DesignsPanel, ProgressPanel, SongPanel, Szenenwechsel aus ObsPanel, „Moment merken“ aus ClipsPanel |
| **Chat & Bot** | Befehle · Von selbst · Ausprobieren | TextCommandsPanel, CommandOverview, Settings → Features → Chat Commands (Erinnerung, Shoutout) |
| **Overlays & Alerts** | Overlays · Alerts · Meilensteine · Szenen in OBS · Aussehen | OverlaysPanel (Overlays, Design, Figma), AlertSettings, MilestonesPanel, ObsPanel (Szenen anlegen, Zuordnung) |
| **Nach dem Stream** | Gemerkte Momente · Statistik · Kanalpunkte | ClipsPanel, StatsPanel, RewardStatsPanel, Settings → Features → Auto-Clips |
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
| Now Playing / Song Queue | Musik / Wunschliste |
| Clip Moments | Gemerkte Momente |
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

### Was wegfällt

- Die Umschaltung „Live / Produktion“ und die Reiterzeile daneben.
- Verschieben, Anpinnen, Ausblenden und Einklappen von Kästen samt der Leiste
  „Ausgeblendet“ (`useDashboardLayout`, Einstellung `ui.dashboard_layout`).
  **Annahme** — im Entwurf benannt, von Nils nicht beanstandet. Was er im Stream nicht
  braucht (Bestenliste, Ziel), lässt sich stattdessen in Einstellungen → App abwählen.

## Die Seiten

**Start.** Oben vier Zustandsmarken (Twitch, Bot im Chat, OBS, Worldbuilder). Darunter
„Bereit für den Stream?“: eine Liste von Prüfpunkten; ein offener Punkt nennt die Folge
und hat einen Knopf, der zur richtigen Stelle springt. Darunter je Bereich eine Karte
mit einem Satz und den Stichworten, was dort liegt.

Prüfpunkte der ersten Fassung: Twitch verbunden und Bot im Kanal · OBS verbunden ·
Szenen `start`/`end`/`brb` vorhanden · Overlays als Quellen in OBS gefunden ·
Worldbuilder erreichbar · mindestens ein aktiver Befehl · Alert-Töne hinterlegt
(Hinweis, kein Fehler).

**Im Stream.** Karten in einem Raster, jede mit Titel, einem Satz, der einen Eingabe
und der einen Auslösung. Rechts oben an der Karte steht „im Bild“ / „nicht im Bild“ —
ob die zugehörige OBS-Quelle in der laufenden Szene sichtbar ist. Der Szenenwechsel
steht in der Kopfzeile.

**Chat & Bot → Befehle.** Eine Liste für alles, gruppiert in „Eigene Texte“, „Aus der
Welt nachschlagen“ und „Eingebaut“. Filter „Aktiv / Ausgeschaltet / Eingebaut“. Je Zeile:
Stern (steht in `!befehle` vorn), Name, der eine Satz für Zuschauer, Zweitnamen,
Zeichenzahl gegen die 500, „Bearbeiten“, „Ausschalten“. Bearbeiten öffnet eine Seitenlade
mit Name, Antwort, Satz für Zuschauer, Zweitnamen, Pause — damit ist die heutige
Trennung zwischen Textliste, „Übersicht für Zuschauer“ und Zweitnamen-Block aufgehoben.
„Von selbst“ hält Erinnerung und Shoutout bei Raid. „Ausprobieren“ ist das heutige
Testfeld.

**Overlays & Alerts → Overlays.** Eine Zeile je Overlay: deutscher Name, ein Satz,
Zustand „in OBS · <Szenen>“ oder „noch nicht in OBS“, „Vorschau“, „Adresse kopieren“,
„Im Stream testen“. Der Test-Knopf trägt den Hinweis, dass Zuschauer ihn
sehen. Alerts, Meilensteine, Szenen und Aussehen (Themes, Schrift, Figma) sind
Unterreiter mit ihrem heutigen Inhalt.

**Nach dem Stream.** Nur Ansehen: gemerkte Momente, Statistik, eingelöste Kanalpunkte.

## Technischer Zuschnitt

- `App.tsx` verliert `AREAS`/`TABS` und das Brett. Neu: `navigation.ts` (Bereiche,
  Unterreiter, Namen, je ein Satz — die eine Quelle für Leiste, Kopfzeilen und
  Start-Karten), `Shell.tsx` (Leiste + Kopfzeile + Seite), `pages/<Bereich>Page.tsx`.
- Die bestehenden Panels bleiben zunächst als Bausteine erhalten und werden von den
  Seiten eingebunden; ihre Kopfzeilen (h2, Symbol) entfallen, weil die Seite sie trägt.
- Gemeinsame Bausteine unter `components/ux/`: `PageHeader`, `SubTabs`, `ListRow`,
  `StatusChip`, `SideDrawer`. Emoji-Symbole weichen Wörtern.
- Neuer Server-Endpunkt `GET /api/readiness`: liefert die Prüfpunkte als Liste
  `{ id, ok, title, consequence?, target? }`. Die Logik liegt in
  `src/server/readiness.ts` und ist ohne Oberfläche prüfbar.
- „im Bild“: `GET /api/obs/visible-overlays` — welche Overlay-Quellen in der
  laufenden Szene sichtbar sind (Gruppen mitgelesen); bei jedem Szenenwechsel per
  WebSocket neu.
- Der zuletzt offene Bereich und Unterreiter werden in `localStorage` gemerkt.
- Farben und Schrift bleiben die heutigen (`index.css`, Akzent `#e67e22`).

## Reihenfolge

Jede Stufe ist für sich benutzbar und wird einzeln geplant und gebaut.

1. **Gerüst.** Leiste, Kopfzeilen, Unterreiter, neue Namen; alle heutigen Panels an
   ihren neuen Ort; Brett-Funktionen entfernt. Danach ist schon alles auffindbar.
2. **Start.** Zustandsmarken, `readiness`, Prüfliste, Bereichskarten.
3. **Chat & Bot.** Eine Befehlsliste mit Filtern und Seitenlade.
4. **Im Stream.** Einheitliche Karten, „im Bild“.
5. **Overlays & Alerts.** Overlay-Liste mit OBS-Zustand; Unterreiter aufgeräumt.
6. **Nach dem Stream** und **Einstellungen** bereinigt; Hilfe-Texte auf die neuen Wege.

## Prüfen

- Unit-Tests für `navigation.ts` (jedes heutige Panel hat genau einen Ort),
  `readiness.ts` und die Sichtbarkeits-Abfrage.
- Je Stufe ein Durchlauf in Chrome gegen das laufende Tool (Token im URL-Hash):
  jede Seite öffnen, zählen, fotografieren. Kein Klick im Fenster des Nutzers.
- Schreibende Prüfungen nur gegen eine Kopie der `stream.db`.

## Nicht Teil davon

Neue Funktionen, der Kompendium-Stil der Overlays, das Stream-Deck-Plugin, der
Figma-Pilot, eine englische Fassung der Oberfläche.

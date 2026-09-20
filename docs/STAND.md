# Stand & Übergabe

Einstieg für einen neuen Rechner oder eine neue Claude-Session. **Offene Arbeit
steht in den GitHub Issues** (`gh issue list`) — dieses Dokument erklärt das
Große Ganze, wie die beiden Projekte zusammenhängen und wo wir stehen.

Stand: 20. September 2026.

## Worum es geht

Die Streams sind Worldbuilding-Streams: Eine Welt wird live geschrieben — ihre
Figuren, Orte, Gilden und ihre Lore. Nach einer langen Pause geht das Streamen
wieder los, und dieses Projekt soll dafür fertig werden.

Das Ziel: Figuren, Story und Welt nicht in jedem Stream neu erklären müssen.

1. **Der Chat erklärt sich selbst.** Erklär-Commands mit selbst geschriebenem
   Text (`!story`, `!welt`) und Nachschlage-Commands, die live in der Welt
   suchen (`!figur Mila`, `!ort Saldor`).
2. **Im Bild ist zu sehen, woran gerade gearbeitet wird.** Eine Eintragskarte
   im Lexikon-Stil, die dem Eintrag folgt, der im Worldbuilder offen ist.

## Die zwei Projekte

| Projekt | Repo | Rolle |
|---|---|---|
| **Needless Streaming Tool** (dieses Repo) | `github.com/nilsBit/needless-streaming-tool` (öffentlich), Branch `main` | Electron-App fürs Streamen: Overlays, Chat-Bot, Stream Deck |
| **Worldbuilder** | `github.com/nilsBit/worldbuilder` (privat), Branch `weltwerkzeug-ausbau` | Electron-App, in der die Welt geschrieben wird |

**Wie sie sich verbinden:** Der Worldbuilder öffnet ein lesendes
„Schaufenster“ — nur auf `127.0.0.1`, hinter einem Token — und legt Port und
Token in `~/.worldbuilder/anschluss.json` ab. Dieses Projekt liest von dort
Einträge, Arten, Beziehungen und den Fokus (welcher Eintrag gerade offen ist).
Geschrieben wird in die Welt nie.

**Die Welten liegen in keinem Repo.** Eine Welt ist eine `.welt`-Datei (z. B.
`~/Documents/Die Verborgene Stadt.welt`) und muss von Hand auf den neuen
Rechner kopiert werden. Womit gearbeitet wird, ist seit dem 19. September
**„Die Verborgene Stadt“** — 25 Einträge, aus Notion übernommen. Wo sie
herkommt und wie man sie nachzieht, steht im Worldbuilder in `START.md`.

**Der dritte Ort ist Discord.** Beide Apps schreiben seit dem 19. September
nach draußen — der Worldbuilder das Lexikon, dieses Projekt die Live-Meldung.
Siehe den nächsten Abschnitt.

## Der dritte Ort: Discord

Der Server **needless.studio** ist das Publikum der Welt: ein Nachschlagewerk
zum Mitlesen und ein Ort für Vorschläge. Er gehört keinem Repo — was ihn
einrichtet, liegt unter `~/Documents/discord-skripte/`.

**Aufbau:** START HERE (welcome, rules, die-welt, faq) · ANNOUNCEMENTS ·
LEXIKON (├neu-im-lexikon und die Foren ├figuren ├regionen ├gilden ├lore) ·
COMMUNITY (allgemein, ├diskussion, ├vorschläge, fan-art) · STREAM (stream-chat,
clips). In den Lexikon-Foren legt nur der Worldbuilder Beiträge an; **Antworten
darunter sind Vorschläge zu genau diesem Eintrag**. Ganz neue Ideen gehören ins
Forum ├vorschläge.

**Wer schreibt was**

- **Worldbuilder → Lexikon.** Kanon-Einträge werden als Forenbeitrag
  veröffentlicht, je Art in ihren Channel, und wieder zurückgenommen, wenn ein
  Eintrag den Kanon verliert. Neues und Geändertes meldet ├neu-im-lexikon.
- **Dieses Projekt → ANNOUNCEMENTS.** Meldet der OBS-Stream den Start, postet
  ein Webhook eine einstellbare Nachricht (`{channel}` wird der Twitch-Kanal).
  Eine Meldung je Stream: ein Neustart innerhalb von 30 Minuten bleibt still.
  Eingestellt unter *Settings → Discord — Live-Meldung*; die Webhook-URL wird
  gespeichert, aber nie an die Oberfläche zurückgegeben. `@everyone` pingt nie.

**Die Geheimnisse liegen außerhalb der Repos** und gehören auch nie hinein:
Webhook-URLs in `~/.worldbuilder/discord-webhooks.json`, die Text-Webhooks der
Info-Channels in `~/.worldbuilder/discord-texte.json`, der Token des Bots
„Weltarchiv“ in `~/Documents/discord-token.txt`.

**Grenzen der Webhooks:** Sie können Forum-Titel nicht umbenennen, Beiträge
nicht ganz löschen und Tags nur beim Anlegen setzen. Was darüber hinausgeht,
braucht den Bot.

## Entschieden

- **Quelle ist der Worldbuilder.** Notion bleibt als alte Quelle drin, wird
  aber nicht mehr ausgebaut.
- **Erklären im Chat: beides** — eigene Texte und Nachschlagen in der Welt.
- **Einblendung: automatisch folgen und festpinnen.** Die Karte folgt dem
  offenen Eintrag nach einer Wartezeit (Standard 1 s); wer per Hand auswählt,
  pinnt fest.
- **Karten für alle Arten**, nicht nur für Figuren.
- **Design: Lexikon-Stil** (Variante C aus dem Prototyp — Codex-/Dark-Academia-
  Buchoptik). Das Design aller Overlays wird **am Ende noch einmal
  überarbeitet**; Farben und Schriften stehen deshalb als CSS-Variablen oben im
  Overlay.
- **Art-Farbe** aus dem Worldbuilder, **Reifegrad** sichtbar.
- **Spoiler:** ein Schalter pro Eintrag und Feld — auch für Text, Zweitnamen,
  Bild und Beziehungen. Gilt für die Karte und für Antworten im Chat.
- **Verworfene Einträge** erscheinen nirgends im Stream.
- **Harte Regel: Alles bleibt kostenlos.** Keine bezahlten Dienste, auch keine
  kostenlosen Tarife, die später Geld kosten könnten.

## Erledigt

**Needless Streaming Tool**

- #16 Figuren aus dem Worldbuilder bekommen ihre Kurzbeschreibung
- #17 Erklär-Commands: eigene Texte, Cooldown, lange Antworten werden auf
  mehrere Chat-Nachrichten verteilt, `!befehle`
- #18 Nachschlage-Commands: `!figur`, `!ort`, `!gilde`, `!begriff` und eigene
- #19 Eintragskarte im Lexikon-Stil, Welt-Panel, Spoiler-Schalter
- #20 Karte folgt dem Worldbuilder, Festpinnen, Stream-Deck-Knopf
  „Karte festpinnen“
- #21 Hilfe-Seite passt wieder zum Code, `!uptime` zählt ab Stream-Start
- Beziehungen auf der Karte („Gehört zu: …“)
- #23 **Alle zwölf Overlays im Lexikon-Stil.** Ein gemeinsames `boot.js` und
  ein `lexikon.css` statt einer Kopie des Boot-Blocks in jeder Datei; die
  Palette liegt in der Datenbank (Migration v20), also erreicht sie die
  Einstell-Seite. Drei Gewichte: voll (Eintragskarte, Bestenliste), schlank
  (Song, Songliste, Tasks, Fortschritt, Meilenstein, Challenge, Umfrage),
  flüchtig (Alerts, Platzwechsel, Glücksrad). Ein Test nennt beim Namen, wer
  je aus dem System fällt. Plan und Begründung: `docs/overlay-lexikon-plan.md`
  und `docs/overlay-lexikon-design.md`.
- Glücksrad: Es blieb nie auf dem Gewinner stehen, den der Server gezogen
  hatte — `spins` war gebrochen, also drehte es sich um einen Zufallswinkel zu
  weit. Aufgefallen wäre es am Alert, der den richtigen Namen nannte.
- **Live-Meldung nach Discord**, wenn OBS den Stream startet (siehe oben).
- Der Stream-Timer lief nach einem Neustart der App wieder weiter, statt bei
  null anzufangen.
- Die Overlay-Palette steht auf „Lexikon“.
- **Beide Apps zusammen** (19. September, Windows, mit einer Prüfwelt): Arten,
  Listen, Beziehungen und das Folgen kommen durch, die Karte rendert im
  Browser. Dabei gefunden: ein **verworfener** Eintrag stand in der Liste im
  Panel, im Stream-Deck-Durchlauf, und die Karte folgte ihm, sobald er im
  Worldbuilder offen war. Jetzt lässt schon der Lader ihn weg, und das Folgen
  bleibt auf der letzten Karte stehen (`discarded`).

**Worldbuilder** (Tickets in `.scratch/stream-anbindung/`)

- 01 Schaufenster lässt sich unter *Verwalten* öffnen
- 02 `GET /fokus` — welcher Eintrag gerade offen ist
- 03 Beziehungen eines Eintrags im Schaufenster

**Worldbuilder** (Tickets in `.scratch/discord-veroeffentlichung/`)

- 01–04 Veröffentlichen nach Discord: der Weg nach draußen, Ziele je Art,
  Ändern statt Doppeln, Zurückziehen. Dazu der Knopf „Veröffentlichen“ am
  Eintrag, *Verwalten → Veröffentlichen* und „Welt und Discord“,
  `pnpm veroeffentlichen <welt> --alle` und die Meldungen in ├neu-im-lexikon.
  Warum kein Sync: ADR-0023 im Worldbuilder.

## Wo wir stehen geblieben sind

**Offen (GitHub Issues)**

- **#11** Installieren-Knopf fürs Stream-Deck-Plugin: Der Fix ist drin
  (`40fe0bd`), es fehlt nur die Kontrolle an einem gepackten Build. Unter macOS
  `npm run build:mac`, dann prüfen, ob
  `release/mac-arm64/Needless Streaming Tool.app/Contents/Resources/assets/`
  die Plugin-Datei enthält. Unter Windows `npm run build:win` und
  `release/win-unpacked/resources/assets/`.
- **#10** Hardware-Test am echten Stream Deck, inklusive „Karte festpinnen“.
- **#22** Die Tests wackeln unter hoher Last — Ursache offen. Neu belegt: der
  Fehler ist keine fehlgeschlagene Zusicherung, sondern
  `Error: Parse Error: Expected HTTP/` in `entries.test.ts`, also
  Transportebene. Allein läuft die Datei mit 16 von 16 durch.
- **#23** Der Lexikon-Umbau steht, aber **niemand hat die Overlays in OBS
  gesehen** — alle Prüfungen waren Kopfrenderings gegen einen Nachbau.
  Ebenfalls offen: die Meilenstein-Icons sind weiter neongrün, -pink und
  -cyan und beißen sich mit dem Pergament — eine Design-Entscheidung.
  (Erledigt: `roulette-result` kommt jetzt 5,5 s nach `roulette-spin`, der
  Alert verrät den Gewinner nicht mehr, während das Rad dreht.)

**Noch nie gemacht**

- Die Panels **Welt** und **Erklär-Commands** in der laufenden App
  durchklicken.
- Die **Live-Meldung an einem echten Stream** sehen — geprüft ist sie bisher
  nur gegen einen nachgebauten Webhook.
- Die Overlays als **Browser-Quelle in OBS** über echtem Videobild ansehen.

**Achtung beim Start**

- Der Chat-Bot kam zuletzt nicht rein: `[Bot] Connection failed: Login
  authentication failed`. Ohne Bot-Login antwortet kein einziger
  Erklär-Command. Sieht nach abgelaufenem Twitch-Token aus — in den Settings
  neu anmelden.

**Einmal einstellen**

- In *Projekt → Erklär-Commands → Aus der Welt nachschlagen* die Arten auf die
  Welt anpassen. Sie stehen noch auf den Notion-Arten und **greifen deshalb
  ins Leere**: `!ort` → Ort, `!gilde` → Fraktion, `!begriff` → Konzept. „Die
  Verborgene Stadt“ kennt stattdessen Region, Gilde und Begriff; nur `!figur`
  → Figur passt schon.
- Die **Erklär-Texte fehlen ganz** — `!story` und `!welt` gibt es noch nicht.
  Der Text für beide lässt sich aus dem Discord-Channel ├die-welt ableiten.
- In *Projekt → Welt* die Quelle auf **Worldbuilder** stellen — steht schon.

**Später**

- Design aller Overlays überarbeiten.
- Im Worldbuilder: Branch `weltwerkzeug-ausbau` nach `main` bringen.
- Auf dem Discord-Server: der alte doppelte Test-Beitrag „Saldor“ in
  ├regionen muss weg, AutoMod und Regel-Bestätigung einschalten, Server-Icon,
  Rolle „Stream-Ping“, Server-Guide. Ein Bot-Vorhaben liegt daneben:
  Forum-Titel umbenennen und Beiträge ganz löschen, was Webhooks nicht können.
- Der Prototyp mit den vier Kartenvarianten liegt nur lokal auf dem alten
  Rechner (Branch `prototype/eintragskarte`, bewusst nicht gepusht — er enthält
  Weltinhalte). Die Entscheidung steht in #19.

## Auf einem neuen Rechner einrichten

**Voraussetzungen:** Git, Node 22 oder neuer (der Worldbuilder braucht
`node:sqlite`; zuletzt mit Node 23.6 gearbeitet), pnpm 10 (`corepack enable`),
optional die GitHub CLI (`gh`), OBS mit aktiviertem WebSocket-Server.

**Needless Streaming Tool**

```bash
git clone https://github.com/nilsBit/needless-streaming-tool.git stream-toolkit
cd stream-toolkit
npm install
(cd streamdeck-plugin && npm install)
npm run build:plugin      # baut das Stream-Deck-Plugin für den Installieren-Knopf
npm run dev
```

Das `cd` ist nicht bloß Geschmackssache: `npm --prefix streamdeck-plugin install`
aus dem Wurzelverzeichnis trägt mit npm 10.3 das Hauptprojekt als Abhängigkeit
`"needless-streaming-tool": "file:.."` in `streamdeck-plugin/package.json` ein.

Die Einstellungen liegen in `data/stream.db` und sind **nicht** im Repo —
Erklär-Commands, Nachschlage-Commands, Spoiler-Schalter, Settings. Zum Umziehen
auf dem alten Rechner *Settings → Backup* exportieren und auf dem neuen
importieren (oder `data/stream.db` kopieren, während die App aus ist). Twitch,
OBS und den Stream-Deck-Token danach in den Settings prüfen.

**Worldbuilder**

```bash
git clone https://github.com/nilsBit/worldbuilder.git
cd worldbuilder
git switch weltwerkzeug-ausbau
pnpm install
pnpm dev
```

Dann die `.welt`-Datei öffnen und unter *Verwalten* das Schaufenster öffnen.
Eine Welt aus einer älteren Version hebt der Worldbuilder beim Öffnen auf die
aktuelle Schemaversion — vorher eine Kopie behalten.

**Auf Windows**

Beide Projekte sind auf macOS entstanden; seit dem 15. September 2026 laufen
sie auch unter Windows. Was dort anders ist:

- **Kein `lsof`.** Der Port-Check geht über `Get-NetTCPConnection` — die
  Befehle stehen in `CLAUDE.md`.
- **pnpm über corepack.** Der Worldbuilder pinnt `pnpm@10.28.0` in
  `packageManager`; `corepack pnpm …` zieht genau diese Fassung, auch wenn
  global eine ältere installiert ist. `corepack enable` darf dabei mit `EPERM`
  am Yarn-Shim scheitern — für pnpm ist das ohne Belang.
- **Keine Bash-Syntax in `package.json`.** `VAR=wert befehl` versteht
  PowerShell nicht. Im Worldbuilder setzen deshalb `skripte/durchgaenge.mjs`
  und `skripte/oeffne.mjs` die Umgebung bzw. öffnen Dateien so, dass es auf
  allen drei Systemen gleich funktioniert. Neue Skripte bitte genauso anlegen.
- **Eine geöffnete Datei lässt sich nicht löschen.** Was unter macOS
  durchgeht, scheitert hier mit `EPERM`. Genau so kam heraus, dass `oeffneWelt`
  den SQLite-Handle auf dem Fehlerpfad offen ließ.

Auf diesem Rechner liegen die Projekte unter `D:\dev\stream-toolkit` und
`D:\dev\worldbuilder`, nicht unter `~/`.

**Im Stream**

- OBS: Browser-Quelle `http://localhost:4000/overlay/character/index.html`,
  etwa 800 × 700.
- Needless Streaming Tool: *Projekt → Welt* → Quelle Worldbuilder,
  „Worldbuilder folgen“ ist an.

## Für Claude in einer neuen Session

- Auf **Deutsch** schreiben, mit echten Umlauten (ä, ö, ü, ß — nie
  ae, oe, ue, ss).
- In diesem Repo sind Code, Commits und Issues **englisch** (siehe
  `CLAUDE.md`). Im Worldbuilder ist die Domänensprache Deutsch, auch in Code
  und Commits.
- Alles bleibt kostenlos — vor jedem Vorschlag zu Diensten, Hosting oder
  Bibliotheken dagegen prüfen.
- Die Hilfe-Seite (`src/renderer/src/docs/help-de.ts`) bei jeder
  Feature-Änderung mitpflegen.
- Wo was steht: offene Arbeit in den **Issues** (hier) bzw. in `.scratch/`
  (Worldbuilder), Begriffe in `CONTEXT.md`, Regeln und Befehle in `CLAUDE.md`,
  der Worldbuilder-Stand in dessen `START.md`.
- Vor jedem Commit: `npm run typecheck && npm test && npm run lint`.
  **Den Exit-Code einzeln abholen, nicht auf `set -e` verlassen:**

  ```bash
  npm test > /tmp/test.log 2>&1; CODE=$?    # erst danach filtern
  ```

  Die Shell hier ist zsh, und dort bricht `set -e` bei einer Pipeline nicht
  ab — auch mit `pipefail` nicht. `npm test 2>&1 | grep …` meldet den roten
  Lauf brav auf dem Bildschirm und macht trotzdem weiter. So ist am
  15. September ein Typfehler auf `main` gelandet, und später noch einmal ein
  Commit durchgelaufen, während die Suite rot war. `npm test` selbst reicht
  den Code 1 korrekt durch, auch durch Electron hindurch — der Fehler lag
  jedes Mal an der Pipe.

# Stand & Übergabe

Einstieg für einen neuen Rechner oder eine neue Claude-Session. **Offene Arbeit
steht in den GitHub Issues** (`gh issue list`) — dieses Dokument erklärt das
Große Ganze, wie die beiden Projekte zusammenhängen und wo wir stehen.

Stand: 15. September 2026.

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
Rechner kopiert werden.

## Entschieden

- **Quelle ist der Worldbuilder.** Notion bleibt als alte Quelle drin, wird
  aber nicht mehr ausgebaut.
- **Erklären im Chat: beides** — eigene Texte und Nachschlagen in der Welt.
- **Einblendung: automatisch folgen und festpinnen.** Die Karte folgt dem
  offenen Eintrag nach einer Wartezeit (Standard 3 s); wer per Hand auswählt,
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

**Worldbuilder** (Tickets in `.scratch/stream-anbindung/`)

- 01 Schaufenster lässt sich unter *Verwalten* öffnen
- 02 `GET /fokus` — welcher Eintrag gerade offen ist
- 03 Beziehungen eines Eintrags im Schaufenster

## Wo wir stehen geblieben sind

**Offen (GitHub Issues)**

- **#11** Installieren-Knopf fürs Stream-Deck-Plugin: Der Fix ist drin
  (`40fe0bd`), es fehlt nur die Kontrolle an einem gepackten Build. Unter macOS
  `npm run build:mac`, dann prüfen, ob
  `release/mac-arm64/Needless Streaming Tool.app/Contents/Resources/assets/`
  die Plugin-Datei enthält. Unter Windows `npm run build:win` und
  `release/win-unpacked/resources/assets/`.
- **#10** Hardware-Test am echten Stream Deck, inklusive „Karte festpinnen“.
- **#22** Die Tests sind zweimal unter hoher Last gewackelt — Ursache offen.

**Noch nie gemacht**

- Beide Apps **zusammen** laufen lassen. Getestet ist jede Seite gegen einen
  Nachbau der anderen.
- Die Panels **Welt** und **Erklär-Commands** in der laufenden App
  durchklicken.

**Einmal einstellen**

- In *Projekt → Erklär-Commands → Aus der Welt nachschlagen* die Arten auf die
  Welt anpassen. Für „Die Verborgene Stadt“: `!ort` → Region, `!gilde` → Gilde,
  `!begriff` → Begriff.
- In *Projekt → Welt* die Quelle auf **Worldbuilder** stellen.

**Später**

- Design aller Overlays überarbeiten.
- Im Worldbuilder: Branch `weltwerkzeug-ausbau` nach `main` bringen.
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
- Vor jedem Commit: `npm run typecheck && npm test && npm run lint` — und die
  Exit-Codes nicht durch `| grep` verschlucken. Genau so ist am 15. September
  ein Typfehler auf `main` gelandet.

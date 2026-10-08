# Eigene Punkte — Design

> Entworfen am 08.10.2026, von Nils im Chat abgenommen („passt so“). Ausgangspunkt war #24
> (Twitch-Belohnungen aus dem Tool anlegen): Nils will zuerst ein **eigenes Punktesystem
> zusätzlich** zu den Twitch-Kanalpunkten, nicht stattdessen. #24 kommt danach und benutzt die
> Aktionen mit, die hier entstehen.

## Worum es geht

Zuschauer sammeln im Stream Punkte des Tools — fürs Zuschauen, Chatten, für Follows, Subs, Raids
und Bits, und von Mods vergeben. Sie geben sie im Chat für Belohnungen aus, die der Streamer im
Tool anlegt. Vor allem zeigen die Punkte, **wer am meisten beigetragen hat** (Nils' Wunsch).

Die Twitch-Kanalpunkte bleiben, wie sie sind. Es gibt keinen Umtausch und keine Verbindung
zwischen beiden; ein Kanal ohne Affiliate bekommt so trotzdem Belohnungen.

## Entscheidungen

- **Zwei Zahlen je Zuschauer.** **Beitrag** ist alles je Verdiente und sinkt durch Ausgeben nie;
  er trägt die Bestenliste. **Guthaben** ist, was gerade ausgegeben werden kann. Dazu der
  **Beitrag in diesem Stream**, der beim Start jedes Streams auf null geht.
- **Verdient wird nur live.** Das Tool hört auf die EventSub-Ereignisse `stream.online` und
  `stream.offline` (keine neue Berechtigung). Ohne laufenden Stream gibt es keine Punkte — auch
  nicht beim Testen mit offenem Chat.
- **Für alle Streamer.** Ein eigenes Feature „Eigene Punkte“ in „Was dein Stream kann“, nicht
  vorausgewählt. Der Name der Währung ist einstellbar (Standard „Punkte“).
- **Nur Summen, kein Protokoll.** Wie bei den Bestenlisten wird nicht festgehalten, wer wann
  wofür etwas bekam.
- **Aktionen sind ein gemeinsamer Baustein.** Glücksrad, Vorschlag, Musikwunsch, Szenenwechsel
  und „nur Alert“ werden aus `handleRedemption` (`src/server/bot/eventsub.ts`) in ein Modul
  gezogen, das eine Aktion nach Schlüssel ausführt. Die Twitch-Einlösung ruft es weiter über die
  Namenserkennung auf, die Punkte-Belohnung über ihre gespeicherte Aktion, #24 später über die
  Belohnungs-ID.

## Verdienen

| Quelle      | Standard                                  | Wie erkannt                                   |
|-------------|-------------------------------------------|-----------------------------------------------|
| Zuschauen   | 5 alle 10 Minuten                          | Helix `GET /chat/chatters` je Takt            |
| Chatten     | 1 je Nachricht, höchstens einmal je Minute | `message` in `src/server/bot/events.ts`       |
| Follow      | 50                                         | EventSub `channel.follow` (gibt es schon)     |
| Sub / Resub | 200; verschenkte Subs 200 je Sub an den Schenkenden | tmi `subscription`, `resub`, `subgift`, `submysterygift` |
| Raid        | 100 an den Raider                          | tmi `raided`                                  |
| Bits        | 1 je 10 Bits                               | tmi `cheer`                                   |
| Mods        | `!punkte geben @name 50`, `!punkte nehmen @name 50` | Mod-Badge oder Broadcaster       |

- Alle Zahlen stehen in den Einstellungen; 0 schaltet eine Quelle ab.
- **Zuschauen** braucht die Berechtigung `moderator:read:chatters` in `TWITCH_SCOPES`
  (`src/server/api/auth.ts`). Ein älterer Token wird einmal erneuert; bis dahin meldet der Takt
  das im Log und auf der Twitch-Karte, wie es die Follows tun. Die Liste umfasst auch stille
  Mitleser.
- Der eigene Bot, der Broadcaster und eine einstellbare Liste bekannter Bots
  (Standard: `streamelements`, `nightbot`, `moobot`, `streamlabs`, `soundalerts`) bekommen nichts.
- Verschenkte Subs zählen über den Geschenk-Zähler, den die Alerts schon haben, nicht doppelt.
- **Nehmen** zieht von Guthaben und Beitrag ab (eine Korrektur), nie unter null. Ausgeben zieht
  nur vom Guthaben ab.

## Ausgeben

Der Streamer legt im Tool **Punkte-Belohnungen** an:

| Feld        | Bedeutung                                                        |
|-------------|------------------------------------------------------------------|
| Name        | wie im Chat geschrieben (`!einlösen Glücksrad`), eindeutig, ohne Groß/klein |
| Preis       | ganze Zahl > 0                                                    |
| Aktion      | Glücksrad · Vorschlag · Musikwunsch · Szene X · nur Alert         |
| Eingabe     | ob nach dem Namen Text folgen muss (Vorschlag, Musikwunsch)       |
| Sperrzeit   | Sekunden je Zuschauer, optional                                   |
| An/Aus      |                                                                   |

Chat:

- `!punkte` — eigenes Guthaben, Beitrag und Platz in einer Zeile.
- `!belohnungen` — was es gibt und was es kostet, gekürzt auf eine Chat-Nachricht.
- `!einlösen <Name> [Text]` — zieht den Preis ab und führt die Aktion aus. Reicht das Guthaben
  nicht, die Belohnung ist aus oder gesperrt, antwortet der Bot mit einem Satz und zieht nichts
  ab. Schlägt die Aktion fehl (OBS nicht verbunden, kein offenes Issue fürs Glücksrad), wird der
  Preis zurückgebucht.
- Die Namen der drei Befehle sind wie die anderen eingebauten Befehle umbenennbar
  (`src/server/bot/command-names.ts`).

Der Szenenwechsel darf nur Szenen, die der Streamer in der Belohnung ausgewählt hat — nie eine
Szene aus dem Zuschauertext (Sicherheits-Review 06.10., H5).

## Sichtbar im Stream

- Das Bestenliste-Overlay und der Rangwechsel nehmen zwei neue Schlüssel: `?type=beitrag`
  (gesamt) und `?type=beitrag-stream` (dieser Stream). `getTopRewards` und
  `checkAndBroadcast` in `src/server/reward-leaderboard.ts` lesen für diese Schlüssel aus der
  Punkte-Tabelle statt aus `reward_stats`. Die Schlüssel sind für Bestenlisten reserviert.
- Eine Einlösung mit Aktion „nur Alert“ (und jede andere) geht als Alert `punkte-einloesung`
  ans Alerts-Overlay, mit Name, Belohnung und Text.

## Datenmodell

Neue Tabellen (Migration auf Schema v29):

`viewer_points` — eine Zeile je Zuschauer:

| Spalte           | Bedeutung                                   |
|------------------|---------------------------------------------|
| `user_name`      | Twitch-Login, klein, PRIMARY KEY             |
| `display_name`   | zur Anzeige                                  |
| `balance`        | Guthaben                                     |
| `total`          | Beitrag gesamt                               |
| `stream_total`   | Beitrag dieses Streams                       |
| `last_earned_at` | zuletzt etwas verdient                       |

`point_rewards` — die Punkte-Belohnungen (Felder wie oben, `action` als Schlüssel,
`scene_name` für die Szenen-Aktion).

Die Einstellungen (Name der Währung, Raten, Bot-Liste) liegen in `settings` unter `points_config`.
Sperrzeiten je Zuschauer liegen nur im Speicher. `stream_total` wird bei `stream.online` auf null
gesetzt.

## Datenschutz

- `privacySentence()` (`src/server/privacy-text.ts`) nennt die Punkte, sobald das Feature an ist.
- `forgetViewer` löscht die Zeile in `viewer_points`.
- `pruneViewerData` löscht Zeilen, deren `last_earned_at` ein Jahr zurückliegt
  (`LEADERBOARD_INACTIVE_DAYS`).
- Die Sicherung (`/api/backup/export`) nimmt die Punkte nicht mit — die Bestenlisten
  (`reward_stats`, `leaderboards`) stehen dort auch nicht. Die Punkte-Belohnungen schon, sie
  sind Einstellungen und keine Zuschauerdaten.

## App

Unterreiter **Punkte** unter Chat & Bot (Zuschauer lösen sie dort aus, wo die Befehle wohnen):

- Kopfzeile mit einem Satz, was die Punkte sind und dass sie neben den Twitch-Kanalpunkten laufen.
- Einstellungen: Name der Währung, die Raten der Tabelle oben, Bot-Liste.
- Liste der Punkte-Belohnungen mit „+ Belohnung“, Bearbeiten im Dialog in der Bildmitte.
- Zuschauer: Rangliste nach Beitrag mit Guthaben, Suche, Geben/Nehmen im Dialog.

Jeder Knopf trägt ein Wort. `CONTEXT.md` bekommt **Punkte**, **Beitrag**, **Guthaben** und
**Punkte-Belohnung**; die Hilfeseite erklärt Verdienen, Ausgeben und den Unterschied zu den
Twitch-Kanalpunkten.

## Server

| Route                               | Tut                                                   |
|-------------------------------------|-------------------------------------------------------|
| `GET /api/points/config`            | Einstellungen                                          |
| `PUT /api/points/config`            | speichern, 400 bei negativen Raten                     |
| `GET /api/points/viewers`           | Rangliste, `?q=` sucht                                 |
| `POST /api/points/viewers/:login/adjust` | `{ amount }` geben (positiv) oder nehmen (negativ) |
| `GET/POST/PATCH/DELETE /api/points/rewards` | Punkte-Belohnungen verwalten                    |

Der Takt fürs Zuschauen, die EventSub-Ereignisse und der Helix-Abruf gehören in
`startServer()`, nicht in `createApp()`. Das Gutschreiben selbst ist eine Funktion ohne
Verbindung, damit Tests sie über die HTTP-Naht erreichen.

## Tests (HTTP-Naht)

- Verwaltung: Belohnung anlegen, doppelter Name 400, bearbeiten, löschen; Einstellungen.
- Geben/Nehmen über die Route, nie unter null; Rangliste und Suche.
- Einlösen: zu wenig Guthaben, gesperrt, aus, Erfolg mit Abzug, Rückbuchung bei
  fehlgeschlagener Aktion. Chat-Befehle erreicht kein Test — die einzige Naht ist die HTTP-API.
  **Entschieden (08.10.):** Die App
  bekommt im Zuschauer-Dialog „Für jemanden einlösen“ (`POST /api/points/viewers/:login/redeem`),
  das dieselbe Funktion wie `!einlösen` aufruft. Das ist für Mods nützlich und macht die Regeln an
  der bestehenden Naht prüfbar; die Chat-Zeile selbst bleibt ein dünner Aufruf darauf.
- Zuschauen gegen einen Helix-Stub auf `127.0.0.1`: nur live, Bots ausgenommen.
- Bestenliste `beitrag` und `beitrag-stream` über `/public/…`.
- Vergessen und Ablauf nach einem Jahr.

## Nicht Teil davon

- #24 (Twitch-Belohnungen aus dem Tool) — kommt danach und nutzt die Aktionen mit.
- Ausgaben mit Welt-Bezug (Gewicht bei Abstimmungen, Ideen für Figuren und Orte einreichen).
- Ein Abspann „Mitgewirkt haben“ auf dem Endbild (persönlich, nur für Nils).
- Umtausch zwischen Twitch-Kanalpunkten und eigenen Punkten.

Alles hier ist kostenlos: Helix und EventSub kosten nichts.

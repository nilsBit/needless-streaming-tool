# Mehrere Bestenlisten — Design

> Entworfen am 06.10.2026, am Abend nach „Bestenliste = Flexe“ und der Umstellung der
> Flex-Belohnung auf ihre Twitch-ID (beides vom selben Tag). Von Nils abschnittsweise
> abgenommen („passt so“).

## Worum es geht

Heute gibt es genau eine Bestenliste: Eine Belohnung „Flex“ in Twitch schaltet einen Flex frei,
`!flex` im Chat löst ihn ein und zählt. Nils will stattdessen **mehrere Bestenlisten**, jede an
einer eigenen Twitch-Belohnung, und er will sie dort in der App, wo sie gebraucht werden – nicht
unter „Nach dem Stream“.

Die Overlays Bestenliste und Rangwechsel nehmen heute schon einen Parameter `type` in der Adresse
an, und der Server hält die Top 3 je Typ im Speicher. Das Fundament für mehrere Listen ist da; es
fehlt die Verwaltung darüber.

## Entscheidungen

- **Eine Liste je Belohnung.** Jede Bestenliste hängt an genau einer Twitch-Belohnung. Wer sie am
  öftesten einlöst, steht oben. Andere Quellen (Chat-Aktivität, Songwünsche) sind keine Listen.
- **Die Einlösung zählt direkt.** Kein Freischalten, kein Einlösen per Chat-Befehl. Der
  Flex-Ablauf von heute (`flex_credits`, `!flex`, `src/server/flex.ts`, die Übernahme des
  Stichworts) wird wieder ausgebaut. Ein Modell für alle Listen.
- **Nur angelegte Listen zählen.** Nils legt eine Liste an: Name plus Belohnung aus der
  Twitch-Liste. Belohnungen ohne Liste (Szene, Musik, Glücksrad, Vorschlag) tun weiter, was sie
  tun, zählen aber nirgends.
- **Belohnungen werden über ihre Twitch-ID erkannt,** nicht über den Namen. Umbenennen in Twitch
  ist harmlos; eine in Twitch gelöschte Belohnung zeigt die App an, bis eine andere gewählt ist.
- **Ort in der App:** Unterreiter **Bestenlisten** unter Overlays & Alerts, neben Meilensteine –
  eine Liste wird angelegt, damit sie im Stream als Overlay läuft. Der Unterreiter „Bestenliste“
  unter Nach dem Stream entfällt.
- **Der Flex wird zur ersten Liste.** Die Migration macht aus der gespeicherten Flex-Belohnung die
  Liste „Flex“ (Schlüssel `flex`); die bisherigen Flex-Zählungen bleiben erhalten.

## Datenmodell und Zählung

Neue Tabelle `leaderboards`:

| Spalte         | Bedeutung                                                                 |
|----------------|---------------------------------------------------------------------------|
| `key`          | Schlüssel, aus dem Namen gebildet (`flex`, `angeben`), danach unveränderlich |
| `title`        | Name, wie er in App, Overlay und Chat steht; umbenennbar                   |
| `reward_id`    | Twitch-ID der Belohnung; je Belohnung höchstens eine Liste (UNIQUE)        |
| `reward_title` | Name der Belohnung zur Anzeige, bei jeder Auswahl mitgespeichert            |

Der Schlüssel entsteht beim Anlegen aus dem Namen (Kleinbuchstaben, `a–z0–9`, Bindestrich für
alles andere) und ist eindeutig. Er steht in Overlay-Adressen und in der Zähltabelle; ein Umbenennen
der Liste lässt ihn in Ruhe.

Gezählt wird weiter in `reward_stats` (Zuschauer, Typ, Anzahl, zuletzt); der Typ ist der
Listenschlüssel. Beim Einlösen (`handleRedemption` in `src/server/bot/eventsub.ts`) sucht der
Server die Liste zur Belohnungs-ID. Gibt es eine: ein Punkt dazu, `checkAndBroadcast(key)`, Alert
und Chat-Antwort (siehe unten). Gibt es keine: alles wie heute, nur ohne Zählung. Die Zuordnung der
übrigen Belohnungen am Namen (Roulette, Musik, Szene, Feature) bleibt unverändert.

- Eine Liste löschen löscht ihre Zeilen in `reward_stats`.
- „Wer ein Jahr nicht einlöst, fällt heraus“ (`src/server/retention.ts`) gilt je Liste wie bisher.
- „Zuschauer vergessen“ löscht über alle Listen.
- `queryTop('all')` in `src/server/reward-leaderboard.ts` entfällt; es gibt nur noch Listen.

Entfernt werden die Tabelle `flex_credits`, die Datei `src/server/flex.ts` und die Einstellungen
`flex_reward`, `flex_reward_id`, `flex_reward_title`. `src/server/bot/twitch-rewards.ts` bleibt:
Die Belohnungsliste aus Twitch brauchen Listenverwaltung und Auth-Route gleichermaßen.

## Server

Neue Routen unter `/api/leaderboards`:

| Route                                   | Tut                                                            |
|-----------------------------------------|----------------------------------------------------------------|
| `GET /`                                 | alle Listen mit Zuschauerzahl                                  |
| `POST /`                                | anlegen: `{ title, reward: { id, title } }` → 400 bei leerem Namen, fehlender Belohnung, Belohnung schon vergeben, Schlüssel schon vergeben |
| `PATCH /:key`                           | umbenennen oder Belohnung wechseln                              |
| `DELETE /:key`                          | löschen samt Zählungen                                          |
| `GET /:key/board`                       | die Rangliste dieser Liste (ersetzt `/reward-stats/breakdown`)  |

Die bisherigen Routen `/reward-stats` (Eintrag setzen, löschen, vergessen, Stand eines
Zuschauers) bleiben und nehmen den Listenschlüssel als Typ. `/reward-stats/flex-settings` und
`/reward-stats/flex/credit` entfallen.

Der öffentliche Endpunkt `/public/reward-stats/top?type=<key>` bleibt; `type=all` gibt es nicht
mehr (leere Liste).

Die Liste der Twitch-Belohnungen kommt weiter aus `/api/auth/twitch/rewards`
(`listCustomRewards` in `src/server/bot/twitch-rewards.ts`).

## Overlays

> **Nachtrag 06.10., Abend (Nils: „kann man das nicht nur mit einer URL abfangen?"):** Beide
> Overlays laufen mit **einer** Adresse für alle Listen. Ohne `?type=` zeigt die Bestenliste bei
> jeder Einlösung die betroffene Liste (eingeblendet, mit Namen im Kopf), der Rangwechsel jeden
> Überholer mit Listennamen. `?type=<key>` schränkt eine Quelle auf eine Liste ein. Der Katalog
> führt deshalb wieder **einen** Eintrag je Overlay; die Einträge je Liste von weiter unten sind
> damit hinfällig. Das Update-Ereignis trägt den Listentitel (`title`). Alte Quellen ohne
> Parameter funktionieren damit wieder.

`reward-leaderboard` und `reward-rankchange` bleiben, wie sie sind, inklusive `?type=`. Neu:

- **Der Katalog** (`src/server/overlays/catalog.ts`) führt sie je Liste auf: „Bestenliste: Flex“,
  „Rangwechsel: Flex“, je mit fertiger Adresse `…/overlay/reward-leaderboard/index.html?type=flex`.
  Vorschau, Testen im Stream, HTML bearbeiten, Zurücksetzen und die Anlage in OBS laufen über das
  dahinterliegende Overlay wie heute. Ohne angelegte Liste steht in der Gruppe ein Hinweis: „Lege
  unter Bestenlisten eine Liste an, dann erscheinen hier die Overlays dazu.“
- **Das Bestenliste-Overlay zeigt oben den Namen der Liste.** Dafür liefert `/public/reward-stats/top`
  den Titel mit.
- **Testen im Stream** (`src/server/api/actions.ts`) schickt das Beispiel-Ereignis mit dem
  Schlüssel der getesteten Liste.
- **Die Alert-Tafel** sagt „löst Flex ein, Nr. 12 – Platz 3“ statt „flext“; der Listenname steckt
  im Ereignis. Das WebSocket-Ereignis `flex` wird zu `leaderboard-point`
  `{ key, title, user, login, count, rank }`.

## Chat

- `!flex` entfällt (Befehlsnamen, Befehlsliste, Hilfe).
- `!stats [Name]` zeigt den Stand in allen Listen: „@Name: Flex 12 (Platz 3), Angeben 4
  (Platz 1).“ Wer nirgends steht: „@Name hat noch nichts eingelöst.“
- Beim Einlösen sagt der Bot nichts. (Ursprünglich „💪 @Name: Flex Nr. 12 – Platz 3.“ — nach
  dem ersten Stream-Test gestrichen, Nils 06.10.: „jedesmal diese Notiz macht keinen Sinn“.
  Overlay, Rangwechsel und Alert-Tafel zeigen die Einlösung, `!stats` den Stand.)

## Oberfläche

Unterreiter **Bestenlisten** unter Overlays & Alerts (`navigation.ts`, Panel `leaderboards`):

- Oben die Listen als Karten: Name, Belohnung, Anzahl Zuschauer, dazu „+ Bestenliste“.
- Anlegen: Dialog mit Name und Belohnung (Auswahlliste aus Twitch, wie heute im Flex-Panel). Ohne
  Twitch-Verbindung lässt sich keine Liste anlegen; der Dialog sagt das.
- Karte anklicken öffnet die Rangliste der Liste mit allem, was das heutige `RewardStatsPanel`
  kann: suchen, Zahl korrigieren, Eintrag von Hand, auf null, Zuschauer vergessen. Dazu
  umbenennen, Belohnung wechseln, Liste löschen (mit Rückfrage, nennt die Zahl der Zuschauer).
- Fehlt die Belohnung in Twitch, steht die Warnung auf der Karte und in der Rangliste, mit der
  Möglichkeit, eine andere zu wählen. Bis dahin zählt diese Liste nichts.
- Der Unterreiter „Bestenliste“ unter Nach dem Stream entfällt; `RewardStatsPanel` geht im neuen
  Panel auf.
- „Fertig“ in der Einrichtung (`FinishStep.tsx`) erklärt statt „Name enthält Flex“: Bestenlisten
  legst du unter Overlays & Alerts → Bestenlisten an.
- Hilfe (`help-de.ts`), Befehlsliste, Tastenkürzel-Panel und `CONTEXT.md` folgen.

## Migration

Schema-Migration beim ersten Start nach dem Update:

1. Tabelle `leaderboards` anlegen.
2. Ist `flex_reward_id` gesetzt und nicht leer: Liste `flex` / „Flex“ mit dieser Belohnung
   anlegen. Offene Flexe aus `flex_credits` werden der Zählung in `reward_stats` (Typ `flex`)
   zugeschlagen – niemand verliert, was er bezahlt hat.
3. `flex_credits` löschen; Einstellungen `flex_reward`, `flex_reward_id`, `flex_reward_title`
   löschen.
4. Ist keine Flex-Belohnung gespeichert, entsteht keine Liste. Die alten Zählungen unter Typ
   `flex` bleiben liegen und tauchen wieder auf, sobald eine Liste mit dem Schlüssel `flex`
   angelegt wird (also eine Liste namens „Flex“).

Overlay-Adressen ohne `?type=` in OBS zeigen nach dem Update nichts mehr. Die neuen Adressen
stehen im Katalog; das Changelog sagt es.

## Tests

Über die HTTP-Schnittstelle mit Datenbank im Speicher, wie im Projekt üblich:

- **Listen verwalten:** anlegen, umbenennen (Schlüssel bleibt), Belohnung wechseln, löschen
  samt Zählungen; abgelehnt: leerer Name, doppelte Belohnung, doppelter Schlüssel.
- **Zählen:** Einlösung der verbundenen Belohnung zählt genau in dieser Liste; fremde Belohnung
  zählt nirgends; `reward-leaderboard-update` kommt mit dem Listenschlüssel; `top` liefert Titel.
- **Chat:** `!stats` nennt alle Listen; `!flex` ist kein Befehl mehr.
- **Katalog:** je Liste zwei Einträge mit Parameter; ohne Liste der Hinweis.
- **Migration:** aus der gespeicherten Flex-Belohnung entsteht „Flex“, offene Flexe werden
  zugeschlagen; ohne gespeicherte Belohnung entsteht nichts und die alten Zählungen bleiben.

Die Seite in der App und die Overlays prüft Nils von Hand in der laufenden App.

## Nicht in diesem Entwurf

- Belohnungen aus dem Tool heraus in Twitch anlegen (#24).
- Listen ohne Belohnung (Chat-Aktivität, Songwünsche, Zuschauer-Zeit).
- Ein Overlay, das mehrere Listen abwechselnd zeigt.
- Eine Belohnung, die in mehreren Listen zählt.

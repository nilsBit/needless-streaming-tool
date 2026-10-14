# Belohnungen: Bausteine, Vorlagen je Persona, einfaches Anlegen

Stand: 14.10.2026 · freigegeben im Gespräch mit Nils, Abschnitt für Abschnitt ·
Entwurf A auf der Leinwand „NST Bedienung – Neuaufbau“
(`https://claude.ai/artifact/5Nw7Ci85coRGA526iNv8u7`, Brett `BelohnungA`).

## Ziel

Belohnungen (Kanalpunkte von Twitch und eigene Punkte) sollen für ganz
unterschiedliche Streamer passen – Kreative, Gamer, Talk, Coding – ohne dass
jemand einen Stream-Typ wählen muss (Entscheidung vom 12.10.: keine Pakete nach
Stream-Art, keine Frage beim ersten Start). Jede Belohnung löst im Stream etwas
Sichtbares aus. Das Anlegen ist einfach und zeigt nie mehr Felder, als der
gewählte Baustein braucht.

## Was Nils gesagt hat

- Ansatz C: wenige allgemeine Bausteine plus Vorlagen je Persona.
- Personas: Kreative, Gamer, Just Chatting/Talk, Coding/Tech.
- Jede Belohnung zeigt im Stream etwas, „so wie das Glücksrad“.
- Kein Baustein „Wunsch sammeln“ (Liste mit Einträgen) – „brauche ich nicht“.
- Neu in dieser Runde: „Timer starten“ und „Ton abspielen“. „Quelle kurz
  einblenden“ später.
- „Wir brauchen einen Userflow, der einfach ist; der User soll nicht erschlagen
  werden an Optionen.“ Gewählt: Entwurf A (Vorlage zuerst), „Eigene Belohnung“
  geht Schritt für Schritt.

## Ausgangslage (Code, 14.10.)

- `ACTION_KEYS` in `src/server/reward-actions.ts`: `roulette`,
  `feature_request`, `change_music`, `scene`, `alert`. `runAction` tut nur bei
  `roulette` und `scene` etwas; `feature_request` und `change_music` sind
  technisch ein Alert.
- Twitch: `twitch_reward_actions (reward_id, action, scene_name, scene_seconds)`.
  Eigene Punkte: `point_rewards (…, action, scene_name, scene_seconds,
  needs_input, …)`.
- Was der Zuschauer schreibt (`user_input` bzw. Text bei `!einlösen`) und sein
  Name kommen bei `runAction` nicht an (`bot/eventsub.ts` ~113,
  `points/redeem.ts` ~79). Bei Twitch steht der Text nicht im Alert.
- Ziel mit Uhr: `stream_state` (`challenge_title`, `challenge_status`,
  `timer_seconds`, `timer_running`), nur `PATCH /api/stream-state`, Uhr zählt
  nur hoch (`api/stream-state.ts`, `startServerTimer` nicht exportiert).
- Alert-Töne: `getUserDataPath('alert-sounds')`, `/public/alert-sound/<name>`,
  das Alert-Overlay spielt `alert.sound` (`overlays/alerts/index.html`), der
  `reward-redeemed`-Weg baut seinen Alert ohne Ton.
- Vorlagen: `components/rewards/RewardTemplates.tsx`, fünf Stück, von beiden
  Seiten genutzt; `needsInput` geht in `applyTemplate` verloren.
- Schema v36.

## Bausteine

| Baustein | Schlüssel | Was passiert | Im Stream |
|---|---|---|---|
| Nur ein Alert | `alert` | Meldung, du reagierst | Alert-Tafel; mit Text, wenn „Zuschauer schreibt etwas dazu“ |
| Glücksrad drehen | `roulette` | Rad wählt ein Thema | Rad-Overlay |
| Szene kurz zeigen | `scene` | andere Szene für einige Sekunden | die Szene |
| Timer starten | `timer` (neu) | Aufgabe mit Countdown | Ziel-Overlay mit Aufgabe, „von <Name>“ und Countdown; am Ende kurz „Zeit um!“ |
| Ton abspielen | `sound` (neu) | ein Ton aus den Alert-Tönen | Alert-Tafel mit diesem Ton |

`feature_request` und `change_music` entfallen.

### Timer starten

- Felder beim Anlegen: **Aufgabe** (steht im Overlay, vorbelegt mit dem Namen
  der Belohnung, höchstens 60 Zeichen) und **Dauer** (Knöpfe 1, 3, 5, 10 Min;
  erlaubt 1–60 Min, Standard 5).
- Einlösen: Ziel-Overlay zeigt Aufgabe, „von <Anzeigename>“ und den Countdown.
  Bei 0 steht etwa 5 s „Zeit um!“, dann ist das Overlay wieder wie vorher.
- In der App zeigt die Ziel-Karte den Countdown; Pausieren und „Beenden“ wie
  gewohnt (Beenden = sofort „Zeit um“ überspringen, Ziel zurück).
- Läuft schon ein Belohnungs-Timer: die neue Einlösung schlägt fehl
  (`{ok:false}`) → Punkte zurück (bestehender Weg: Twitch `cancelRedemption`,
  eigene Punkte Rückbuchung).
- Läuft Nils' eigenes Ziel: Titel, Status und Sekunden werden gemerkt, der
  Belohnungs-Timer schiebt sich davor; danach ist das eigene Ziel genau so
  zurück. Die eigene Uhr läuft in der Zwischenzeit weiter (sie wird beim
  Zurückholen um die vergangene Zeit erhöht, falls sie lief).
- Neustart der App: das Ende steht als Zeitpunkt in der Datenbank; beim Start
  läuft der Countdown weiter oder endet sofort, wenn die Zeit um ist.

### Ton abspielen

- Feld: **Ton** aus `listSounds()`, je Ton ein Knopf mit ▶ zum Probehören in
  der App. Lautstärke 80 % fest (kein Regler – weniger Optionen).
- Keine Töne vorhanden: Hinweis „Noch keine Töne – unter Overlays & Alerts →
  Alerts hochladen“ mit Link; „Anlegen“ ist dann gesperrt.
- Einlösen: Alert-Tafel „<Name> · <Belohnung>“ mit Ton.
- Ton inzwischen gelöscht: Alert ohne Ton, keine Rückbuchung.

### Text im Alert

- Option bei „Nur ein Alert“: **„Zuschauer schreibt etwas dazu“** (bei Twitch
  `is_user_input_required`, bei eigenen Punkten `needs_input`).
- Der Text steht im Alert unter dem Namen – jetzt auch bei Kanalpunkten.
- Schutz: höchstens 100 Zeichen (danach „…“), Links (`http…`, `www.…`,
  `xyz.tld/…`) werden zu „[Link]“.

## Datenmodell (Schema 37)

- `twitch_reward_actions`: neue Spalten `task TEXT`, `minutes INTEGER`,
  `sound TEXT`.
- `point_rewards`: dieselben drei Spalten.
- `stream_state`: `timer_ends_at INTEGER` (ms seit 1970, NULL = kein
  Countdown), `timer_task_by TEXT` (Anzeigename), `saved_challenge TEXT`
  (JSON des eigenen Ziels oder NULL).
- Migration `from < 37`: Spalten per `PRAGMA table_info` ergänzen;
  `UPDATE … SET action = 'alert' WHERE action IN ('feature_request',
  'change_music')` in beiden Tabellen.
- `actionFromTitle`: erkennt nur noch Roulette und Szene; „Feature“, „Musik“,
  „Song“ fallen auf Alert.

## Ablauf beim Einlösen

`runAction(action, opts)` bekommt zusätzlich `{ who, input, task, minutes,
sound }`. Beide Aufrufer (`bot/eventsub.ts`, `points/redeem.ts`) reichen
Anzeigename und Text durch.

- `timer` → `startRewardTimer({ task, minutes, who })` (neu, in einem eigenen
  Modul neben `api/stream-state.ts`; `startServerTimer` wird dafür
  herausgelöst und exportiert).
- `sound` → Alert mit `sound: { url: '/public/alert-sound/<name>', volume: 0.8 }`.
- `alert` → Alert mit gekürztem, entschärftem Text, wenn vorhanden.

## Oberfläche

### Neue Belohnung (Entwurf A)

1. **Vorlagen:** Kopfzeile „Neue Belohnung“, darunter Persona-Knöpfe *Alle ·
   Kreativ · Gaming · Talk · Coding* (nur Filter, nichts wird gespeichert),
   darunter Karten mit Name, Preis, einem Satz und dem Baustein als Marke,
   zuletzt „+ Eigene Belohnung“.
2. **Vorlage gewählt:** ein Blatt mit Name, Preis, höchstens einem Feld des
   Bausteins (Dauer bzw. Ton), „So sieht es im Stream aus“, Knöpfe „Andere
   Vorlage“ und „Anlegen“.
3. **Eigene Belohnung:** Schritt für Schritt – *Was soll passieren?* (fünf
   Karten) → das eine Feld des Bausteins (beim Glücksrad entfällt der Schritt) →
   *Name und Preis* (Preis-Knöpfe 100 / 300 / 500 / 1.000, eigener Wert
   möglich) mit Vorschau → „Anlegen“.
4. **Fertig:** „„<Name>“ ist da!“ – wie heute.

Gilt für beide Seiten (Kanalpunkte, eigene Punkte). Die Vorlagen-Leiste auf der
Seite entfällt.

### Vorlagen

| Persona | Name | Baustein | Preis |
|---|---|---|---|
| Kreativ | Thema drehen | Glücksrad | 500 |
| Kreativ | Farbe wählen | Alert mit Text | 300 |
| Gaming | Handicap: 5 Minuten | Timer, 5 Min | 1.000 |
| Gaming | Jumpscare | Ton | 400 |
| Talk | Frage an mich | Alert mit Text | 300 |
| Talk | Trink was! | Ton | 200 |
| Coding | Feature-Wunsch | Alert mit Text | 500 |
| Coding | 10 Minuten ohne Maus | Timer, 10 Min | 1.500 |

Vorlagen mit Ton nehmen den ersten vorhandenen Ton; gibt es keinen, zeigt das
Blatt den Hinweis aus „Ton abspielen“. „Thema drehen“ erscheint nur, wenn das
Glücksrad an ist (wie heute `feature: 'rad'`). Bei eigenen Punkten werden die
Preise durch 10 geteilt (Vorschlag; eigene Punkte sind knapper).

### Bearbeiten

Name, Preis, das Feld des Bausteins, bei Alert „Zuschauer schreibt etwas
dazu“, „An“, „Löschen“. „Text für Zuschauer“ (Twitch-`prompt`) fällt aus dem
Dialog; ein vorhandener Text bleibt bei Twitch stehen.

Schlägt Löschen oder Speichern fehl, zeigt die Meldung den Grund vom Server
(statt „Nicht gelöscht“).

## Tests

- Migration 36 → 37: `feature_request`/`change_music` werden `alert`, neue
  Spalten da, frische DB läuft sauber (Muster `leaderboards-migration.test.ts`).
- Timer: Start setzt Titel, Ende, „von“; zweiter Timer → `{ok:false}`; eigenes
  Ziel wird gemerkt und zurückgeholt; Neustart mit Ende in der Zukunft läuft
  weiter, in der Vergangenheit endet sofort.
- Ton: Alert trägt `sound.url`; fehlende Datei → Alert ohne Ton, `ok:true`.
- Text: 100 Zeichen, Links zu „[Link]“, Twitch-Text erscheint im Alert.
- `actionFromTitle`: „Musik“ → `null`/Alert, „Roulette“, „Szene“ wie bisher.
- Oberfläche: Claude prüft in Chrome (playwright-core) bei 1360 und 420 px;
  keine Durchgänge mit Nils ungefragt.

## Reihenfolge

1. Schema 37 + Umstellung Idee/Musik → Alert
2. Countdown im Ziel (Server, Overlay, Ziel-Karte)
3. Baustein „Timer starten“
4. Baustein „Ton abspielen“ + Text im Alert
5. Neue Belohnung: Vorlagen und eigener Ablauf
6. Bearbeiten-Dialog schlank, Fehlermeldungen mit Grund
7. Hilfe (`docs/help-de.ts`) und `docs/STAND.md`

## Nicht in dieser Runde

„Quelle kurz einblenden“, „Wunsch sammeln“/Listen, Lautstärke-Regler,
Warteschlange für Timer, Typ-Auswahl beim ersten Start.

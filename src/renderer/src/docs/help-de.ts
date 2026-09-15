// Documentation content (German)

export const HELP_SECTIONS_DE = [
  {
    title: 'Erste Schritte',
    content: `Das Stream Toolkit ist deine Zentrale für Streaming. Hier steuerst du alles — Overlays, Challenges, Clips, Aufgaben, Milestones und mehr.

Alle Verbindungen richtest du unter **Settings** ein — Twitch, OBS, Notion und den Stream Deck Token.

**Voraussetzungen:**
- OBS Studio (Version 28+) mit aktiviertem WebSocket Server
- Twitch-Account mit einer App auf dev.twitch.tv
- Optional: Notion-Account für Clip-Sync
- Optional: Elgato Stream Deck`,
  },
  {
    title: 'Twitch verbinden',
    content: `**1. Twitch App erstellen:**
- Gehe auf dev.twitch.tv → Applications → Register Your Application
- Name: beliebig (z.B. "Stream Toolkit")
- OAuth Redirect URL: http://localhost:4000/auth/twitch/callback
- Category: Chat Bot
- Client-ID kopieren

**2. Im Toolkit verbinden:**
- Settings → Twitch Verbindung → Client-ID eintragen
- "Mit Twitch verbinden" klicken → Twitch-Login im Browser
- Nach dem Login verbindet sich der Bot automatisch

**Chat-Commands:**
| Command | Beschreibung |
|---------|-------------|
| !befehle | Listet alle Befehle — deine Erklär-Commands zuerst |
| !challenge | Zeigt aktuelle Challenge |
| !figur | Zeigt die Figur, die gerade im Overlay ist |
| !figur <Name> | Schlägt eine Figur in der Welt nach |
| !ort / !gilde / !begriff <Name> | Schlagen Orte, Gilden und Begriffe nach (einstellbar) |
| !song | Zeigt aktuellen Song |
| !sr <URL> | Wünscht einen Song (YouTube oder Spotify) |
| !queue | Zeigt die nächsten Song-Wünsche |
| !hype | Löst einen Hype Moment aus |
| !issues | Zeigt offene Einträge |
| !todo | Zeigt offene Aufgaben |
| !progress | Zeigt Projekt-Fortschritt |
| !stats [name] | Zeigt eingelöste Rewards |
| !vote <option> | Stimme bei Abstimmung ab |
| !design start/end/status | Chat-Abstimmung |
| !scene | Listet OBS-Szenen (nur Mods) |
| !scene <name> | Wechselt OBS-Szene (nur Mods) |
| !uptime | Zeigt Stream-Laufzeit |

Alle Befehle lassen sich unter Settings → Chat Commands umbenennen. Antworten, die länger als eine Chat-Nachricht (500 Zeichen) sind, verteilt der Bot automatisch auf mehrere Nachrichten.`,
  },
  {
    title: 'Erklär-Commands',
    content: `Erklär-Commands sind Chat-Befehle, deren Antwort du selbst schreibst — für alles, was du sonst in jedem Stream neu erklärst: Worum geht die Story? Wo spielt sie? Was passiert hier?

**Anlegen:** Projekt → Erklär-Commands → „+ Neu“
- **Befehl:** ein Wort, z. B. !story. Das ! kannst du weglassen.
- **Text:** was der Chat lesen soll. Darunter siehst du, in wie viele Chat-Nachrichten er aufgeteilt wird — höchstens 3.
- **Cooldown:** so viele Sekunden antwortet der Befehl nach einer Antwort nicht noch einmal. Mods und du selbst sind davon ausgenommen und starten ihn auch nicht.

**Ausprobieren:** Unten im Panel einen Befehl eintippen, z. B. !befehle — du siehst die Antwort, ohne live zu sein. Getestet wird als Broadcaster, der Cooldown startet also nicht.

**Regeln:**
- Ein Erklär-Command darf nicht heißen wie ein eingebauter Befehl — auch nicht wie ein umbenannter.
- Ausgeschaltete Befehle antworten nicht und stehen nicht in !befehle.
- !befehle nennt deine Erklär-Commands zuerst, dann die Nachschlage-Commands, danach die eingebauten.
- Eigene Texte und Nachschlage-Commands sind im Backup enthalten.

**Aus der Welt nachschlagen:** Nachschlage-Commands suchen live in deiner Worldbuilder-Welt. Zuschauer schreiben z. B. !figur Mila oder !ort Saldor und bekommen Titel, Rolle und Kurzbeschreibung (oder den Text) in einer Chat-Nachricht.
- **Voreingestellt:** !figur → Figur, !ort → Ort, !gilde → Fraktion, !begriff → Konzept. Heißt eine Art in deiner Welt anders (z. B. „Region“ statt „Ort“), wählst du sie im Panel aus. Ein ⚠️ markiert Arten, die es in der offenen Welt nicht gibt.
- **Eigene dazu:** unten im Abschnitt einen Befehl und eine Art wählen, z. B. !fähigkeit → Fähigkeit.
- **Suche:** in Titel und Zweitnamen, ohne auf Groß-/Kleinschreibung oder Akzente zu achten. Ein Teil des Namens reicht („silberzunge“). Ein genauer Treffer schlägt Namen, die ihn nur enthalten.
- **Mehrere Treffer** nennt der Bot. **Kein Treffer:** „Kenne ich (noch) nicht“ — was der Zuschauer getippt hat, wiederholt der Bot nie.
- **Ohne Namen:** !figur zeigt die Figur im Overlay; ist keine drin, und bei allen anderen Befehlen, listet der Bot die Einträge der Art.
- **Verworfen** markierte Einträge findet niemand.
- **Cooldown pro Name:** !figur Mila und !figur Selma bremsen sich nicht gegenseitig.
- **Voraussetzung:** Der Worldbuilder läuft und das Schaufenster ist offen (Worldbuilder → Verwalten → Schaufenster öffnen).`,
  },
  {
    title: 'Welt & Eintragskarte',
    content: `Die Eintragskarte zeigt im Stream, woran du gerade arbeitest — eine Figur, einen Ort, eine Gilde, einen Begriff — als Seite aus dem Lexikon deiner Welt.

**In OBS:** Browser-Quelle mit http://localhost:4000/overlay/character/index.html (dieselbe URL wie früher das Figuren-Overlay), etwa 800 × 700 groß.

**Panel:** Projekt → Welt
- **Quelle:** Worldbuilder oder Notion. Notion kennt nur Figuren.
- **Reiter:** eine Art pro Reiter, mit ihrer Farbe aus dem Worldbuilder. Darunter die Suche.
- **▶** bringt einen Eintrag sofort ins Overlay. **✕ Overlay leeren** blendet die Karte aus.
- **Klick auf einen Eintrag** zeigt alles, was auf der Karte landen könnte — jedes mit einem Schalter.

**Spoiler ausblenden:** 👁 heißt „im Stream zu sehen“, 🙈 heißt „ausgeblendet“.
- Gilt pro Eintrag und Feld: Samaels Kurzbeschreibung ausblenden lässt die von Mila unberührt.
- Auch Text, Zweitnamen und Bild lassen sich ausblenden.
- Ausgeblendetes erscheint weder auf der Karte noch in Chat-Antworten (!figur Samael).
- Wirkt sofort, auch wenn die Karte gerade zu sehen ist. Ist die Kurzbeschreibung aus, rückt der Text nach, wenn er an ist.
- Die Schalter bleiben gespeichert und sind im Backup enthalten.

**Worldbuilder folgen:** Die Karte wechselt von selbst zu dem Eintrag, den du im Worldbuilder öffnest — auf der Karte zählt der Eintrag hinter der gewählten Markierung.
- Erst wenn ein Eintrag die Wartezeit lang offen bleibt (Standard 3 s), springt die Karte um. Durch eine Liste klicken flackert nicht.
- Ist nichts mehr offen, bleibt die letzte Karte stehen.
- **Festpinnen:** Wählst du im Panel einen Eintrag (▶) oder leerst das Overlay, bleibt die Karte stehen, egal was im Worldbuilder offen ist. „Wieder folgen“ — oder der Stream-Deck-Knopf „Karte festpinnen“ — lässt sie wieder folgen, und sie springt sofort zum offenen Eintrag.
- Funktioniert nur mit Worldbuilder als Quelle. Der Worldbuilder muss das Schaufenster offen haben.

**Was die Karte zeigt:** Titel, Zweitname und Rolle, die Kurzbeschreibung (sonst den Text), bis zu vier weitere Felder, den Namen der Welt und den Reifegrad.

**Umgestalten:** Alle Farben, Schriften und Größen stehen als Variablen oben in der Datei. Über Settings → Overlays lässt sich eine eigene Kopie anlegen.`,
  },
  {
    title: 'OBS verbinden',
    content: `**In OBS:**
- Tools → WebSocket Server Settings
- "Enable WebSocket Server" aktivieren
- Port: 4455 (Standard)
- Passwort: setzen oder Authentication deaktivieren

**Im Toolkit:**
- Settings → OBS Verbindung → Host, Port, Passwort eintragen
- "Mit OBS verbinden" klicken

**Scene-Switching via Chat:**
- Mods/Broadcaster: !scene <Szenenname> im Chat
- Viewer: über Channel-Point-Rewards (siehe "Channel Points")

**Scene-Switching via API:**
- POST /api/obs/scene mit { "scene": "Szenenname" }
- GET /api/obs/scenes listet alle Szenen`,
  },
  {
    title: 'Channel Points & Rewards',
    content: `Das Toolkit erkennt Channel-Point-Rewards automatisch über Twitch EventSub.

**Eingebaute Reward-Typen:**
| Reward-Name enthält | Aktion |
|---------------------|--------|
| "roulette" | Glücksrad drehen |
| "feature" | Vorschlag einreichen |
| "musik" oder "song" | Musik ändern |
| "scene" oder "szene" | Szene wechseln (mit User-Input) |

**Feste Scene-Rewards (ohne User-Input):**
Konfiguriere Mappings über die API:
- POST /api/obs/mappings mit Reward-Titel → Szenen-Name
- Beispiel: Reward "Gameplay" → wechselt automatisch zur Szene "Gameplay"
- Viewer muss nichts eingeben, nur die Reward einlösen`,
  },
  {
    title: 'Overlays',
    content: `Overlays werden als **Browser Source** in OBS eingebunden.

**Eingebaute Overlays:**
| Overlay | URL | Beschreibung |
|---------|-----|-------------|
| Progress | /overlay/progress/index.html | Projekt-Fortschritt |
| Milestone | /overlay/milestone/index.html | Achievement-Benachrichtigungen |
| Alerts | /overlay/alerts/index.html | Raids, Rewards, Events |
| Song | /overlay/song/index.html | Aktueller Song |
| Todos | /overlay/todos/index.html | Todo-Liste |
| Poll | /overlay/poll/index.html | Abstimmungen |
| Roulette | /overlay/roulette/index.html | Glücksrad |
| Challenge | /overlay/challenge/index.html | Challenge-Status |
| Eintragskarte | /overlay/character/index.html | Woran gerade gearbeitet wird — Figur, Ort, Gilde, Begriff |

**In OBS einbinden:**
1. Quellen → + → Browser
2. URL: http://localhost:4000/overlay/<name>/index.html
3. Breite/Höhe anpassen
4. Fertig

**Custom Overlays:**
- Settings → Overlays → "Neues Overlay"
- Aus Template erstellen oder eigene HTML-Datei hochladen
- URL: http://localhost:4000/overlay/custom/<name>/index.html

**Eigene Overlays entwickeln:**
Das Template unter /overlay/_template/index.html enthält:
- Alle verfügbaren WebSocket-Events
- Alle Public API Endpoints
- Zwei Design-Vorlagen (Pixel Art + Modern)
- Helper-Funktionen (Auto-Reconnect, escapeHtml)`,
  },
  {
    title: 'Notion Integration',
    content: `Clips werden automatisch in eine Notion-Datenbank gesynct.

**Einrichtung:**
1. Gehe auf notion.so/my-integrations
2. Neue Integration erstellen
3. Token kopieren → im Toolkit unter Settings eintragen
4. Notion-Datenbank erstellen mit diesen Properties:
   - Clip (Title)
   - Tag (Select)
   - Session (Date)
   - Zeitstempel (Rich Text)
   - Notiz (Rich Text)
   - Synced (Checkbox)
5. Datenbank mit der Integration teilen (Share → Invite)
6. Datenbank-ID im Toolkit eintragen (URL oder ID)

**Sync:**
- Clips Panel → "Sync to Notion" Button
- Synct alle Clips der aktuellen Session`,
  },
  {
    title: 'Stream Deck',
    content: `Das "NST Deck" Stream Deck Plugin bietet 10 Buttons mit Live-Status.

**Installation:**
- Im Toolkit: Settings → Stream Deck → "Plugin jetzt installieren"
- Oder: .streamDeckPlugin Datei manuell öffnen

**Einrichtung:**
1. Beliebigen "NST" Button aufs Deck ziehen
2. Button anklicken → Property Inspector unten
3. API Token eintragen (einmalig, gilt für alle Buttons)
4. Button-spezifische Settings konfigurieren

**Verfügbare Buttons:**
| Button | Aktion | Live-Anzeige |
|--------|--------|-------------|
| Scene Switch | OBS-Szene wechseln | Aktuelle Szene |
| Clip Marker | Clip markieren | Session Clip-Anzahl |
| Neuer Eintrag | Eintrag erstellen | Offene Einträge |
| Challenge | Start/Stop/Done/Fail | Status + Titel |
| Todo Check | Nächstes Todo abhaken | Offene Todos |
| Hype Moment | Hype Moment auslösen | Flash-Animation |
| Glücksrad | Roulette drehen | Spin-Animation |
| Milestone | Milestone abschließen | Pending-Anzahl |
| Figur wechseln | Nächste Figur ins Overlay (pinnt fest) | Name der Figur |
| Karte festpinnen | Festpinnen oder wieder dem Worldbuilder folgen | Folgt / Festgepinnt / Folgen aus |

**API Token:**
- Findest du unter Settings → Stream Deck API Token
- Bleibt gleich nach Neustart der App`,
  },
  {
    title: 'Dashboard Panels',
    content: `**Stream Tab:**
- **Challenge** — Starte Challenges mit Timer und Status-Tracking
- **Glücksrad** — Sammle Themen, drehe das Rad — der Chat entscheidet
- **Clip Moments** — Markiere besondere Momente mit Tags
- **Chat Voting** — Sammle Vorschläge und lass den Chat abstimmen
- **Now Playing** — Aktuellen Song setzen und im Overlay anzeigen

**Projekt Tab:**
- **Progress Tracker** — Verfolge den Fortschritt deines Projekts
- **Welt** — Einträge aus der Welt als Karte ins Overlay bringen, Spoiler-Felder ausblenden
- **Erklär-Commands** — Chat-Befehle mit selbst geschriebenem Text, z. B. !story
- **Milestones** — Achievement-System (Minor, Major, Epic)
- **Todos** — Aufgabenliste für den Stream

**Stats Tab:**
- **Statistiken** — Überblick über alle Daten (Clips, Todos, Milestones etc.)

**Settings Tab:**
- **Settings** — Twitch, OBS, Notion, Stream Deck, Backup
- **Overlays** — Overlay-URLs und Custom Overlays verwalten

**Hilfe Tab:**
- **Hilfe & Dokumentation** — Diese Dokumentation`,
  },
  {
    title: 'API Referenz',
    content: `Alle API-Endpoints sind unter http://localhost:4000/api/ erreichbar.
Auth-Header: Authorization: Bearer <token>

**Public Endpoints (ohne Auth):**
- GET /public/stream-state
- GET /public/issues
- GET /public/todos
- GET /public/progress
- GET /public/entry — die Eintragskarte, ohne ausgeblendete Felder
- GET /public/character — dieselbe Karte im alten Figuren-Format

**Stream State:**
- GET /api/stream-state
- PATCH /api/stream-state

**Welt:**
- GET /api/entries/arten — die Arten der Quelle, mit Farbe
- GET /api/entries?art=Figur — alle Einträge einer Art, mit ihren ausgeblendeten Feldern
- GET /api/entries/active — POST /api/entries/active — DELETE /api/entries/active
- POST /api/entries/:id/hidden — { fields: ["Kurzbeschreibung", "@text", "@aliases", "@image"] }
- GET /api/entries/follow — POST /api/entries/follow — { enabled?, held?, settleSeconds? }
- POST /api/entries/follow/toggle-hold — festpinnen oder wieder folgen (Stream Deck)
- POST /api/entries/follow/check — einmal in den Worldbuilder schauen und die Karte wechseln, wenn es passt
- GET /api/characters/source — POST /api/characters/source — { source: "worldbuilder" | "notion" }
- POST /api/characters/cycle — nächste Figur ins Overlay (Stream Deck)

**Erklär-Commands:**
- GET /api/text-commands — POST /api/text-commands — PATCH /api/text-commands/:id — DELETE /api/text-commands/:id
- POST /api/text-commands/preview — { response } → wie der Text im Chat ankommt
- GET /api/lookup-commands — POST /api/lookup-commands — PATCH /api/lookup-commands/:id — DELETE /api/lookup-commands/:id
- GET /api/lookup-commands/arten — die Arten der offenen Worldbuilder-Welt
- POST /api/chat/try — { message, as?: "viewer" } → was der Chat antworten würde (!befehle, eigene Texte, Nachschlagen)

**Issues:**
- GET /api/issues — POST /api/issues — PATCH /api/issues/:id — DELETE /api/issues/:id

**Todos:**
- GET /api/todos — POST /api/todos — PATCH /api/todos/:id — DELETE /api/todos/:id

**Clips:**
- GET /api/clips — POST /api/clips — PATCH /api/clips/:id — DELETE /api/clips/:id
- GET /api/clips/sessions — POST /api/clips/sync

**Milestones:**
- GET /api/milestones — POST /api/milestones — PATCH /api/milestones/:id — DELETE /api/milestones/:id

**OBS:**
- GET /api/obs/config — POST /api/obs/config
- GET /api/obs/status — POST /api/obs/connect — POST /api/obs/disconnect
- GET /api/obs/scenes — POST /api/obs/scene
- GET /api/obs/mappings — POST /api/obs/mappings

**Rewards:**
- GET /api/rewards — POST /api/rewards — PATCH /api/rewards/:id

**Voting:**
- GET /api/voting — POST /api/voting/start — POST /api/voting/end — POST /api/voting/cancel

**Actions:**
- POST /api/actions/compile-pray
- POST /api/actions/roulette — GET /api/actions/roulette/status
- GET /api/actions/song — POST /api/actions/song

**Stats:**
- GET /api/stats

**Backup:**
- GET /api/backup/export — POST /api/backup/import

**Overlays:**
- GET /api/overlays/builtin — GET /api/overlays
- POST /api/overlays — PUT /api/overlays/:name — DELETE /api/overlays/:name
- GET /api/overlays/template`,
  },
  {
    title: 'WebSocket Events',
    content: `WebSocket-Verbindung: ws://localhost:4000?overlay=1

Alle Events werden als JSON gesendet: { "event": "name", "data": { ... } }

**Stream:**
- stream-state — Stream-Status geändert

**Einträge:**
- issue-created / issue-updated / issue-deleted

**Welt:**
- entry-changed — neue Eintragskarte (oder null), ausgeblendete Felder schon entfernt
- character-changed — dieselbe Karte im alten Figuren-Format (Stream Deck)
- follow-changed — Worldbuilder folgen an/aus, festgepinnt oder nicht, Wartezeit

**Todos:**
- todo-created / todo-updated / todo-deleted / todos-cleared

**Progress:**
- progress-updated / progress-item-created / progress-item-updated / progress-item-deleted

**Milestones:**
- milestone-trigger / milestone-created / milestone-updated / milestone-deleted

**Clips:**
- clip-created

**Rewards:**
- reward-redeemed

**Voting:**
- design-vote-started / design-vote-ended

**OBS:**
- obs-status — Verbindungsstatus geändert
- obs-scene-changed — Szene gewechselt

**Bot:**
- bot-status — Bot verbunden/getrennt

**Actions:**
- compile-pray — Hype Moment ausgelöst
- roulette-spin / roulette-result — Roulette Events
- song-update / song-clear — Song Events`,
  },
  {
    title: 'Tastenkürzel',
    content: `Die App hat globale Hotkeys die auch funktionieren wenn die App im Hintergrund ist.

Hotkeys werden über die Hotkey-Konfiguration in der App verwaltet. Die Hotkeys lösen die gleichen API-Calls aus wie die Stream Deck Buttons.`,
  },
  {
    title: 'Troubleshooting',
    content: `**"Port 4000 already in use":**
Eine alte Instanz der App läuft noch. Beende sie im Task Manager oder starte den Computer neu.

**OBS verbindet nicht:**
- Ist der WebSocket Server in OBS aktiviert? (Tools → WebSocket Server Settings)
- Stimmt das Passwort?
- Ist der Port korrekt (Standard: 4455)?
- Läuft OBS?

**Bot verbindet nicht:**
- Client-ID korrekt eingetragen?
- OAuth-Token abgelaufen? Neu verbinden über Settings

**Overlays zeigen nichts:**
- Läuft die App? (http://localhost:4000/api/health testen)
- Browser Source URL korrekt? Muss mit http://localhost:4000/overlay/ anfangen
- Browser Source in OBS refreshen (Rechtsklick → Refresh)

**Stream Deck Buttons zeigen "OFFLINE":**
- Läuft die App?
- API Token im Plugin eingetragen?
- Host/Port korrekt? (Standard: localhost:4000)`,
  },
];

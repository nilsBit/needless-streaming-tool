// Documentation content (German)

export const HELP_SECTIONS_DE = [
  {
    title: 'Erste Schritte',
    content: `Das Stream Toolkit ist deine Zentrale für Streaming. Hier steuerst du alles — Overlays, Challenges, Issues, Clips, Todos, Milestones und mehr.

Beim ersten Start führt dich der **Setup-Wizard** durch die Einrichtung. Du kannst ihn jederzeit unter **Settings → Setup-Wizard erneut starten** wiederholen.

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
| !challenge | Zeigt aktuelle Challenge |
| !song | Zeigt aktuellen Song |
| !hype | Löst einen Hype Moment aus |
| !issues | Listet offene Issues |
| !todo | Zeigt offene Todos |
| !progress | Zeigt Projekt-Fortschritt |
| !vote <option> | Stimme bei Abstimmung ab |
| !design start/end/status | Design-Abstimmung |
| !scene | Listet OBS-Szenen (nur Mods) |
| !scene <name> | Wechselt OBS-Szene (nur Mods) |
| !uptime | Zeigt Stream-Laufzeit |`,
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
| "spawn" | Spawn Enemies Event |
| "roulette" | Glücksrad drehen |
| "feature" | Feature Request |
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
| Challenge | /overlay/experiment/index.html | Challenge-Status |

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
    content: `Das "The Lab Toolkit" Stream Deck Plugin bietet 8 Buttons mit Live-Status.

**Installation:**
- Im Toolkit: Onboarding → Stream Deck → "Plugin jetzt installieren"
- Oder: .streamDeckPlugin Datei manuell öffnen

**Einrichtung:**
1. Beliebigen "The Lab" Button aufs Deck ziehen
2. Button anklicken → Property Inspector unten
3. API Token eintragen (einmalig, gilt für alle Buttons)
4. Button-spezifische Settings konfigurieren

**Verfügbare Buttons:**
| Button | Aktion | Live-Anzeige |
|--------|--------|-------------|
| Scene Switch | OBS-Szene wechseln | Aktuelle Szene |
| Clip Marker | Clip markieren | Session Clip-Anzahl |
| Issue Report | Issue erstellen | Offene Issue-Anzahl |
| Challenge | Start/Stop/Done/Fail | Status + Titel |
| Todo Check | Nächstes Todo abhaken | Offene Todos |
| Hype Moment | Hype Moment auslösen | Flash-Animation |
| Glücksrad | Roulette drehen | Spin-Animation |
| Milestone | Milestone abschließen | Pending-Anzahl |

**API Token:**
- Findest du unter Settings → Stream Deck API Token
- Bleibt gleich nach Neustart der App`,
  },
  {
    title: 'Dashboard Panels',
    content: `**Stream Tab:**
- **Challenge** — Starte Challenges mit Timer und Status-Tracking
- **Glücksrad** — Tracke Items, drehe das Roulette-Rad
- **Clip Moments** — Markiere Clip-würdige Momente mit Tags
- **Chat Designs** — Starte Design-Abstimmungen im Chat
- **Now Playing** — Aktuellen Song setzen und im Overlay anzeigen
- **Raids** — Raid-Verlauf anzeigen

**Projekt Tab:**
- **Progress Tracker** — Tracke Features deines Projekts
- **Milestones** — Achievement-System (Minor, Major, Epic)
- **Todos** — Aufgabenliste für den Stream

**Stats Tab:**
- **Statistiken** — Überblick über alle Daten (Clips, Todos, Milestones, Raids etc.)

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

**Stream State:**
- GET /api/stream-state
- PATCH /api/stream-state

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

**Raids:**
- GET /api/raids — POST /api/raids — DELETE /api/raids/:id

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

**Issues:**
- issue-created / issue-updated / issue-deleted

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
- raid-incoming — Raid empfangen
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

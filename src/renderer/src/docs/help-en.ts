// Documentation content (English)

export const HELP_SECTIONS_EN = [
  {
    title: 'Getting Started',
    content: `Stream Toolkit is your control center for streaming. Manage everything here — overlays, challenges, clips, tasks, milestones and more.

On first launch, the **Setup Wizard** will guide you through the setup. You can rerun it at any time via **Settings → Restart Setup Wizard**.

**Requirements:**
- OBS Studio (version 28+) with WebSocket Server enabled
- Twitch account with an app on dev.twitch.tv
- Optional: Notion account for clip sync
- Optional: Elgato Stream Deck`,
  },
  {
    title: 'Connect Twitch',
    content: `**1. Create a Twitch App:**
- Go to dev.twitch.tv → Applications → Register Your Application
- Name: anything (e.g. "Stream Toolkit")
- OAuth Redirect URL: http://localhost:4000/auth/twitch/callback
- Category: Chat Bot
- Copy the Client ID

**2. Connect in the Toolkit:**
- Settings → Twitch Connection → enter your Client ID
- Click "Connect to Twitch" → Twitch login opens in browser
- After login, the bot connects automatically

**Chat Commands:**
| Command | Description |
|---------|-------------|
| !challenge | Shows current challenge |
| !song | Shows current song |
| !hype | Triggers a hype moment |
| !issues | Shows open entries |
| !todo | Shows open tasks |
| !progress | Shows project progress |
| !vote <option> | Vote in a poll |
| !design start/end/status | Chat voting |
| !scene | Lists OBS scenes (mods only) |
| !scene <name> | Switches OBS scene (mods only) |
| !uptime | Shows stream uptime |`,
  },
  {
    title: 'Connect OBS',
    content: `**In OBS:**
- Tools → WebSocket Server Settings
- Enable "Enable WebSocket Server"
- Port: 4455 (default)
- Set a password or disable authentication

**In the Toolkit:**
- Settings → OBS Connection → enter host, port, password
- Click "Connect to OBS"

**Scene Switching via Chat:**
- Mods/Broadcaster: !scene <scene name> in chat
- Viewers: via Channel Point Rewards (see "Channel Points")

**Scene Switching via API:**
- POST /api/obs/scene with { "scene": "scene name" }
- GET /api/obs/scenes lists all scenes`,
  },
  {
    title: 'Channel Points & Rewards',
    content: `The Toolkit automatically detects Channel Point Rewards via Twitch EventSub.

**Built-in Reward Types:**
| Reward name contains | Action |
|---------------------|--------|
| "roulette" | Spin the lucky wheel |
| "feature" | Submit a suggestion |
| "musik" or "song" | Change music |
| "scene" or "szene" | Switch scene (with user input) |

**Fixed Scene Rewards (no user input):**
Configure mappings via the API:
- POST /api/obs/mappings with reward title → scene name
- Example: Reward "Gameplay" → automatically switches to scene "Gameplay"
- Viewer just redeems the reward, no input needed`,
  },
  {
    title: 'Overlays',
    content: `Overlays are added to OBS as a **Browser Source**.

**Built-in Overlays:**
| Overlay | URL | Description |
|---------|-----|-------------|
| Progress | /overlay/progress/index.html | Project progress |
| Milestone | /overlay/milestone/index.html | Achievement notifications |
| Alerts | /overlay/alerts/index.html | Raids, rewards, events |
| Song | /overlay/song/index.html | Current song |
| Todos | /overlay/todos/index.html | Todo list |
| Poll | /overlay/poll/index.html | Polls |
| Roulette | /overlay/roulette/index.html | Lucky wheel |
| Challenge | /overlay/experiment/index.html | Challenge status |

**Adding to OBS:**
1. Sources → + → Browser
2. URL: http://localhost:4000/overlay/<name>/index.html
3. Adjust width/height
4. Done

**Custom Overlays:**
- Settings → Overlays → "New Overlay"
- Create from template or upload your own HTML file
- URL: http://localhost:4000/overlay/custom/<name>/index.html

**Developing Custom Overlays:**
The template at /overlay/_template/index.html includes:
- All available WebSocket events
- All public API endpoints
- Two design templates (Pixel Art + Modern)
- Helper functions (Auto-Reconnect, escapeHtml)`,
  },
  {
    title: 'Notion Integration',
    content: `Clips are automatically synced to a Notion database.

**Setup:**
1. Go to notion.so/my-integrations
2. Create a new integration
3. Copy the token → enter it in the Toolkit under Settings
4. Create a Notion database with these properties:
   - Clip (Title)
   - Tag (Select)
   - Session (Date)
   - Zeitstempel (Rich Text)
   - Notiz (Rich Text)
   - Synced (Checkbox)
5. Share the database with the integration (Share → Invite)
6. Enter the database ID in the Toolkit (URL or ID)

**Sync:**
- Clips Panel → "Sync to Notion" button
- Syncs all clips from the current session`,
  },
  {
    title: 'Stream Deck',
    content: `The "The Lab Toolkit" Stream Deck plugin offers 8 buttons with live status.

**Installation:**
- In the Toolkit: Onboarding → Stream Deck → "Install plugin now"
- Or: manually open the .streamDeckPlugin file

**Setup:**
1. Drag any "The Lab" button onto your deck
2. Click the button → Property Inspector at the bottom
3. Enter the API token (once, applies to all buttons)
4. Configure button-specific settings

**Available Buttons:**
| Button | Action | Live Display |
|--------|--------|-------------|
| Scene Switch | Switch OBS scene | Current scene |
| Clip Marker | Mark a clip | Session clip count |
| New Entry | Create an entry | Open entries |
| Challenge | Start/Stop/Done/Fail | Status + title |
| Todo Check | Check off next todo | Open todos |
| Hype Moment | Trigger hype moment | Flash animation |
| Lucky Wheel | Spin the roulette | Spin animation |
| Milestone | Complete a milestone | Pending count |

**API Token:**
- Found under Settings → Stream Deck API Token
- Stays the same after restarting the app`,
  },
  {
    title: 'Dashboard Panels',
    content: `**Stream Tab:**
- **Challenge** — Start challenges with timer and status tracking
- **Lucky Wheel** — Collect topics, spin the wheel — chat decides
- **Clip Moments** — Mark special moments with tags
- **Chat Voting** — Collect suggestions and let the chat vote
- **Now Playing** — Set the current song and display it in overlay
- **Raids** — View raid history

**Project Tab:**
- **Progress Tracker** — Track your project's progress
- **Milestones** — Achievement system (Minor, Major, Epic)
- **Todos** — Your task list for the stream

**Stats Tab:**
- **Statistics** — Overview of all data (clips, todos, milestones, raids etc.)

**Settings Tab:**
- **Settings** — Twitch, OBS, Notion, Stream Deck, Backup
- **Overlays** — Manage overlay URLs and custom overlays

**Help Tab:**
- **Help & Documentation** — This documentation`,
  },
  {
    title: 'API Reference',
    content: `All API endpoints are available at http://localhost:4000/api/.
Auth header: Authorization: Bearer <token>

**Public Endpoints (no auth required):**
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
    content: `WebSocket connection: ws://localhost:4000?overlay=1

All events are sent as JSON: { "event": "name", "data": { ... } }

**Stream:**
- stream-state — Stream status changed

**Entries:**
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
- obs-status — Connection status changed
- obs-scene-changed — Scene switched

**Bot:**
- bot-status — Bot connected/disconnected

**Actions:**
- compile-pray — Hype moment triggered
- roulette-spin / roulette-result — Roulette events
- raid-incoming — Raid received
- song-update / song-clear — Song events`,
  },
  {
    title: 'Keyboard Shortcuts',
    content: `The app has global hotkeys that work even when the app is in the background.

Hotkeys are managed via the hotkey configuration in the app. They trigger the same API calls as the Stream Deck buttons.`,
  },
  {
    title: 'Troubleshooting',
    content: `**"Port 4000 already in use":**
An old instance of the app is still running. Kill it in Task Manager or restart your computer.

**OBS won't connect:**
- Is the WebSocket Server enabled in OBS? (Tools → WebSocket Server Settings)
- Is the password correct?
- Is the port correct (default: 4455)?
- Is OBS running?

**Bot won't connect:**
- Is the Client ID entered correctly?
- Has the OAuth token expired? Reconnect via Settings

**Overlays show nothing:**
- Is the app running? (test http://localhost:4000/api/health)
- Is the Browser Source URL correct? Must start with http://localhost:4000/overlay/
- Refresh the Browser Source in OBS (right-click → Refresh)

**Stream Deck buttons show "OFFLINE":**
- Is the app running?
- Is the API token entered in the plugin?
- Is the host/port correct? (default: localhost:4000)`,
  },
];

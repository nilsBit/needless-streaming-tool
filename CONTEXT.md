# Needless Streaming Tool

A desktop control room for live world-building streams on Twitch — writing a story on air, building its characters, places and lore. It holds the state of a stream session, lets viewers interact with it, and pushes the result to OBS browser sources and a Stream Deck.

Storage names and UI names have drifted apart in places — the glossary below names the concept, and calls out where the database or the Stream Deck plugin says something else.

## Language

### Stream session

**Challenge**:
A time-boxed goal the streamer commits to on air, with a live status of `idle`, `in_progress`, `done`, or `failed`. Stored on `stream_state` as `challenge_title` / `challenge_status`.
_Avoid_: Experiment, task, goal. The Stream Deck action is still named `experiment` — that identifier is frozen for parity with the shipped plugin and must not be renamed, but prose and new code say Challenge.

**Clip Moment**:
A marked point in the session worth clipping later, carrying two timecodes and an optional tag. Created by hand or detected automatically.
_Avoid_: Highlight, clip marker. "Clip" alone is fine when the context is unambiguous.

**Stream Timecode**:
Time elapsed since the Twitch stream went live. Distinct from Recording Timecode — a Clip Moment carries both, because the OBS recording and the Twitch broadcast rarely start at the same instant.

**Recording Timecode**:
Time elapsed inside the current OBS recording. Used to find the moment in the local video file.

**Confidence**:
How sure the automatic detection is that a Clip Moment is worth keeping — `high` or `medium`. Absent on manually created Clip Moments.

### Loose ends

**Issue**:
An open question in the story collected during the stream — a plot hole, a contradiction, a character who needs work — with a status of `open`, `fixed`, or `wontfix`. Issues are the pool the Lucky Wheel draws from.
_Avoid_: Bug, ticket, todo. The Stream Deck action is named `bug` and the `IssuesPanel` has a local `bugs` variable — both are legacy from the GameDev era, and neither should spread.

**Lucky Wheel**:
The on-stream ritual of spinning for a random open Issue and working on whatever comes up. Lives in `IssuesPanel`, shown to viewers as "Glücksrad", and rate-limited by a server-side cooldown.
_Avoid_: Roulette. The `roulette` identifier is frozen in the API route, the WebSocket events, and the Stream Deck action, but prose says Lucky Wheel.

### Project tracking

**Project Item**:
A unit of work on the story being built on stream — a chapter, a character to flesh out, a region to map — with a status of `pending`, `in_progress`, or `done` and an accumulated `time_spent`. Shown to viewers as the Progress Tracker.
_Avoid_: Task, feature. "Story" is ambiguous here and means the narrative, never a unit of work.

**Todo**:
A subtask belonging to exactly one Project Item via `parent_id`, optionally linked to a Milestone. A Todo never stands alone — orphans are deleted.

**Milestone**:
A celebrated achievement on the story — a finished chapter, a closed arc — graded `minor`, `major`, or `epic`. Completing one triggers an overlay celebration sized to its grade.

### Viewer interaction

**Reward**:
A Twitch channel-point redemption a viewer has spent points on. `rewards` holds the pending queue, `reward_log` the full history, and `reward_stats` the per-viewer running totals that feed the leaderboard.

**Song Request**:
A track a viewer asked for by URL, moving through `pending` → `playing` → `done` (or `skipped`). Separate from the Now Playing panel, which reads what the machine is actually playing via SMTC.

**Poll**:
A viewer vote on a decision in the story — which way a character turns, what a place is called. Stored in `designs`, shown as "Abstimmungen".
_Avoid_: Design, vote, survey. The `designs` table name is legacy.

### Output surfaces

**Overlay**:
An HTML page served from `/overlay/*` and added to OBS as a browser source. Overlays read only from `/public/*` endpoints and need no API token.

**Overlay Override**:
A user-edited copy of a built-in Overlay, stored in user data and served ahead of the shipped version. Lets the streamer restyle an Overlay without touching the repo.

**Custom Overlay**:
An Overlay the streamer authored from scratch, served under `/overlay/custom`. Distinct from an Overlay Override, which starts as a copy of something shipped.

**Stream Deck Action**:
One button type in the companion Stream Deck plugin. Actions reach the app over HTTP and receive live updates over WebSocket, discovering the port and token through the connection file.

### Access

**Session Token**:
An API token regenerated on every app start, used by the Electron renderer. Not persisted.

**Fixed Token**:
An API token persisted in `settings`, used by the Stream Deck plugin and other external tools so they survive restarts without reconfiguration.

**Connection File**:
A file written to the user's home directory on server start and deleted on shutdown, carrying port, Fixed Token, and PID. How the Stream Deck plugin finds a running app without manual setup.

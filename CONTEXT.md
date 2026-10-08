# Needless Streaming Tool

A desktop control room for live world-building streams on Twitch — writing a story on air, building its characters, places and lore. It holds the state of a stream session, lets viewers interact with it, and pushes the result to OBS browser sources and a Stream Deck.

Storage names and UI names have drifted apart in places — the glossary below names the concept, and calls out where the database or the Stream Deck plugin says something else.

## Language

### Navigation

**Area**:
One of the seven entries in the sidebar, chosen by situation — Start, Im Stream, Chat & Bot, Overlays & Alerts, Nach dem Stream, Einstellungen, Hilfe. Defined once in `src/renderer/src/navigation.ts`; the sidebar, the page headers and the start cards all read from there. In the UI: „Bereich“.
_Avoid_: Tab, section. The old "Live / Produktion" switch and its tab row are gone.

**Sub tab**:
A topic inside an Area, shown as a row under the page header when the Area has more than one (Chat & Bot → Befehle · Von selbst). In the UI: „Unterreiter“.

**Page**:
What one Area shows: a header with the Area's name and one sentence, the Sub tabs if any, then its Panels one below the other. Every Panel has exactly one Page (tested in `navigation.test.ts`). The dashboard board — pinning, hiding, collapsing, dragging — no longer exists. In the UI: „Seite“.

### Stream session

**Challenge**:
A time-boxed goal the streamer commits to on air, with a live status of `idle`, `in_progress`, `done`, or `failed`. Stored on `stream_state` as `challenge_title` / `challenge_status`.
_Avoid_: Experiment, task, goal. The Stream Deck action is still named `experiment` — that identifier is frozen for parity with the shipped plugin and must not be renamed, but prose and new code say Challenge.

**Feature** (UI: „Funktion“, „Was dein Stream kann“):
One thing a stream can do, as the setup on first start asks it (2026-10-06): the eighteen entries of `src/shared/features.ts`, each naming what it needs connected and which overlays, built-in commands, panels, hotkeys and readiness checks are its own. A feature that is off hides its things; nothing is deleted. The two **personal** features (entry card, screens) exist only where the Worldbuilder is set up.
_Avoid_: module, plugin, toggle. In the UI a feature is „an“ or „aus“, never „aktiviert“.

**Setup** (UI: „Einrichtung“):
The four steps on first start — Können · Verbinden · In OBS einrichten · Fertig — and the same page opened again from Einstellungen → Programm. `setup_done` records that it was walked through or skipped.
_Avoid_: onboarding, wizard, assistant.

**Bestenliste** (UI: „Bestenliste“, plural „Bestenlisten“):
A ranking of one Twitch reward's redemptions (2026-10-06, evening). A list has a key (from its title, never changes), a title, and the reward's Twitch id (`leaderboards`); each redemption of that reward adds one to `reward_stats` under the key. Overlays take the key as `?type=`. No unlock step, no `!flex` — that flow lived for one day. A reward without a list counts nowhere.
_Avoid_: flex, point, score.

**Clip Moment**:
A marked point in the session worth clipping later, carrying two timecodes and an optional tag. Created by hand or detected automatically. Since 2026-10-06 also the unit of content planning: each Clip Moment stands in one **Step** of the board (`status`: new · planned · cut · published, in the UI „Neu · Geplant · Geschnitten · Veröffentlicht“) and carries `platforms`, `planned_for`, `hook` and, once published for 30 days, `archived_at`. An **Idea** is a Clip Moment created without a stream (`idea: true`, tag `idee`, no timecodes).
_Avoid_: Highlight, clip marker. "Clip" alone is fine when the context is unambiguous. In the UI the whole thing is „Content planen“, a card is „Moment“.

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

### The world

**Entry**:
Anything in the world being written on stream — a character, a place, a guild, a concept — as this app reads it: a title, an Art, a Reifegrad, aliases, text, named fields and a portrait. Entries are never authored here; this app reads them and puts one on screen.
_Avoid_: Item, record, page.

**Character**:
An Entry of the Art set as characters (`settings.worldbuilder_art`, "Figur" by default). The Stream Deck, `!figur` and Notion still speak in Characters.

**Character Source**:
Where Characters are read from — `notion` or `worldbuilder`, held in `settings.character_source`. Notion is the default and the original. Worldbuilder is the desktop world-building tool on the same machine, read over a loopback HTTP window it calls its "Schaufenster"; it needs no account and is where the world is actually written.
_Avoid_: Backend, provider, integration.

**Active Entry**:
The one Entry currently on the Overlay, stored as a whole snapshot (`settings.active_entry`) rather than an id, so the Overlay keeps rendering when the source is slow or gone. It replaced the Active Character; a character pinned before that still shows. Carries the clock that banks time back, to Notion only, because Worldbuilder takes nothing in.
_Avoid_: Active Character, except in the older routes and the `character-changed` event that the Stream Deck plugin still reads.

**Entry Card**:
What the Overlay shows of the Active Entry, in the "Lexikon" style: title, alias and role, a short description, a few facts, the world's name and the Reifegrad. Built on the server and sent as `entry-changed`, so a Hidden Field never reaches a browser source.

**Hidden Field**:
A part of one Entry the streamer switched off for stream, typically a spoiler. Stored per Entry and field name in `hidden_entry_fields`; `@text`, `@aliases`, `@image` and `@rel:<label>` stand for the parts that are not fields. Honoured by the Entry Card and by Lookup Commands alike.
_Avoid_: Private field, secret.

**Follow Mode**:
The Entry Card switching to whatever entry is open in Worldbuilder (its "Fokus"), once that entry has stayed open for the settle time (`follow_settle_seconds`, 3 by default). The server looks at the Schaufenster once a second; it only runs with Worldbuilder as the Character Source.
_Avoid_: Auto mode, sync.

**Held Card**:
A card picked or cleared by hand, which Follow Mode leaves alone until it is released — in the Welt panel or with the Stream Deck's "Karte festpinnen". Stored as `follow_held`. The app shows it as "festgepinnt"; in code, "pin" already means putting an Entry on the Overlay.
_Avoid_: Locked, frozen.

### Viewer interaction

**Text Command**:
A chat command whose reply the streamer wrote in the app — `!story`, `!welt` — stored in `text_commands`, with its own cooldown. Built-in commands compute their reply; a Text Command only ever says what was written. Shown in the app as "Erklär-Commands".
_Avoid_: Custom command — `custom_commands` already names the streamer's renames of built-in triggers. Also macro, snippet.

**Lookup Command**:
A chat command that finds an entry of one Worldbuilder Art by name — `!figur Mila`, `!ort Saldor` — and answers in one message. Stored in `lookup_commands`; each points at an Art by its name, because Arten differ per world. Never answers with discarded (`Verworfen`) entries, and never repeats what the viewer typed. Shown in the app as "Nachschlage-Commands", in the same panel as Text Commands.
_Avoid_: Search, query command.

**Reward**:
A Twitch channel-point redemption a viewer has spent points on. `rewards` holds the pending queue and `reward_stats` the per-viewer running totals that feed the Bestenlisten. A reward made in the app (Chat & Bot → Kanalpunkte, #24) carries an action by its Twitch id in `twitch_reward_actions`; one made in the Creator Dashboard is read-only in the app and is told apart by its title (`actionFromTitle` in `reward-actions.ts`). A failed action of an app-made reward cancels the redemption, which gives the points back.
_Avoid_: confusing it with a Punkte-Belohnung, which is bought with the tool's own points.

**Punkte** (UI: der Name der Währung, Standard „Punkte“):
The tool's own currency (2026-10-08), next to Twitch channel points and unrelated to them — no exchange. Earned only while the stream is live: per watch tick for everyone in chat, per chat message (once a minute), for follow, sub, gifted subs, raid and bits; given and taken by mods. One row per viewer in `viewer_points`, totals only, no log.
_Avoid_: coins, credits, channel points (that is Twitch's), score.

**Beitrag**:
Everything a viewer ever earned in Punkte (`viewer_points.total`). Spending never lowers it; a mod's take does, as a correction. The Beitrag lists rank by it — `beitrag` of all time and `beitrag-stream` (UI „Beitrag heute“), which starts at zero with each new stream. Both keys are reserved for these lists.

**Guthaben**:
The Punkte a viewer can spend now (`viewer_points.balance`).
_Avoid_: balance in German UI text, Kontostand.

**Punkte-Belohnung** (UI: „Belohnung“ under Chat & Bot → Punkte):
What viewers buy with Punkte via `!einlösen <Name>` — made in the app, not in Twitch (`point_rewards`). Carries a cost and an action from `reward-actions.ts` (wheel, suggestion, music, a mapped scene, alert only); a failed action refunds. A redemption leaves a Reward row and a `reward-redeemed` event with `source: 'points'`.
_Avoid_: shop item, Twitch reward.

**Quest** (UI: „Quest“, the area „Quests“):
A step the streamer takes through the tool — „Erste Belohnung anlegen“, „OBS verbinden“ (spec 2026-10-08-quests-design). Done when the state shows it, or by a flag for what happens once (`quest_flag_*` in `settings`); done stays done (`quest_progress`). Only quests of features that are on show and count; the first is always choosing what the stream can do. Streamer-only.
_Avoid_: task, achievement (an Abzeichen is the reward of a group of quests), mission.

**EP / Stufe**:
Erfahrungspunkte from done quests, and the stage they reach: Funke · Lagerfeuer · Leuchtfeuer · Leuchtturm · Sternbild. Stage names are things, never people.

**Quest-Pfad**:
A guided flow that creates something, step by step with stages on a path, a preview and a celebrated end (`QuestPath`). Replaces creating through a form; the forms stay for editing.

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

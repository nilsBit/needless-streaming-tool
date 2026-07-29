# Terminology Rename: Generic Naming for Broader Audience

**Date:** 2026-04-16
**Status:** Approved

## Goal

Rename dev-specific terminology so stream-toolkit appeals equally to coding, art, coworking, and game dev streamers.

## Rename Map

| Old Term | New Term | Scope |
|----------|----------|-------|
| `experiment` | `challenge` | DB fields, types, API, overlay, panel, hotkeys, bot command |
| `Bug` / `bugs` | `Issue` / `issues` | DB table, types, API router + routes, overlay, panel, bot command, stats |
| `bug_roulette` | `roulette` | Reward type, EventSub, overlays, UI labels |

## Detailed Changes

### 1. Database Schema (`src/server/db/schema.ts`)

- Rename table `bugs` → `issues`
- Rename field `stream_state.experiment_title` → `stream_state.challenge_title`
- Rename field `stream_state.experiment_status` → `stream_state.challenge_status`
- Update `SCHEMA` DDL to use new names for fresh installs
- Increment `SCHEMA_VERSION` (6 → 7)
- Add migration: `ALTER TABLE bugs RENAME TO issues`, `ALTER TABLE stream_state RENAME COLUMN experiment_title TO challenge_title`, `ALTER TABLE stream_state RENAME COLUMN experiment_status TO challenge_status`

### 2. Shared Types (`src/shared/types.ts`)

- Interface `Bug` → `Issue`
- `StreamState.experiment_title` → `StreamState.challenge_title`
- `StreamState.experiment_status` → `StreamState.challenge_status`
- `VALID_BUG_STATUS` → `VALID_ISSUE_STATUS`
- `VALID_EXPERIMENT_STATUS` → `VALID_CHALLENGE_STATUS`
- Stats: `total_bugs` → `total_issues`, `open_bugs` → `open_issues`

### 3. API Routes

- File `src/server/api/bugs.ts` → `src/server/api/issues.ts`
- Route `/api/bugs` → `/api/issues`
- Route `/public/bugs` → `/public/issues`
- Import in `src/server/index.ts`: `bugsRouter` → `issuesRouter`
- Public endpoint handler: variable `bugs` → `issues`, SQL query updated
- WebSocket events: `bug-created` → `issue-created`, `bug-updated` → `issue-updated`, `bug-deleted` → `issue-deleted`
- `actions.ts`: All variable names (`bugs`, `openBugs`), broadcast payload key `bugs` → `issues`, error messages (`'No open bugs'` → `'No open issues'`), comments updated
- Stats: query `bugs` → `issues`
- Backup: table list entry `bugs` → `issues`, add import shim for old backups (`if data['bugs'] && !data['issues']` → map old key)
- Stream-state API: `experiment_*` fields → `challenge_*` fields

### 4. Bot Commands (`src/server/bot/commands.ts`)

- `!bugs` → `!issues` (keep `!bugs` as alias)
- `!experiment` → `!challenge` (keep `!experiment` as alias)
- Query references updated accordingly

### 5. Bot EventSub (`src/server/bot/eventsub.ts`)

- Reward type `bug_roulette` → `roulette`

### 6. Hotkeys (`src/main/hotkeys.ts`)

- All `experiment_status` → `challenge_status`
- All `experiment_title` → `challenge_title`

### 7. Overlays

- `src/overlays/experiment/index.html`: `experiment_title` → `challenge_title`, `experiment_status` → `challenge_status`
- `src/overlays/roulette/index.html`:
  - API URL: `/public/bugs` → `/public/issues`
  - Function `loadBugs()` → `loadIssues()`
  - Variables: `bugs`, `openBugs` → `issues`, `openIssues`
  - Strings: `'KEINE BUGS'` → `'KEINE ISSUES'`, `'Keine offenen Bugs'` → `'Keine offenen Issues'`
  - Counter text: `N + ' BUGS'` → `N + ' ISSUES'`
  - Result text: `'MUSS GEFIXT WERDEN'` → `'ALS NÄCHSTES DRAN'` (generic, not dev-specific)
  - WebSocket events: `bug-created/updated/deleted` → `issue-created/updated/deleted`
  - Comments updated
- `src/overlays/alerts/index.html`: `bug_roulette` → `roulette`
- `src/overlays/_template/index.html`: Update documented events and endpoints

### 8. Renderer Components

- `BugsPanel.tsx` → `IssuesPanel.tsx`: Component name, API calls, WebSocket events, CSS classes
  - User-facing strings: `'Neuer Bug...'` → `'Neues Issue...'`, `'Offen'`/`'Gefixt'` stay (generic enough), panel description updated
  - Chat command display: `!bugs` → `!issues`
- `ExperimentPanel.tsx` → `ChallengePanel.tsx`: Component name, API calls, state fields, CSS classes
- `StatsPanel.tsx`: `total_bugs`/`open_bugs` → `total_issues`/`open_issues`
- `ClipsPanel.tsx`: Preset tag `bug` → `issue`, emoji `'🐛'` → `'⚠️'`
- `RewardsPanel.tsx`: `bug_roulette` → `roulette`
- `App.tsx`: Panel keys `'experiment'` → `'challenge'`, `'bugs'` → `'issues'`
- Onboarding components:
  - `WelcomeStep.tsx`: "Bugs" references → "Issues"
  - `StreamDeckStep.tsx`: "Bugs"/"Bug Report" references → "Issues"/"Issue Report"

### 9. CSS (`src/renderer/src/index.css`)

- `.experiment-*` classes → `.challenge-*`
- `.bug-*` / `.bugs-*` classes → `.issue-*` / `.issues-*`

### 10. Translations (`src/renderer/src/i18n/translations.ts`)

- `panel.bugs` → `panel.issues`
- `panel.experiment` → `panel.challenge`
- Onboarding welcome text: "Bugs" → "Issues"
- Stream Deck description: "Bugs" → "Issues"
- Update help text references

### 11. Help Documentation (`src/renderer/src/docs/help.ts`)

- All references to "Bugs", "!bugs", "Experiment" updated
- API endpoint docs: `/api/bugs` → `/api/issues`, `/public/bugs` → `/public/issues`
- WebSocket event docs: `bug-*` → `issue-*`
- Stream Deck button: "Bug Report" → "Issue Report"

### 12. Clip Tags (`src/server/api/clip-tags.ts`)

- Preset tag `bug` → `issue`, emoji `'🐛'` → `'⚠️'`

## What Does NOT Change

- User-facing labels "Glücksrad" and "Challenge" stay as-is (already correct)
- All functional logic remains identical
- No new features — pure rename
- Overlay visual design unchanged
- `HotkeyConfig` in types.ts already uses `challenge_*` naming — no change needed

## Database Migration Strategy

Run on server startup before other queries:
1. Check if `bugs` table exists → if yes, `ALTER TABLE bugs RENAME TO issues`
2. Check if `experiment_title` column exists in `stream_state` → if yes, rename both columns
3. Migrations are idempotent (check before alter)
4. Update `SCHEMA` DDL to use new names (fresh installs get correct schema)
5. Increment `SCHEMA_VERSION` to 7

## Backward Compatibility

- Keep `!bugs` and `!experiment` as bot command aliases
- Backup import: map old `bugs` key to `issues` for old export files
- No API route aliases needed (no external consumers beyond this app)

## Risk

- Low: purely mechanical rename, no logic changes
- DB migration is the only destructive step — handled with existence checks

# Time Tracking per Feature: Challenge-Timer linked to Project Items

**Date:** 2026-04-17
**Status:** Approved

## Goal

Link the existing challenge timer to individual project items. When an item is set to "in_progress", it becomes the active challenge with a running timer. Time spent is saved per item. Only one item can be active at a time — switching auto-pauses the previous one.

## Architecture

Reuses the existing challenge timer system (`stream_state.timer_seconds`, `timer_running`). Adds `time_spent` column to `project_items`. Status changes on project items trigger automatic challenge state updates. No new timer mechanism needed.

## DB Change

**Add column to `project_items`:**
```sql
ALTER TABLE project_items ADD COLUMN time_spent INTEGER DEFAULT 0;
```

`time_spent` stores cumulative seconds spent on the item. Incremented when the item is paused, completed, or switched away from.

**Migration v8** in `src/server/db/index.ts`.

**Update `SCHEMA` DDL** in `schema.ts` for fresh installs.

## Shared Types

**Update `ProjectItem` interface:**
```ts
export interface ProjectItem {
  id: number;
  title: string;
  status: 'pending' | 'in_progress' | 'done';
  sort_order: number;
  time_spent: number; // cumulative seconds
  created_at: string;
}
```

## Implementation Requirements

### Transaction Wrapping (Mandatory)
All status-change writes MUST be wrapped in `db.transaction(...)`. Each status change touches multiple rows across `project_items` and `stream_state`. Without a transaction, a crash between writes leaves inconsistent state (e.g., two items "in_progress", or timer pointing at nothing).

### Timer Flush Before Status Change (Mandatory)
The client-side timer ticks locally and only syncs to server every 10 seconds. To avoid losing up to 10s of tracked time on every status transition, the PATCH request MUST accept an optional `current_timer_seconds` field. If provided, the server uses this value instead of the potentially-stale `stream_state.timer_seconds`. The UI must send the current client-side timer value with every status-change request.

### Hotkey Integration (Mandatory)
Challenge hotkeys (`challenge_done`, `challenge_failed`) bypass the UI and call `/api/stream-state` directly. When a project item is the active challenge, these hotkeys would wipe `timer_seconds` to 0 without saving time to `time_spent`.

**Solution:** The `/api/stream-state` PATCH handler must detect when a project item is linked (i.e., `challenge_title` matches an active `project_items.title`). When it detects `challenge_status` changing to `'done'` or `'failed'`:
1. Find the active project item
2. Save `time_spent += timer_seconds`
3. Set item status to `'done'` (for both done and failed — project items have no "failed" state)
4. Then proceed with the normal stream_state update

This keeps hotkeys working correctly without routing through the progress API.

### "Failed" Status Mapping
Project items only have `pending | in_progress | done`. When the challenge is marked "failed" (via hotkey or ChallengePanel), the linked project item is set to `'done'` (time is still saved). The user can manually revert it to pending if needed.

## Status Change Logic (Server-Side)

All logic lives in `PATCH /api/progress/items/:id`. When `status` changes. All writes wrapped in `db.transaction()`:

### Item → in_progress
1. Query current `stream_state` for `timer_seconds` and `timer_running`
2. Find any other item with `status = 'in_progress'`
3. If found: save its accumulated time (`time_spent += timer_seconds`), set its status to `'pending'`
4. Set the new item to `status = 'in_progress'`
5. Update `stream_state`: `challenge_title = item.title`, `challenge_status = 'in_progress'`, `timer_seconds = item.time_spent` (resume from saved time), `timer_running = 1`
6. Broadcast `progress-item-updated` and `stream-state`

### Item → done
1. Save accumulated time: `time_spent += timer_seconds` from `stream_state`
2. Set item `status = 'done'`
3. Update `stream_state`: `challenge_status = 'done'`, `timer_running = 0`
4. Broadcast events

### Item → pending (revert)
1. If item was `in_progress`: save accumulated time (`time_spent += timer_seconds`), stop timer
2. Set item `status = 'pending'`
3. Update `stream_state`: `challenge_title = null`, `challenge_status = 'idle'`, `timer_seconds = 0`, `timer_running = 0`
4. Broadcast events

### Edge case: Item deleted while active
- DELETE handler must check if the deleted item is the active one
- If yes: save time, reset challenge state (same as → pending), then delete
- DELETE handler also wrapped in transaction

## API Changes

### PATCH `/api/progress/items/:id` — Enhanced
- When `status` field is present in body, trigger the status change logic above
- Accepts optional `current_timer_seconds` field — if provided, used instead of `stream_state.timer_seconds` for accurate time accumulation
- When only `title` or `sort_order` change, no timer logic needed
- If active item's title changes, also update `stream_state.challenge_title`

### PATCH `/api/stream-state` — Enhanced
- When `challenge_status` changes to `'done'` or `'failed'`: check if a project item is linked
- If linked: save `time_spent`, set item to `'done'`, wrapped in transaction
- This ensures hotkeys and ChallengePanel "Done"/"Failed" buttons work correctly with linked items

### DELETE `/api/progress/items/:id` — Enhanced
- Check if deleted item has `status = 'in_progress'`
- If yes: save time, reset stream_state, then delete

### GET `/api/progress` — No change needed
- Already returns all project_items — `time_spent` will be included automatically

### GET `/api/progress/export` — New endpoint
- Returns CSV with headers: `Title,Status,Time Spent (minutes),Created At`
- `time_spent` converted from seconds to minutes (rounded)
- For the currently active item: add current `timer_seconds` from `stream_state` to get accurate live total
- Content-Disposition: `attachment; filename=project-progress.csv`

## UI Changes

### ProgressPanel (`src/renderer/src/panels/ProgressPanel.tsx`)

- Show formatted `time_spent` next to each item (e.g., "1h 23m", "45m", "< 1m")
- For the active item: show live ticking timer (same pattern as ChallengePanel — client-side tick with periodic server sync)
- Add "Export CSV" button next to the project name
- Helper function:
```ts
function formatTime(seconds: number): string {
  if (seconds < 60) return '< 1m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
```

### ChallengePanel (`src/renderer/src/panels/ChallengePanel.tsx`)

- When a project item is active (challenge_title matches a project item), show it as read-only with a note: "Linked to Progress Tracker"
- The manual challenge input still works for ad-hoc challenges not linked to project items
- Timer display remains unchanged

### Progress Overlay (`src/overlays/progress/index.html`)

- Show `time_spent` next to each item in the item list
- Active item shows live timer (ticking via WebSocket stream-state updates)
- Format: same "1h 23m" / "45m" pattern

## Translation Keys (~10 new)

```
progress.time_spent — "Zeitaufwand" / "Time spent"
progress.export_csv — "📥 CSV Export" / "📥 CSV Export"
progress.linked_challenge — "Verknüpft mit Progress Tracker" / "Linked to Progress Tracker"
progress.less_than_minute — "< 1m" / "< 1m"
progress.active — "Aktiv" / "Active"
progress.total_time — "Gesamtzeit" / "Total time"
```

## Affected Files

| Category | Files |
|----------|-------|
| DB | `src/server/db/schema.ts` (DDL + version), `src/server/db/index.ts` (migration v8) |
| Types | `src/shared/types.ts` (time_spent on ProjectItem) |
| API | `src/server/api/progress.ts` (status logic + delete logic + export endpoint) |
| API | `src/server/api/stream-state.ts` (linked-item detection on done/failed) |
| UI | `src/renderer/src/panels/ProgressPanel.tsx` (time display + export + live timer) |
| UI | `src/renderer/src/panels/ChallengePanel.tsx` (linked item indicator) |
| Overlay | `src/overlays/progress/index.html` (time display) |
| i18n | `src/renderer/src/i18n/translations.ts` (~6 new keys) |

## What Does NOT Change

- Challenge timer mechanism (client-side tick, server sync every 10s)
- Challenge hotkeys (still work — they control the timer which is now linked to an item)
- Challenge overlay (experiment/index.html — still shows active challenge title + timer)
- stream_state table structure
- Other panels and overlays

## Risk

- Medium: status change logic on the server must be atomic — mandated via db.transaction()
- Low: DB migration is a simple column addition
- Key risk: race conditions if user rapidly switches items — mitigated by server-side transactions
- Timer staleness mitigated by client sending current_timer_seconds with status changes
- Hotkey data loss mitigated by stream-state PATCH detecting linked items

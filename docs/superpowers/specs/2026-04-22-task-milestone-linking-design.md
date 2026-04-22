# Task-Milestone Linking

Connect Progress Tracker todos to milestones so that completing all linked todos automatically triggers the milestone overlay and celebration.

## Approach

FK on todo level: `todos.milestone_id` references `milestones.id`. When a todo is toggled, the API checks if all todos sharing that `milestone_id` are done — if so, the milestone auto-completes and triggers the overlay. Milestones are scoped to a project via `milestones.project_id`.

## Prerequisites

**Enable SQLite foreign key enforcement.** The codebase currently does not enable FK enforcement (`PRAGMA foreign_keys` is off by default in SQLite). Add `db.pragma('foreign_keys = ON')` in `initDatabase()` (`src/server/db/index.ts`). Without this, `ON DELETE SET NULL` and `ON DELETE CASCADE` constraints will be silently ignored.

## Database Changes

**Schema version:** Bump from current version to next (add migration block in `runMigrations()` with two `ALTER TABLE` statements).

### `todos` table — new column

```sql
milestone_id INTEGER REFERENCES milestones(id) ON DELETE SET NULL
```

- Optional (`NULL` = no milestone linked)
- `ON DELETE SET NULL` — deleting a milestone removes the link but keeps the todo

### `milestones` table — new column

```sql
project_id INTEGER REFERENCES project_items(id) ON DELETE CASCADE
```

- Scopes milestone to a project (for UI filtering)
- `ON DELETE CASCADE` — deleting a project removes its milestones
- Existing milestones without a project remain as "free" milestones (`NULL`)

## API Logic

### Todo toggle (`PATCH /api/progress/todos/:id`) — extended

All milestone-check logic must run inside a transaction to prevent double-triggering from concurrent todo toggles.

**On `done = 1`:**

1. Set todo done (existing behavior)
2. If todo has `milestone_id` → query: are all todos with this `milestone_id` now `done = 1`?
3. If yes → set milestone `status = 'completed'`, `completed_at = NOW()`
4. `broadcast('milestone-trigger', milestone)` — overlay fires
5. `sayInChat()` for major/epic levels (existing behavior)
6. `broadcast('milestone-updated', milestone)` — UI refresh

**On `done = 0`:**

1. Set todo undone (existing behavior)
2. If todo has `milestone_id` and milestone `status = 'completed'` → set milestone back to `pending`, `completed_at = NULL`
3. `broadcast('milestone-updated', milestone)` — UI refresh (no overlay trigger on revert)

### Todo deletion (`DELETE /api/progress/todos/:id`) — extended

1. Before deleting, check if todo has `milestone_id`
2. Delete the todo (existing behavior)
3. If it had a `milestone_id` → query: are there remaining todos with this `milestone_id`?
4. If remaining todos exist AND all are `done = 1` → auto-trigger milestone (same logic as toggle)
5. If no remaining todos (milestone now has zero linked todos) → no auto-trigger

### Todo milestone assignment (`PATCH /api/progress/todos/:id`) — extended

Accept optional `milestone_id` field to link/unlink a todo from a milestone. **Server-side validation:** the milestone's `project_id` must match the todo's `parent_id` (project). Reject with 400 if mismatched.

### Milestone creation (`POST /api/milestones`) — extended

Accept optional `project_id` field to scope milestone to a project.

## UI Changes

### Progress Tracker (ProgressPanel.tsx)

- Each todo gets an inline milestone icon (trophy) to the right of the text
- **No milestone linked:** icon greyed out/transparent → click opens dropdown with pending milestones for that project
- **Milestone linked:** icon colored/visible with tooltip showing milestone name → click allows switching or unlinking
- Dropdown only shows milestones matching the todo's `project_id`
- Icon hidden if no milestones exist for the project

### Milestones Panel (MilestonesPanel.tsx)

- New optional "Project" dropdown when creating a milestone — lists existing `project_items`
- Linked milestones show a progress indicator (e.g. "3/5 Todos done") below the title
- Manual completion via button remains available regardless of todo state

### Overlay

No changes needed — existing milestone overlay already reacts to `milestone-trigger` WebSocket events.

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Milestone manually completed, not all todos done | Stays completed. Reverts to pending only if a linked todo is set to undone. This is intentional — manual completion does not "lock" the milestone; it is always governed by todo state. |
| Linked todo deleted | Link removed. Recheck remaining todos — if remaining todos exist and all are done, auto-trigger. If no linked todos remain (empty milestone), no auto-trigger. |
| Milestone with no linked todos | Behaves as before — manual trigger only. |
| Project deleted | CASCADE deletes milestones with that `project_id`. Todos lose `milestone_id` via `ON DELETE SET NULL`. |
| Milestone deleted | Todos keep their data, `milestone_id` set to `NULL`. |

## Type Changes (shared/types.ts)

- `Todo` type: add optional `milestone_id?: number`
- `Milestone` type: add optional `project_id?: number`
- `Milestone` type: add optional `linkedTodoCount?: number` and `linkedTodoDone?: number` (for progress display)

## Computed Fields

`linkedTodoCount` and `linkedTodoDone` are computed server-side via `GET /api/milestones` using a LEFT JOIN with COUNT/SUM aggregation on the `todos` table (filtered by `milestone_id`). Not stored in the database.

## Deletion Chain

When a project is deleted: `project_items` row deleted → CASCADE deletes milestones with that `project_id` → `ON DELETE SET NULL` clears `milestone_id` on linked todos. This chain requires FK enforcement to be enabled (see Prerequisites).

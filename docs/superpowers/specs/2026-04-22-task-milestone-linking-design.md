# Task-Milestone Linking

Connect Progress Tracker todos to milestones so that completing all linked todos automatically triggers the milestone overlay and celebration.

## Approach

FK on todo level: `todos.milestone_id` references `milestones.id`. When a todo is toggled, the API checks if all todos sharing that `milestone_id` are done — if so, the milestone auto-completes and triggers the overlay. Milestones are scoped to a project via `milestones.project_id`.

## Database Changes

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

### Todo milestone assignment (`PATCH /api/progress/todos/:id`) — extended

Accept optional `milestone_id` field to link/unlink a todo from a milestone.

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
| Milestone manually completed, not all todos done | Stays completed. Reverts to pending only if a linked todo is set to undone. |
| Linked todo deleted | Link removed. Recheck remaining todos — if all done (or none remain), no auto-trigger. Empty milestone does not auto-fire. |
| Milestone with no linked todos | Behaves as before — manual trigger only. |
| Project deleted | CASCADE deletes milestones with that `project_id`. Todos lose `milestone_id` via `ON DELETE SET NULL`. |
| Milestone deleted | Todos keep their data, `milestone_id` set to `NULL`. |

## Type Changes (shared/types.ts)

- `Todo` type: add optional `milestone_id?: number`
- `Milestone` type: add optional `project_id?: number`
- `Milestone` type: add optional `linkedTodoCount?: number` and `linkedTodoDone?: number` (for progress display)

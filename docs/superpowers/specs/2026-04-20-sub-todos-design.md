# Sub-Todos per Kanban Item

**Date:** 2026-04-20
**Status:** Approved

## Goal

Each Kanban item (project_item) can have child todos. TodosPanel is removed. Sub-todos are managed inline in the Kanban board. Todos overlay shows sub-todos of the active item. Bot command `!todo` shows sub-todos of the active item.

## Architecture

Add `parent_id` column to existing `todos` table referencing `project_items.id`. Sub-todo CRUD lives under `/api/progress/items/:id/todos`. The GET `/api/progress` endpoint returns items with their todos nested. Existing standalone `/api/todos` router is removed.

## DB Change

**Add column to `todos`:**
```sql
ALTER TABLE todos ADD COLUMN parent_id INTEGER REFERENCES project_items(id);
```

Migration v11. Existing todos without a parent_id are deleted during migration (todos are short-lived stream tasks, not worth migrating).

```ts
if (from < 11) {
  try { db.exec('ALTER TABLE todos ADD COLUMN parent_id INTEGER'); } catch {}
  db.exec('DELETE FROM todos WHERE parent_id IS NULL');
  console.log('[DB] Migrated: added parent_id to todos, cleaned orphans');
}
```

Update SCHEMA DDL for fresh installs.

## Shared Types

```ts
export interface Todo {
  id: number;
  title: string;
  done: number;
  sort_order: number;
  parent_id: number; // references project_items.id
  created_at: string;
}

export interface ProjectItem {
  // ... existing fields ...
  todos: Todo[]; // populated by GET /api/progress
}
```

## API Changes

### GET `/api/progress` — Enhanced

Returns items with nested todos:
```ts
const items = db.prepare('SELECT * FROM project_items ORDER BY sort_order ASC').all();
for (const item of items) {
  item.todos = db.prepare('SELECT * FROM todos WHERE parent_id = ? ORDER BY done ASC, sort_order ASC').all(item.id);
}
```

### POST `/api/progress/items/:id/todos` — New

Create a sub-todo for an item:
- Body: `{ title: string }`
- Auto-assigns `parent_id` from URL param
- Broadcasts `progress-update`

### PATCH `/api/progress/todos/:id` — New

Update a sub-todo (toggle done, rename):
- Body: `{ done?: number, title?: string }`
- Broadcasts `progress-update`

### DELETE `/api/progress/todos/:id` — New

Delete a sub-todo. Broadcasts `progress-update`.

### DELETE `/api/progress/items/:id` — Enhanced

When deleting a Kanban item, also delete its sub-todos (CASCADE or explicit DELETE).

## UI: ProgressPanel (Kanban)

Each Kanban item card becomes expandable:

**Collapsed (default):**
```
🔨 Login Page    1h 23m   2/3 ✓
```

**Expanded (click to toggle):**
```
🔨 Login Page    1h 23m
  ☑ Mockup abstimmen
  ☐ Design erstellen
  ☐ API Endpoint
  [+ Neue Aufgabe...]
```

- Click on item title → toggle expand
- Checkbox → PATCH todo done
- "+" input → POST new sub-todo
- Sub-todo count "2/3 ✓" visible even when collapsed
- Delete button on each sub-todo (on hover)

## Todos Overlay (`src/overlays/todos/index.html`)

- Fetches from `/public/progress`
- Finds the item with `status === 'in_progress'`
- Displays that item's title as header + its sub-todos as checklist
- If no active item: shows "Kein aktives Feature" / empty state
- Updates via WebSocket `progress-update` events

## Bot Command `!todo`

Updated to show sub-todos of the active item:
```ts
case 'todo': {
  const activeItem = db.prepare('SELECT * FROM project_items WHERE status = ?').get('in_progress');
  if (!activeItem) { client.say(channel, '📋 Kein aktives Feature'); break; }
  const todos = db.prepare('SELECT * FROM todos WHERE parent_id = ? AND done = 0').all(activeItem.id);
  if (todos.length === 0) { client.say(channel, `📋 ${activeItem.title} — Alle Aufgaben erledigt!`); break; }
  const list = todos.map((t, i) => `${i+1}. ${t.title}`).join(' | ');
  client.say(channel, `📋 ${activeItem.title}: ${list}`);
}
```

## Files to Remove

- `src/renderer/src/panels/TodosPanel.tsx` — deleted
- `src/server/api/todos.ts` — deleted (CRUD moves to progress.ts)
- TodosPanel from App.tsx TABS
- Todos router from server/index.ts
- Todos-specific translation keys can stay (reused for sub-todos)

## Translation Keys

Reuse existing:
- `todos.placeholder` → "Neue Aufgabe..." / "New task..."
- `todos.empty` → "Keine Aufgaben" / "No tasks"
- `todos.done_section` → "Erledigt" / "Done"

## Public Endpoint

`GET /public/progress` already returns items. It now also includes sub-todos per item. The todos overlay uses this endpoint.

`GET /public/todos` — removed (or redirects to progress).

## Affected Files

| Category | Files |
|----------|-------|
| DB | `src/server/db/schema.ts` (v11), `src/server/db/index.ts` (migration) |
| Types | `src/shared/types.ts` (parent_id on Todo, todos on ProjectItem) |
| API | `src/server/api/progress.ts` (sub-todo CRUD, nested loading) |
| Server | `src/server/index.ts` (remove todos router, remove /public/todos) |
| UI | `src/renderer/src/panels/ProgressPanel.tsx` (expandable sub-todos) |
| UI | `src/renderer/src/App.tsx` (remove TodosPanel) |
| Overlay | `src/overlays/todos/index.html` (show active item sub-todos) |
| Bot | `src/server/bot/commands.ts` (!todo shows active item sub-todos) |
| Delete | `src/renderer/src/panels/TodosPanel.tsx` |
| Delete | `src/server/api/todos.ts` |

## What Does NOT Change

- Kanban drag-and-drop
- Timer linking
- Progress overlay (items view stays)
- Challenge panel linking
- CSV export (items only, not sub-todos)
- Milestones

## Risk

- Medium: removing TodosPanel and todos API is a breaking change for anyone using the standalone endpoint
- Low: DB migration deletes existing todos (acceptable — they're ephemeral)
- The public `/public/todos` endpoint removal could break the current todos overlay if not updated simultaneously

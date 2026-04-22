# Task-Milestone Linking Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect Progress Tracker todos to milestones so completing all linked todos auto-triggers the milestone overlay.

**Architecture:** FK on `todos.milestone_id` → `milestones.id`, plus `milestones.project_id` → `project_items.id`. Milestone-check logic runs in transactions inside the existing todo toggle/delete endpoints. UI adds inline trophy icon per todo for linking, and a project dropdown when creating milestones.

**Tech Stack:** TypeScript, SQLite (better-sqlite3), Express, React, WebSocket (ws)

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/server/db/index.ts` | Enable FK pragma, add migration v14 |
| Modify | `src/server/db/schema.ts` | Bump SCHEMA_VERSION to 14 |
| Modify | `src/shared/types.ts` | Add `milestone_id` to Todo, `project_id`/counts to Milestone |
| Modify | `src/server/api/milestones.ts` | Accept `project_id` on create, return computed counts on GET |
| Modify | `src/server/api/progress.ts` | Milestone-check on todo toggle/delete, milestone assignment validation |
| Modify | `src/renderer/src/panels/ProgressPanel.tsx` | Inline milestone icon per todo |
| Modify | `src/renderer/src/panels/MilestonesPanel.tsx` | Project dropdown on create, progress indicator |

---

### Task 1: Database — Enable FK Pragma + Migration v14

**Files:**
- Modify: `src/server/db/schema.ts:1`
- Modify: `src/server/db/index.ts:16` and `index.ts:120-123`

- [ ] **Step 1: Bump schema version**

In `src/server/db/schema.ts`, change line 1:
```ts
export const SCHEMA_VERSION = 14;
```

- [ ] **Step 2: Enable foreign key pragma**

In `src/server/db/index.ts`, after line 16 (`db.pragma('journal_mode = WAL');`), add:
```ts
db.pragma('foreign_keys = ON');
```

- [ ] **Step 3: Add migration block**

In `src/server/db/index.ts`, inside `runMigrations()`, before the final `db.prepare('INSERT OR REPLACE INTO schema_version ...` line (line 122), add:

```ts
if (from < 14) {
  try { db.exec('ALTER TABLE todos ADD COLUMN milestone_id INTEGER REFERENCES milestones(id) ON DELETE SET NULL'); } catch {}
  try { db.exec('ALTER TABLE milestones ADD COLUMN project_id INTEGER REFERENCES project_items(id) ON DELETE CASCADE'); } catch {}
  console.log('[DB] Migrated: added milestone_id to todos, project_id to milestones');
}
```

- [ ] **Step 4: Verify the app starts**

Run: `npm run dev`
Expected: `[DB] Initialized at ... (schema v14)` and migration log visible in console. No errors.

- [ ] **Step 5: Commit**

```bash
git add src/server/db/schema.ts src/server/db/index.ts
git commit -m "feat(db): enable FK pragma and add migration v14 for task-milestone linking"
```

---

### Task 2: Shared Types

**Files:**
- Modify: `src/shared/types.ts:40-47` (Todo interface)
- Modify: `src/shared/types.ts:90-98` (Milestone interface)

- [ ] **Step 1: Add `milestone_id` to Todo**

In `src/shared/types.ts`, update the `Todo` interface (line 40-47) to add the field after `parent_id`:
```ts
export interface Todo {
  id: number;
  title: string;
  done: number;
  sort_order: number;
  parent_id: number;
  milestone_id: number | null;
  created_at: string;
}
```

- [ ] **Step 2: Add fields to Milestone**

In `src/shared/types.ts`, update the `Milestone` interface (line 90-98):
```ts
export interface Milestone {
  id: number;
  title: string;
  level: 'minor' | 'major' | 'epic';
  status: 'pending' | 'completed';
  message: string | null;
  project_id: number | null;
  completed_at: string | null;
  created_at: string;
  linkedTodoCount?: number;
  linkedTodoDone?: number;
}
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: May show errors in files that destructure Milestone/Todo — those will be fixed in later tasks. Note any errors for reference.

- [ ] **Step 4: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(types): add milestone_id to Todo, project_id and counts to Milestone"
```

---

### Task 3: Milestones API — project_id + Computed Counts

**Files:**
- Modify: `src/server/api/milestones.ts:10-13` (GET handler)
- Modify: `src/server/api/milestones.ts:15-29` (POST handler)

- [ ] **Step 1: Update GET to return computed counts**

In `src/server/api/milestones.ts`, replace the GET handler (lines 10-13):

```ts
router.get('/', (_req, res) => {
  const milestones = getDb().prepare(`
    SELECT m.*,
      COUNT(t.id) AS linkedTodoCount,
      COALESCE(SUM(CASE WHEN t.done = 1 THEN 1 ELSE 0 END), 0) AS linkedTodoDone
    FROM milestones m
    LEFT JOIN todos t ON t.milestone_id = m.id
    GROUP BY m.id
    ORDER BY m.created_at DESC
  `).all();
  res.json(milestones);
});
```

- [ ] **Step 2: Update POST to accept project_id**

In `src/server/api/milestones.ts`, in the POST handler, replace the INSERT statement (lines 21-23):

```ts
const { title, level, project_id } = req.body;
```

And the insert query:
```ts
const result = getDb().prepare(
  'INSERT INTO milestones (title, level, project_id) VALUES (?, ?, ?)'
).run(title.trim(), level, project_id ?? null);
```

- [ ] **Step 3: Verify the API**

Run: `npm run dev`
Then test: `curl -s http://localhost:4000/api/milestones -H "Authorization: Bearer <token>" | jq`
Expected: Milestones now include `linkedTodoCount: 0` and `linkedTodoDone: 0` fields.

- [ ] **Step 4: Commit**

```bash
git add src/server/api/milestones.ts
git commit -m "feat(api): add project_id to milestone creation, return linked todo counts"
```

---

### Task 4: Progress API — Milestone-Check on Todo Toggle

**Files:**
- Modify: `src/server/api/progress.ts:303-325` (PATCH /todos/:id handler)

- [ ] **Step 1: Add milestone imports**

At the top of `src/server/api/progress.ts`, add `sayInChat` import:
```ts
import { sayInChat } from '../bot/index';
```

- [ ] **Step 2: Replace todo PATCH handler with milestone-check logic**

Replace the existing `PATCH /todos/:id` handler (lines 303-325) with:

```ts
// PATCH sub-todo — with milestone auto-trigger
router.patch('/todos/:id', (req, res) => {
  const { title, done, milestone_id } = req.body;
  const db = getDb();

  const existing = db.prepare('SELECT * FROM todos WHERE id = ?').get(req.params.id) as { id: number; done: number; milestone_id: number | null; parent_id: number } | undefined;
  if (!existing) { res.status(404).json({ error: 'Todo not found' }); return; }

  // Milestone assignment validation
  if (milestone_id !== undefined && milestone_id !== null) {
    const ms = db.prepare('SELECT project_id FROM milestones WHERE id = ?').get(milestone_id) as { project_id: number | null } | undefined;
    if (!ms) { res.status(400).json({ error: 'Milestone not found' }); return; }
    if (ms.project_id !== null && ms.project_id !== existing.parent_id) {
      res.status(400).json({ error: 'Milestone belongs to a different project' }); return;
    }
  }

  const fields: string[] = [];
  const values: unknown[] = [];

  if (title !== undefined) { fields.push('title = ?'); values.push(title); }
  if (done !== undefined) { fields.push('done = ?'); values.push(done ? 1 : 0); }
  if (milestone_id !== undefined) { fields.push('milestone_id = ?'); values.push(milestone_id); }

  if (fields.length === 0) { res.status(400).json({ error: 'No fields to update' }); return; }

  const doUpdate = db.transaction(() => {
    values.push(req.params.id);
    db.prepare(`UPDATE todos SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    const todo = db.prepare('SELECT * FROM todos WHERE id = ?').get(req.params.id) as { id: number; done: number; milestone_id: number | null };

    // Milestone auto-trigger check
    if (todo.milestone_id && done !== undefined) {
      const milestone = db.prepare('SELECT * FROM milestones WHERE id = ?').get(todo.milestone_id) as { id: number; status: string; level: string; title: string } | undefined;
      if (milestone) {
        if (done && milestone.status !== 'completed') {
          // Check if all linked todos are done
          const remaining = db.prepare('SELECT COUNT(*) as c FROM todos WHERE milestone_id = ? AND done = 0').get(todo.milestone_id) as { c: number };
          if (remaining.c === 0) {
            db.prepare('UPDATE milestones SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?').run('completed', todo.milestone_id);
            const updated = db.prepare('SELECT * FROM milestones WHERE id = ?').get(todo.milestone_id);
            broadcast('milestone-trigger', updated);
            if (milestone.level === 'major' || milestone.level === 'epic') {
              const emoji = milestone.level === 'epic' ? '🏆🎉' : '🎉';
              sayInChat(`${emoji} MILESTONE: ${milestone.title}`);
            }
            broadcast('milestone-updated', updated);
          }
        } else if (!done && milestone.status === 'completed') {
          // Revert milestone to pending
          db.prepare('UPDATE milestones SET status = ?, completed_at = NULL WHERE id = ?').run('pending', todo.milestone_id);
          const updated = db.prepare('SELECT * FROM milestones WHERE id = ?').get(todo.milestone_id);
          broadcast('milestone-updated', updated);
        }
      }
    }

    return db.prepare('SELECT * FROM todos WHERE id = ?').get(req.params.id);
  });

  const todo = doUpdate();
  broadcast('progress-update', { action: 'todo-updated', todo });
  res.json(todo);
});
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: No errors related to progress.ts.

- [ ] **Step 4: Commit**

```bash
git add src/server/api/progress.ts
git commit -m "feat(api): add milestone auto-trigger on todo toggle"
```

---

### Task 5: Progress API — Milestone-Check on Todo Delete

**Files:**
- Modify: `src/server/api/progress.ts:328-336` (DELETE /todos/:id handler)

- [ ] **Step 1: Replace todo DELETE handler with milestone-check logic**

Replace the existing `DELETE /todos/:id` handler (lines 328-336) with:

```ts
// DELETE sub-todo — with milestone recheck
router.delete('/todos/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM todos WHERE id = ?').get(req.params.id) as { id: number; milestone_id: number | null } | undefined;
  if (!existing) { res.status(404).json({ error: 'Todo not found' }); return; }

  const milestoneId = existing.milestone_id;

  const doDelete = db.transaction(() => {
    db.prepare('DELETE FROM todos WHERE id = ?').run(req.params.id);

    if (milestoneId) {
      const remaining = db.prepare('SELECT COUNT(*) as total, SUM(CASE WHEN done = 1 THEN 1 ELSE 0 END) as done FROM todos WHERE milestone_id = ?').get(milestoneId) as { total: number; done: number };
      if (remaining.total > 0 && remaining.done === remaining.total) {
        const milestone = db.prepare('SELECT * FROM milestones WHERE id = ? AND status != ?').get(milestoneId, 'completed') as { id: number; level: string; title: string } | undefined;
        if (milestone) {
          db.prepare('UPDATE milestones SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?').run('completed', milestoneId);
          const updated = db.prepare('SELECT * FROM milestones WHERE id = ?').get(milestoneId);
          broadcast('milestone-trigger', updated);
          if (milestone.level === 'major' || milestone.level === 'epic') {
            const emoji = milestone.level === 'epic' ? '🏆🎉' : '🎉';
            sayInChat(`${emoji} MILESTONE: ${milestone.title}`);
          }
          broadcast('milestone-updated', updated);
        }
      }
    }
  });

  doDelete();
  broadcast('progress-update', { action: 'todo-deleted', id: Number(req.params.id) });
  res.status(204).send();
});
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/server/api/progress.ts
git commit -m "feat(api): add milestone recheck on todo deletion"
```

---

### Task 6: Milestones Panel — Project Dropdown + Progress Indicator

**Files:**
- Modify: `src/renderer/src/panels/MilestonesPanel.tsx`

- [ ] **Step 1: Add project data fetching and project dropdown**

In `MilestonesPanel.tsx`, add imports and state for project items. Replace the component with:

```tsx
import React, { useState } from 'react';
import { useApi, apiPost, apiPatch, apiDelete } from '../hooks/useApi';
import { Milestone, ProjectItem } from '../../../shared/types';
import { useWebSocket } from '../hooks/useWebSocket';
import { useTranslation } from '../i18n/LanguageContext';
import { useToast } from '../i18n/ToastContext';

const LEVEL_CONFIG = {
  minor: { emoji: '✨', label: 'Minor', color: '#3498db' },
  major: { emoji: '🎉', label: 'Major', color: '#f39c12' },
  epic: { emoji: '🏆', label: 'Epic', color: '#e74c3c' },
} as const;

type Level = keyof typeof LEVEL_CONFIG;

interface ProgressData {
  project_name: string | null;
  items: ProjectItem[];
}

export default function MilestonesPanel() {
  const { data: milestones, loading, refetch } = useApi<Milestone[]>('/milestones');
  const { data: progressData } = useApi<ProgressData>('/progress');
  const [title, setTitle] = useState('');
  const [level, setLevel] = useState<Level>('major');
  const [projectId, setProjectId] = useState<number | ''>('');
  const { t } = useTranslation();
  const { toast } = useToast();

  useWebSocket((event) => {
    if (event.startsWith('milestone-') || event.startsWith('progress-')) refetch();
  });

  const projectItems = progressData?.items || [];

  const addMilestone = async () => {
    if (!title.trim()) return;
    const result = await apiPost('/milestones', {
      title: title.trim(),
      level,
      project_id: projectId || null,
    });
    if (!result) { toast.error(t('error.action_failed')); return; }
    setTitle('');
    setProjectId('');
  };

  const completeMilestone = async (id: number) => {
    const result = await apiPatch(`/milestones/${id}`, { status: 'completed' });
    if (!result) { toast.error(t('error.action_failed')); return; }
    refetch();
  };

  const deleteMilestone = async (id: number) => {
    const ok = await apiDelete(`/milestones/${id}`);
    if (!ok) { toast.error(t('error.action_failed')); return; }
    refetch();
  };

  if (loading && !milestones) {
    return <div className="panel"><p className="empty">{t('common.loading')}</p></div>;
  }

  const pending = milestones?.filter((ms) => ms.status === 'pending') || [];
  const completed = milestones?.filter((ms) => ms.status === 'completed') || [];

  const getProjectTitle = (pid: number | null) => {
    if (!pid) return null;
    return projectItems.find(p => p.id === pid)?.title || null;
  };

  return (
    <div className="panel milestones-panel">
      <h2>🎉 Milestones</h2>

      <div className="milestone-list">
        {pending.length === 0 && <p className="empty">{t('milestones.empty')}</p>}
        {pending.map((ms) => (
          <div key={ms.id} className="milestone-item pending">
            <button
              className="status-toggle"
              onClick={() => completeMilestone(ms.id)}
              title={t('milestones.check_tooltip')}
            >
              ⬜
            </button>
            <span className="ms-level" style={{ color: LEVEL_CONFIG[ms.level]?.color }}>
              {LEVEL_CONFIG[ms.level]?.emoji}
            </span>
            <div className="ms-content">
              <span className="ms-title">{ms.title}</span>
              {ms.project_id && (
                <span className="ms-project">{getProjectTitle(ms.project_id)}</span>
              )}
              {(ms.linkedTodoCount ?? 0) > 0 && (
                <span className="ms-todo-progress">
                  ☑ {ms.linkedTodoDone ?? 0}/{ms.linkedTodoCount} Todos
                </span>
              )}
            </div>
            <button className="btn-delete-small" onClick={() => deleteMilestone(ms.id)} title={t('tooltip.delete')}>✕</button>
          </div>
        ))}
      </div>

      {completed.length > 0 && (
        <div className="milestone-history">
          <h3>{`${t('milestones.completed')} (${completed.length})`}</h3>
          {completed.map((ms) => (
            <div key={ms.id} className="milestone-item completed">
              <span className="status-toggle done">✅</span>
              <span className="ms-level">{LEVEL_CONFIG[ms.level]?.emoji}</span>
              <span className="ms-title">{ms.title}</span>
              <span className="ms-time">
                {ms.completed_at ? new Date(ms.completed_at + 'Z').toLocaleDateString('de-DE') : ''}
              </span>
              <button className="btn-delete-small" onClick={() => deleteMilestone(ms.id)} title={t('tooltip.delete')}>✕</button>
            </div>
          ))}
        </div>
      )}

      <div className="milestone-add">
        <input
          type="text"
          placeholder="Neuer Milestone..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addMilestone()}
        />
        <select
          className="milestone-project-select"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : '')}
        >
          <option value="">Kein Projekt</option>
          {projectItems.map((p) => (
            <option key={p.id} value={p.id}>{p.title}</option>
          ))}
        </select>
        <div className="milestone-level-select">
          {(Object.entries(LEVEL_CONFIG) as Array<[Level, typeof LEVEL_CONFIG[Level]]>).map(([lvl, config]) => (
            <button
              key={lvl}
              className={`level-btn ${level === lvl ? 'active' : ''}`}
              style={{ borderColor: level === lvl ? config.color : 'transparent' }}
              onClick={() => setLevel(lvl)}
              title={config.label}
            >
              {config.emoji}
            </button>
          ))}
        </div>
        <button onClick={addMilestone} disabled={!title.trim()}>+</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: No errors.

- [ ] **Step 3: Visually verify in browser**

Run: `npm run dev`
Expected: Milestones panel shows project dropdown in the add form. Pending milestones with linked todos show the progress count.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/panels/MilestonesPanel.tsx
git commit -m "feat(ui): add project dropdown and todo progress indicator to milestones panel"
```

---

### Task 7: Progress Panel — Inline Milestone Icon per Todo

**Files:**
- Modify: `src/renderer/src/panels/ProgressPanel.tsx`

- [ ] **Step 1: Fetch milestones data**

In `ProgressPanel.tsx`, add the Milestone import and fetch milestones alongside progress data. After the existing `useApi` calls (around line 20-21), add:

```tsx
import { ProjectItem, StreamState, Milestone } from '../../../shared/types';
```
(Replace the existing import that only imports `ProjectItem, StreamState`)

And add the milestones data hook after the streamState hook (around line 26):
```tsx
const { data: milestones, refetch: refetchMilestones } = useApi<Milestone[]>('/milestones');
```

Update the WebSocket handler to also refetch milestones:
```tsx
useWebSocket((event) => {
  if (event.startsWith('progress-')) refetch();
  if (event.startsWith('milestone-')) refetchMilestones();
});
```

- [ ] **Step 2: Add milestone linking state and handler**

Add state for the active milestone picker dropdown. After the existing state declarations (around line 36):

```tsx
const [milestonePickerTodo, setMilestonePickerTodo] = useState<number | null>(null);
```

Add a handler for linking a todo to a milestone:
```tsx
const linkTodoToMilestone = async (todoId: number, milestoneId: number | null) => {
  const result = await apiPatch(`/progress/todos/${todoId}`, { milestone_id: milestoneId });
  if (!result) { toast.error(t('error.action_failed')); return; }
  setMilestonePickerTodo(null);
  refetch();
  refetchMilestones();
};
```

- [ ] **Step 3: Add milestone icon to each todo in renderItem**

Inside `renderItem`, in the todo list mapping (around line 304-314), replace the todo rendering with milestone icon support. Replace the `{todos.map(td => (` block:

```tsx
{todos.map(td => {
  const projectMilestones = (milestones || []).filter(
    ms => ms.project_id === item.id && ms.status === 'pending'
  );
  const linkedMs = td.milestone_id
    ? (milestones || []).find(ms => ms.id === td.milestone_id)
    : null;
  const showIcon = linkedMs || projectMilestones.length > 0;

  return (
    <div key={td.id} className={`sub-todo ${td.done ? 'done' : ''}`}>
      <button
        className="sub-todo-check"
        onClick={e => toggleTodo(td.id, td.done, e.currentTarget)}
      >
        {td.done ? '☑' : '☐'}
      </button>
      <span className="sub-todo-title">{td.title}</span>
      {showIcon && (
        <span className="sub-todo-milestone-wrapper">
          <button
            className={`sub-todo-milestone ${linkedMs ? 'linked' : 'unlinked'}`}
            onClick={() => setMilestonePickerTodo(milestonePickerTodo === td.id ? null : td.id)}
            title={linkedMs ? linkedMs.title : 'Mit Milestone verknüpfen'}
          >
            🏆
          </button>
          {milestonePickerTodo === td.id && (
            <div className="milestone-picker">
              {linkedMs && (
                <button
                  className="milestone-picker-item unlink"
                  onClick={() => linkTodoToMilestone(td.id, null)}
                >
                  ✕ Trennen
                </button>
              )}
              {projectMilestones.map(ms => (
                <button
                  key={ms.id}
                  className={`milestone-picker-item ${td.milestone_id === ms.id ? 'active' : ''}`}
                  onClick={() => linkTodoToMilestone(td.id, ms.id)}
                >
                  {LEVEL_CONFIG_PROGRESS[ms.level]?.emoji} {ms.title}
                </button>
              ))}
              {projectMilestones.length === 0 && !linkedMs && (
                <span className="milestone-picker-empty">Keine Milestones für dieses Projekt</span>
              )}
            </div>
          )}
        </span>
      )}
      <button className="btn-delete-small" onClick={() => deleteTodo(td.id)} title={t('tooltip.delete')}>✕</button>
    </div>
  );
})}
```

Also add the level config constant near the top of the file (outside the component):
```tsx
const LEVEL_CONFIG_PROGRESS = {
  minor: { emoji: '✨' },
  major: { emoji: '🎉' },
  epic: { emoji: '🏆' },
} as const;
```

- [ ] **Step 4: Verify typecheck**

Run: `npm run typecheck`
Expected: No errors.

- [ ] **Step 5: Visually verify in browser**

Run: `npm run dev`
Expected: Todos that belong to projects with milestones show a trophy icon. Clicking opens a picker dropdown. Linking a todo and then completing all linked todos triggers the milestone overlay.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/panels/ProgressPanel.tsx
git commit -m "feat(ui): add inline milestone linking icon to progress tracker todos"
```

---

### Task 8: CSS Styles for New UI Elements

**Files:**
- Modify: CSS file used by the panels (check for existing milestone/progress styles)

- [ ] **Step 1: Open the CSS file**

The styles live in `src/renderer/src/index.css`. This file contains `.milestones-panel` and `.progress-panel` styles.

- [ ] **Step 2: Add styles for milestone picker and progress indicator**

Add these styles:

```css
/* Milestone todo progress indicator */
.ms-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.ms-project {
  font-size: 0.75rem;
  opacity: 0.6;
}

.ms-todo-progress {
  font-size: 0.75rem;
  color: #3498db;
}

.milestone-project-select {
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bg-secondary);
  color: var(--text);
  font-size: 0.85rem;
}

/* Inline milestone icon on todos */
.sub-todo-milestone-wrapper {
  position: relative;
}

.sub-todo-milestone {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.8rem;
  padding: 0 4px;
  opacity: 0.3;
  transition: opacity 0.2s;
}

.sub-todo-milestone.linked {
  opacity: 1;
}

.sub-todo-milestone:hover {
  opacity: 0.8;
}

/* Milestone picker dropdown */
.milestone-picker {
  position: absolute;
  top: 100%;
  right: 0;
  z-index: 10;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 4px;
  min-width: 180px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.milestone-picker-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 6px 10px;
  border: none;
  background: none;
  color: var(--text);
  cursor: pointer;
  border-radius: 4px;
  font-size: 0.85rem;
}

.milestone-picker-item:hover {
  background: var(--bg-hover);
}

.milestone-picker-item.active {
  background: var(--accent-bg);
}

.milestone-picker-item.unlink {
  color: #e74c3c;
}

.milestone-picker-empty {
  display: block;
  padding: 6px 10px;
  font-size: 0.8rem;
  opacity: 0.5;
}
```

- [ ] **Step 3: Visually verify all new UI elements**

Run: `npm run dev`
Expected: Milestone picker dropdown looks clean, project dropdown in milestones panel fits the layout, progress indicator is readable.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/index.css
git commit -m "style: add milestone linking and progress indicator styles"
```

---

### Task 9: End-to-End Verification

- [ ] **Step 1: Full flow test**

1. Create a project item in Progress Tracker
2. Add 2-3 sub-todos to the project
3. In Milestones panel, create a milestone with that project selected
4. In Progress Tracker, link each todo to the milestone via the trophy icon
5. Check all todos one by one
6. After the last todo is checked: milestone overlay should fire, milestone panel should show it as completed

- [ ] **Step 2: Revert flow test**

1. Uncheck one of the linked todos
2. Milestone should revert to pending in the milestones panel
3. No overlay trigger on revert

- [ ] **Step 3: Manual override test**

1. With some todos still unchecked, manually complete the milestone via the button
2. Milestone should be completed
3. Uncheck a linked todo — milestone should revert to pending

- [ ] **Step 4: Deletion test**

1. Delete a linked todo that was pending — if remaining are all done, milestone auto-triggers
2. Delete a milestone — todos should keep their data, icon disappears

- [ ] **Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address issues found during e2e verification"
```

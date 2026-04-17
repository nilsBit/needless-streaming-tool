# Time Tracking per Feature Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Link the challenge timer to individual project items so time is tracked per feature, with auto-switch, CSV export, and overlay display.

**Architecture:** Add `time_spent` column to `project_items`. Status changes on items trigger challenge timer linking via `db.transaction()`. Stream-state PATCH detects linked items for hotkey compatibility. ProgressPanel gets live timer display. Progress overlay shows time per item.

**Tech Stack:** SQLite (better-sqlite3 transactions), Express, React, HTML overlay

**Spec:** `docs/superpowers/specs/2026-04-17-time-tracking-design.md`

---

### Task 1: DB migration + types + translation keys

**Files:**
- Modify: `src/server/db/schema.ts`
- Modify: `src/server/db/index.ts`
- Modify: `src/shared/types.ts`
- Modify: `src/renderer/src/i18n/translations.ts`

- [ ] **Step 1: Update schema and types**

`src/server/db/schema.ts`: Bump `SCHEMA_VERSION` to 8. Add `time_spent INTEGER DEFAULT 0` to the `project_items` CREATE TABLE in the SCHEMA DDL.

`src/server/db/index.ts`: Add migration block:
```ts
if (from < 8) {
  try { db.exec('ALTER TABLE project_items ADD COLUMN time_spent INTEGER DEFAULT 0'); } catch {}
  console.log('[DB] Migrated: added time_spent to project_items');
}
```

`src/shared/types.ts`: Add `time_spent: number` to `ProjectItem` interface.

- [ ] **Step 2: Add translation keys**

Add to `src/renderer/src/i18n/translations.ts`:
```ts
// ---- Time Tracking ----
'progress.time_spent': { de: 'Zeitaufwand', en: 'Time spent' },
'progress.export_csv': { de: '📥 CSV Export', en: '📥 CSV Export' },
'progress.linked_challenge': { de: 'Verknüpft mit Progress Tracker', en: 'Linked to Progress Tracker' },
'progress.less_than_minute': { de: '< 1m', en: '< 1m' },
'progress.active': { de: 'Aktiv', en: 'Active' },
'progress.total_time': { de: 'Gesamtzeit', en: 'Total time' },
```

- [ ] **Step 3: Commit**

```bash
git add src/server/db/schema.ts src/server/db/index.ts src/shared/types.ts src/renderer/src/i18n/translations.ts
git commit -m "feat(time): add time_spent column, migration v8, types, translation keys"
```

---

### Task 2: Server-side status change logic in progress.ts

**Files:**
- Modify: `src/server/api/progress.ts`

- [ ] **Step 1: Rewrite PATCH /items/:id with timer linking logic**

Read `src/server/api/progress.ts`. Replace the PATCH handler with enhanced logic. The key change: when `status` changes, use `db.transaction()` to atomically update the item, any previously-active item, and `stream_state`.

```ts
router.patch('/items/:id', (req, res) => {
  const { title, status, sort_order, current_timer_seconds } = req.body;
  const db = getDb();

  if (status !== undefined && !validateEnum(status, VALID_PROJECT_ITEM_STATUS, 'status', res)) return;

  const existing = db.prepare('SELECT * FROM project_items WHERE id = ?').get(req.params.id) as { id: number; title: string; status: string; time_spent: number } | undefined;
  if (!existing) { res.status(404).json({ error: 'Item not found' }); return; }

  // Non-status changes (title, sort_order only)
  if (status === undefined) {
    const fields: string[] = [];
    const values: unknown[] = [];
    if (title !== undefined) { fields.push('title = ?'); values.push(title); }
    if (sort_order !== undefined) { fields.push('sort_order = ?'); values.push(sort_order); }
    if (fields.length === 0) { res.status(400).json({ error: 'No fields to update' }); return; }
    values.push(req.params.id);
    db.prepare(`UPDATE project_items SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    // If active item title changed, update challenge_title
    if (title !== undefined && existing.status === 'in_progress') {
      db.prepare('UPDATE stream_state SET challenge_title = ? WHERE id = 1').run(title);
      broadcast('stream-state', db.prepare('SELECT * FROM stream_state WHERE id = 1').get());
    }

    const item = db.prepare('SELECT * FROM project_items WHERE id = ?').get(req.params.id);
    broadcast('progress-update', { action: 'item-updated', item });
    res.json(item);
    return;
  }

  // Status change — wrapped in transaction
  const doStatusChange = db.transaction(() => {
    const state = db.prepare('SELECT * FROM stream_state WHERE id = 1').get() as { timer_seconds: number; timer_running: number; challenge_title: string | null };
    const timerValue = current_timer_seconds !== undefined ? current_timer_seconds : state.timer_seconds;

    if (status === 'in_progress') {
      // Pause any currently active item
      const activeItem = db.prepare('SELECT * FROM project_items WHERE status = ? AND id != ?').get('in_progress', req.params.id) as { id: number; time_spent: number } | undefined;
      if (activeItem) {
        db.prepare('UPDATE project_items SET status = ?, time_spent = time_spent + ? WHERE id = ?').run('pending', timerValue, activeItem.id);
      }
      // Set new item to in_progress
      db.prepare('UPDATE project_items SET status = ? WHERE id = ?').run('in_progress', req.params.id);
      // Link to challenge timer (resume from item's saved time)
      const itemTitle = title !== undefined ? title : existing.title;
      db.prepare('UPDATE stream_state SET challenge_title = ?, challenge_status = ?, timer_seconds = ?, timer_running = 1 WHERE id = 1').run(itemTitle, 'in_progress', existing.time_spent);
    } else if (status === 'done') {
      // Save time if item was in_progress
      if (existing.status === 'in_progress') {
        db.prepare('UPDATE project_items SET status = ?, time_spent = time_spent + ? WHERE id = ?').run('done', timerValue, req.params.id);
        db.prepare('UPDATE stream_state SET challenge_status = ?, timer_running = 0 WHERE id = 1').run('done');
      } else {
        db.prepare('UPDATE project_items SET status = ? WHERE id = ?').run('done', req.params.id);
      }
    } else if (status === 'pending') {
      // Save time and stop timer if item was in_progress
      if (existing.status === 'in_progress') {
        db.prepare('UPDATE project_items SET status = ?, time_spent = time_spent + ? WHERE id = ?').run('pending', timerValue, req.params.id);
        db.prepare('UPDATE stream_state SET challenge_title = NULL, challenge_status = ?, timer_seconds = 0, timer_running = 0 WHERE id = 1').run('idle');
      } else {
        db.prepare('UPDATE project_items SET status = ? WHERE id = ?').run('pending', req.params.id);
      }
    }

    // Also update title/sort_order if provided
    if (title !== undefined) db.prepare('UPDATE project_items SET title = ? WHERE id = ?').run(title, req.params.id);
    if (sort_order !== undefined) db.prepare('UPDATE project_items SET sort_order = ? WHERE id = ?').run(sort_order, req.params.id);
  });

  doStatusChange();

  const item = db.prepare('SELECT * FROM project_items WHERE id = ?').get(req.params.id);
  const streamState = db.prepare('SELECT * FROM stream_state WHERE id = 1').get();
  broadcast('progress-update', { action: 'item-updated', item });
  broadcast('stream-state', streamState);
  res.json(item);
});
```

- [ ] **Step 2: Enhance DELETE handler**

Replace the DELETE handler:
```ts
router.delete('/items/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM project_items WHERE id = ?').get(req.params.id) as { id: number; status: string; time_spent: number } | undefined;
  if (!existing) { res.status(404).json({ error: 'Item not found' }); return; }

  const doDelete = db.transaction(() => {
    // If deleting the active item, save time and reset challenge
    if (existing.status === 'in_progress') {
      const state = db.prepare('SELECT timer_seconds FROM stream_state WHERE id = 1').get() as { timer_seconds: number };
      db.prepare('UPDATE project_items SET time_spent = time_spent + ? WHERE id = ?').run(state.timer_seconds, req.params.id);
      db.prepare('UPDATE stream_state SET challenge_title = NULL, challenge_status = ?, timer_seconds = 0, timer_running = 0 WHERE id = 1').run('idle');
    }
    db.prepare('DELETE FROM project_items WHERE id = ?').run(req.params.id);
  });

  doDelete();
  broadcast('progress-update', { action: 'item-deleted', id: Number(req.params.id) });
  if (existing.status === 'in_progress') {
    broadcast('stream-state', db.prepare('SELECT * FROM stream_state WHERE id = 1').get());
  }
  res.status(204).send();
});
```

- [ ] **Step 3: Add CSV export endpoint**

Add after the DELETE handler:
```ts
router.get('/export', (_req, res) => {
  const db = getDb();
  const items = db.prepare('SELECT * FROM project_items ORDER BY sort_order ASC').all() as Array<{ title: string; status: string; time_spent: number; created_at: string }>;
  const state = db.prepare('SELECT timer_seconds FROM stream_state WHERE id = 1').get() as { timer_seconds: number };

  const rows = items.map(item => {
    // For active item, add current timer_seconds for accurate live total
    const totalSeconds = item.status === 'in_progress' ? item.time_spent + state.timer_seconds : item.time_spent;
    const minutes = Math.round(totalSeconds / 60);
    const escapedTitle = item.title.includes(',') ? `"${item.title}"` : item.title;
    return `${escapedTitle},${item.status},${minutes},${item.created_at}`;
  });

  const csv = 'Title,Status,Time Spent (minutes),Created At\n' + rows.join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=project-progress.csv');
  res.send(csv);
});
```

- [ ] **Step 4: Commit**

```bash
git add src/server/api/progress.ts
git commit -m "feat(time): add status-change timer logic, delete cleanup, CSV export"
```

---

### Task 3: Stream-state PATCH — linked item detection

**Files:**
- Modify: `src/server/api/stream-state.ts`

- [ ] **Step 1: Add linked-item detection to stream-state PATCH**

Read `src/server/api/stream-state.ts`. After the existing UPDATE and before the broadcast, add logic to detect when `challenge_status` changes to `'done'` or `'failed'` and a project item is linked:

After the line `db.prepare(\`UPDATE stream_state SET ...\`).run(...)`, add:

```ts
// If challenge is being completed/failed, check for linked project item
if (challenge_status === 'done' || challenge_status === 'failed') {
  const currentState = db.prepare('SELECT challenge_title, timer_seconds FROM stream_state WHERE id = 1').get() as { challenge_title: string | null; timer_seconds: number };
  if (currentState.challenge_title) {
    const linkedItem = db.prepare('SELECT * FROM project_items WHERE title = ? AND status = ?').get(currentState.challenge_title, 'in_progress') as { id: number; time_spent: number } | undefined;
    if (linkedItem) {
      const timerValue = timer_seconds !== undefined ? timer_seconds : currentState.timer_seconds;
      db.prepare('UPDATE project_items SET status = ?, time_spent = time_spent + ? WHERE id = ?').run('done', timerValue, linkedItem.id);
      broadcast('progress-update', { action: 'item-updated', item: db.prepare('SELECT * FROM project_items WHERE id = ?').get(linkedItem.id) });
    }
  }
}
```

This ensures hotkeys (`challenge_done`, `challenge_failed`) that call `/api/stream-state` directly will still save time to the linked project item.

- [ ] **Step 2: Commit**

```bash
git add src/server/api/stream-state.ts
git commit -m "feat(time): detect linked project items on challenge done/failed"
```

---

### Task 4: ProgressPanel — live timer + time display + export

**Files:**
- Modify: `src/renderer/src/panels/ProgressPanel.tsx`

- [ ] **Step 1: Add time display, live timer, and export button**

Read the current ProgressPanel. Make these changes:

**Add imports:**
```tsx
import { useEffect } from 'react'; // add to existing React import
import { useApi, apiPost, apiPatch, apiDelete, getApiToken } from '../hooks/useApi';
import { StreamState } from '../../../shared/types'; // add StreamState
```

**Add stream-state hook for timer sync:**
```tsx
const { data: streamState } = useApi<StreamState>('/stream-state');
const [liveSeconds, setLiveSeconds] = useState(0);
```

**Add live timer tick effect** (same pattern as ChallengePanel):
```tsx
useEffect(() => {
  if (streamState) setLiveSeconds(streamState.timer_seconds);
}, [streamState]);

useEffect(() => {
  if (!streamState?.timer_running) return;
  const interval = setInterval(() => {
    setLiveSeconds(s => s + 1);
  }, 1000);
  return () => clearInterval(interval);
}, [streamState?.timer_running]);
```

**Add formatTime helper:**
```tsx
function formatTime(seconds: number): string {
  if (seconds < 60) return t('progress.less_than_minute');
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
```

**Update cycleStatus to send current_timer_seconds:**
```tsx
const cycleStatus = async (item: ProjectItem) => {
  const next = item.status === 'pending' ? 'in_progress' : item.status === 'in_progress' ? 'done' : 'pending';
  const result = await apiPatch(`/progress/items/${item.id}`, {
    status: next,
    current_timer_seconds: liveSeconds,
  });
  if (!result) { toast.error(t('error.action_failed')); return; }
  refetch();
};
```

**Add export function:**
```tsx
const exportCsv = () => {
  const token = getApiToken();
  window.open(`http://localhost:4000/api/progress/export?token=${token}`, '_blank');
};
```

**Update item rendering to show time:**
```tsx
{items.map((item) => {
  const isActive = item.status === 'in_progress';
  const displayTime = isActive ? item.time_spent + liveSeconds : item.time_spent;
  return (
    <div key={item.id} className={`progress-item status-${item.status}`}>
      <button className="status-toggle" onClick={() => cycleStatus(item)}>{statusEmoji(item.status)}</button>
      <span className="item-title">{item.title}</span>
      {displayTime > 0 && <span className="item-time">{formatTime(displayTime)}</span>}
      <button className="btn-delete-small" onClick={() => deleteItem(item.id)} title={t('tooltip.delete')}>✕</button>
    </div>
  );
})}
```

**Add export button next to project name:**
```tsx
<button className="btn-export-small" onClick={exportCsv} title={t('progress.export_csv')}>📥</button>
```

- [ ] **Step 2: Add CSS for time display**

Append to `src/renderer/src/index.css`:
```css
.item-time {
  font-size: 12px;
  color: #888;
  margin-left: auto;
  margin-right: 8px;
  font-family: 'SF Mono', monospace;
}

.status-in_progress .item-time {
  color: #e67e22;
}

.btn-export-small {
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 14px;
  padding: 2px 6px;
  opacity: 0.7;
}
.btn-export-small:hover { opacity: 1; }
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/panels/ProgressPanel.tsx src/renderer/src/index.css
git commit -m "feat(time): add live timer, time display, and CSV export to ProgressPanel"
```

---

### Task 5: ChallengePanel — linked item indicator

**Files:**
- Modify: `src/renderer/src/panels/ChallengePanel.tsx`

- [ ] **Step 1: Show linked-item indicator**

Read ChallengePanel. Add a check if the active challenge matches a project item. Fetch progress data:

```tsx
import { ProjectItem } from '../../../shared/types';
const { data: progressData } = useApi<{ items: ProjectItem[] }>('/progress');
```

Before the JSX return, add:
```tsx
const isLinkedToProgress = isActive && progressData?.items?.some(
  item => item.status === 'in_progress' && item.title === state?.challenge_title
);
```

In the active challenge view, show an indicator:
```tsx
{isLinkedToProgress && (
  <p className="linked-indicator">{t('progress.linked_challenge')}</p>
)}
```

Add CSS:
```css
.linked-indicator {
  font-size: 12px;
  color: #888;
  font-style: italic;
  margin-top: -4px;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/panels/ChallengePanel.tsx src/renderer/src/index.css
git commit -m "feat(time): show linked-item indicator in ChallengePanel"
```

---

### Task 6: Progress overlay — time display

**Files:**
- Modify: `src/overlays/progress/index.html`

- [ ] **Step 1: Add time display to overlay items**

Read the progress overlay JS section. The overlay also needs to listen for `stream-state` events to get the live timer for the active item.

In the `render()` function, update the item HTML generation to include time:

```js
function formatTime(seconds) {
  if (seconds < 60) return '< 1m';
  var h = Math.floor(seconds / 3600);
  var m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? h + 'h ' + m + 'm' : m + 'm';
}
```

Add a `liveTimerSeconds` variable that gets updated from stream-state:
```js
let liveTimerSeconds = 0;
```

In the WebSocket onmessage handler, also listen for `stream-state`:
```js
if (msg.event === 'stream-state' && msg.data) {
  liveTimerSeconds = msg.data.timer_seconds || 0;
  render();
}
```

In the render loop where items are built, add time display:
```js
var timeSpent = item.time_spent || 0;
if (isInProgress) timeSpent += liveTimerSeconds;
var timeStr = timeSpent > 0 ? formatTime(timeSpent) : '';

html += '<div class="item" style="animation-delay:' + (i * 0.06) + 's">'
  + '<div class="' + checkClass + '">' + checkmark + '</div>'
  + '<span class="' + textClass + '">' + escapeHtml(item.title) + '</span>'
  + (timeStr ? '<span class="item-time">' + timeStr + '</span>' : '')
  + '</div>';
```

Add CSS for `.item-time` in the overlay's `<style>`:
```css
.item-time {
  font-family: var(--font-body);
  font-size: 11px;
  color: #888;
  margin-left: auto;
}
.item.in-progress .item-time,
.in-progress + .item-time {
  color: var(--color-primary);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/overlays/progress/index.html
git commit -m "feat(time): show time per feature in progress overlay"
```

---

### Task 7: Typecheck + verification

- [ ] **Step 1: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: No new errors

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "feat(time): fix remaining time tracking issues"
```

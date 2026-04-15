# Clip Stream/Recording Timecodes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically capture OBS stream/recording elapsed time when creating clip moments, display it in the UI, and use it in DaVinci Resolve exports.

**Architecture:** OBS WebSocket events track streaming/recording state in-memory and in the DB. On clip creation, the server queries OBS for the exact timecode. The UI shows timecodes alongside the wall-clock time, and the CSV export uses real OBS timecodes when available.

**Tech Stack:** obs-websocket-js (existing), better-sqlite3 (existing), Express, React

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/server/db/schema.ts` | Modify | Bump SCHEMA_VERSION to 6 |
| `src/server/db/index.ts` | Modify | Add v6 migration (3 ALTER TABLEs) |
| `src/shared/types.ts` | Modify | Add fields to `Clip` and `StreamState` interfaces |
| `src/server/obs/index.ts` | Modify | Add event listeners, in-memory state, `getStreamTimecodes()` |
| `src/server/api/clips.ts` | Modify | Async POST with timecodes, updated export |
| `src/renderer/src/panels/ClipsPanel.tsx` | Modify | Timecode display logic |

---

### Task 1: DB Migration v5 -> v6

**Files:**
- Modify: `src/server/db/schema.ts:1`
- Modify: `src/server/db/index.ts:39-61`

- [ ] **Step 1: Bump SCHEMA_VERSION**

In `src/server/db/schema.ts`, change line 1:

```ts
export const SCHEMA_VERSION = 6;
```

- [ ] **Step 2: Add v6 migration block**

In `src/server/db/index.ts`, inside `runMigrations()`, add after the `if (from < 5)` block (before the final `db.prepare('INSERT OR REPLACE...')` line):

```ts
  if (from < 6) {
    try { db.exec('ALTER TABLE clips ADD COLUMN stream_timecode TEXT'); } catch {}
    try { db.exec('ALTER TABLE clips ADD COLUMN recording_timecode TEXT'); } catch {}
    try { db.exec('ALTER TABLE stream_state ADD COLUMN is_recording INTEGER DEFAULT 0'); } catch {}
    console.log('[DB] Migrated: added timecode columns to clips, is_recording to stream_state');
  }
```

- [ ] **Step 3: Verify typecheck passes**

Run: `npx tsc --noEmit`
Expected: No errors (new columns are nullable, existing code unaffected)

- [ ] **Step 4: Commit**

```bash
git add src/server/db/schema.ts src/server/db/index.ts
git commit -m "feat: add DB migration v6 for clip timecodes and is_recording"
```

---

### Task 2: Update Shared Types

**Files:**
- Modify: `src/shared/types.ts:73-79` (Clip interface)
- Modify: `src/shared/types.ts:1-11` (StreamState interface)

- [ ] **Step 1: Add timecode fields to Clip interface**

In `src/shared/types.ts`, replace the `Clip` interface:

```ts
export interface Clip {
  id: number;
  tag: string;
  note: string | null;
  session_date: string;
  stream_timecode: string | null;
  recording_timecode: string | null;
  created_at: string;
}
```

- [ ] **Step 2: Add is_recording to StreamState interface**

In `src/shared/types.ts`, replace the `StreamState` interface:

```ts
export interface StreamState {
  id: number;
  experiment_title: string | null;
  experiment_status: 'idle' | 'in_progress' | 'done' | 'failed';
  timer_seconds: number;
  timer_running: number;
  is_live: number;
  is_recording: number;
  project_name: string | null;
}
```

- [ ] **Step 3: Verify typecheck passes**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: add timecode fields to Clip and is_recording to StreamState"
```

---

### Task 3: OBS Event Tracking and getStreamTimecodes()

**Files:**
- Modify: `src/server/obs/index.ts`

- [ ] **Step 1: Add in-memory state variables**

In `src/server/obs/index.ts`, after the existing `let connected = false;` line (line 5), add:

```ts
let isStreaming = false;
let isRecording = false;
```

- [ ] **Step 2: Add helper to parse OBS timecode**

In `src/server/obs/index.ts`, add before the closing of the file (before the `export async function getCurrentScene()` block):

```ts
function parseObsTimecode(timecode: string): string {
  // OBS returns "HH:MM:SS.mmm" — strip milliseconds
  return timecode.split('.')[0];
}
```

- [ ] **Step 3: Add getStreamTimecodes() function**

Add after the `parseObsTimecode` function:

```ts
export async function getStreamTimecodes(): Promise<{
  stream_timecode: string | null;
  recording_timecode: string | null;
}> {
  if (!obs || !connected) {
    return { stream_timecode: null, recording_timecode: null };
  }

  const results: { stream_timecode: string | null; recording_timecode: string | null } = {
    stream_timecode: null,
    recording_timecode: null,
  };

  const promises: Promise<void>[] = [];

  if (isStreaming) {
    promises.push(
      obs.call('GetStreamStatus').then((status) => {
        if (status.outputActive && status.outputTimecode) {
          results.stream_timecode = parseObsTimecode(status.outputTimecode);
        }
      }).catch(() => {})
    );
  }

  if (isRecording) {
    promises.push(
      obs.call('GetRecordStatus').then((status) => {
        if (status.outputActive && status.outputTimecode) {
          results.recording_timecode = parseObsTimecode(status.outputTimecode);
        }
      }).catch(() => {})
    );
  }

  await Promise.all(promises);
  return results;
}
```

- [ ] **Step 4: Register OBS event listeners in connectObs()**

In `src/server/obs/index.ts`, inside the `connectObs()` function, after the `connected = true;` line and before the `console.log` and `broadcast` lines, add:

```ts
    // Sync initial state
    try {
      const streamStatus = await obs.call('GetStreamStatus');
      isStreaming = streamStatus.outputActive;
    } catch { isStreaming = false; }
    try {
      const recordStatus = await obs.call('GetRecordStatus');
      isRecording = recordStatus.outputActive;
    } catch { isRecording = false; }

    // Update DB with initial state
    try {
      getDb().prepare('UPDATE stream_state SET is_live = ?, is_recording = ? WHERE id = 1').run(isStreaming ? 1 : 0, isRecording ? 1 : 0);
      broadcast('stream-state', getDb().prepare('SELECT * FROM stream_state WHERE id = 1').get());
    } catch {}

    // Listen for state changes
    obs.on('StreamStateChanged', (event) => {
      isStreaming = event.outputActive;
      try {
        getDb().prepare('UPDATE stream_state SET is_live = ? WHERE id = 1').run(isStreaming ? 1 : 0);
        broadcast('stream-state', getDb().prepare('SELECT * FROM stream_state WHERE id = 1').get());
      } catch {}
      console.log(`[OBS] Stream ${isStreaming ? 'started' : 'stopped'}`);
    });

    obs.on('RecordStateChanged', (event) => {
      isRecording = event.outputActive;
      try {
        getDb().prepare('UPDATE stream_state SET is_recording = ? WHERE id = 1').run(isRecording ? 1 : 0);
        broadcast('stream-state', getDb().prepare('SELECT * FROM stream_state WHERE id = 1').get());
      } catch {}
      console.log(`[OBS] Recording ${isRecording ? 'started' : 'stopped'}`);
    });
```

- [ ] **Step 5: Reset state in disconnectObs()**

In `src/server/obs/index.ts`, inside `disconnectObs()`, after `obs = null;` and before the `broadcast` call, add:

```ts
    isStreaming = false;
    isRecording = false;
```

- [ ] **Step 6: Verify typecheck passes**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add src/server/obs/index.ts
git commit -m "feat: OBS event tracking for stream/recording state and getStreamTimecodes()"
```

---

### Task 4: Async Clip Creation with Timecodes

**Files:**
- Modify: `src/server/api/clips.ts:86-102` (POST route)

- [ ] **Step 1: Add import for getStreamTimecodes**

In `src/server/api/clips.ts`, add to the imports at the top:

```ts
import { getStreamTimecodes } from '../obs/index';
```

- [ ] **Step 2: Update POST route to async with timecodes**

In `src/server/api/clips.ts`, replace the POST route (lines 86-102):

```ts
// POST new clip
router.post('/', async (req, res) => {
  const { tag, note } = req.body;
  if (!tag) { res.status(400).json({ error: 'tag required' }); return; }

  const sessionDate = new Date().toISOString().split('T')[0];
  const { stream_timecode, recording_timecode } = await getStreamTimecodes();

  const result = getDb().prepare(
    'INSERT INTO clips (tag, note, session_date, stream_timecode, recording_timecode) VALUES (?, ?, ?, ?, ?)'
  ).run(tag, note || null, sessionDate, stream_timecode, recording_timecode);

  const clip = getDb().prepare('SELECT * FROM clips WHERE id = ?').get(result.lastInsertRowid) as {
    id: number; tag: string; note: string | null; session_date: string;
    stream_timecode: string | null; recording_timecode: string | null; created_at: string;
  };
  broadcast('clip-created', clip);

  // Auto-sync to Notion (fire and forget)
  syncClipToNotion(clip).catch(() => {});

  res.status(201).json(clip);
});
```

- [ ] **Step 3: Verify typecheck passes**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/server/api/clips.ts
git commit -m "feat: capture OBS timecodes when creating clips"
```

---

### Task 5: Update DaVinci Export to Use Real Timecodes

**Files:**
- Modify: `src/server/api/clips.ts:34-61` (export route)

- [ ] **Step 1: Update the export route**

In `src/server/api/clips.ts`, replace the export route (the `router.get('/export', ...)` handler):

```ts
// GET export as DaVinci Resolve CSV — MUST be before /:id routes
router.get('/export', (req, res) => {
  let sessionDate = req.query.session_date as string;
  if (sessionDate === 'today') sessionDate = new Date().toISOString().split('T')[0];
  if (!sessionDate) { res.status(400).json({ error: 'session_date required' }); return; }

  const clips = getDb().prepare(
    'SELECT * FROM clips WHERE session_date = ? ORDER BY created_at ASC'
  ).all(sessionDate) as Array<{
    tag: string; note: string | null; created_at: string;
    stream_timecode: string | null; recording_timecode: string | null;
  }>;

  if (clips.length === 0) { res.status(404).json({ error: 'No clips for this date' }); return; }

  const firstClipTime = new Date(clips[0].created_at + 'Z').getTime();

  const csvRows = ['Name,Start,End,Note'];
  for (const clip of clips) {
    let timecode: string;
    if (clip.stream_timecode) {
      timecode = clip.stream_timecode + ':00';
    } else if (clip.recording_timecode) {
      timecode = clip.recording_timecode + ':00';
    } else {
      const clipTime = new Date(clip.created_at + 'Z').getTime();
      const offsetSeconds = Math.floor((clipTime - firstClipTime) / 1000);
      timecode = formatTimecode(offsetSeconds);
    }
    const name = clip.tag;
    const note = (clip.note || '').replace(/,/g, ';').replace(/"/g, "'");
    csvRows.push(`${name},${timecode},${timecode},${note}`);
  }

  const csv = csvRows.join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="clips-${sessionDate}.csv"`);
  res.send(csv);
});
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/server/api/clips.ts
git commit -m "feat: use real OBS timecodes in DaVinci export"
```

---

### Task 6: UI Timecode Display in ClipsPanel

**Files:**
- Modify: `src/renderer/src/panels/ClipsPanel.tsx:198-204`

- [ ] **Step 1: Add timecode display helper**

In `src/renderer/src/panels/ClipsPanel.tsx`, add a helper function inside the component, after the `filterClips` declaration (before the `return`):

```ts
  const formatClipTime = (clip: Clip) => {
    const wallClock = new Date(clip.created_at + 'Z').toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const parts: string[] = [];
    if (clip.stream_timecode) parts.push(`🔴 ${clip.stream_timecode}`);
    if (clip.recording_timecode) parts.push(`⏺ ${clip.recording_timecode}`);
    if (parts.length > 0) return `${parts.join(' ')} | ${wallClock}`;
    return wallClock;
  };
```

- [ ] **Step 2: Update clip item rendering**

In `src/renderer/src/panels/ClipsPanel.tsx`, replace the clip-time span in the clip-item rendering (the line with `clip-time` class):

```tsx
<span className="clip-time">{formatClipTime(clip)}</span>
```

This replaces the existing:
```tsx
<span className="clip-time">{new Date(clip.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
```

- [ ] **Step 3: Verify typecheck passes**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Start dev server and verify visually**

Run: `npm run dev`

Test cases:
1. Create a clip without OBS connected — should show only wall-clock time (e.g. `14:23:45`)
2. Connect OBS, start streaming, create a clip — should show `🔴 1:23:45 | 14:23:45`
3. Start recording (no stream), create a clip — should show `⏺ 0:05:12 | 14:23:45`
4. Stream + recording, create a clip — should show `🔴 1:23:45 ⏺ 0:05:12 | 14:23:45`
5. DaVinci export — download CSV, verify timecodes match OBS times

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/panels/ClipsPanel.tsx
git commit -m "feat: display stream/recording timecodes in ClipsPanel"
```

---

### Task 7: Update stream-state PATCH route for is_recording

**Files:**
- Modify: `src/server/api/stream-state.ts:14-39`

- [ ] **Step 1: Add is_recording to the PATCH handler**

In `src/server/api/stream-state.ts`, update the PATCH route to also accept `is_recording`. Replace the destructuring and field-building section:

```ts
router.patch('/', (req, res) => {
  const { experiment_title, experiment_status, timer_seconds, timer_running, is_live, is_recording } = req.body;
  const db = getDb();

  if (!validateEnum(experiment_status, VALID_EXPERIMENT_STATUS, 'experiment_status', res)) return;

  const fields: string[] = [];
  const values: unknown[] = [];

  if (experiment_title !== undefined) { fields.push('experiment_title = ?'); values.push(experiment_title); }
  if (experiment_status !== undefined) { fields.push('experiment_status = ?'); values.push(experiment_status); }
  if (timer_seconds !== undefined) { fields.push('timer_seconds = ?'); values.push(timer_seconds); }
  if (timer_running !== undefined) { fields.push('timer_running = ?'); values.push(timer_running); }
  if (is_live !== undefined) { fields.push('is_live = ?'); values.push(is_live); }
  if (is_recording !== undefined) { fields.push('is_recording = ?'); values.push(is_recording); }

  if (fields.length === 0) {
    res.status(400).json({ error: 'No fields to update' });
    return;
  }

  db.prepare(`UPDATE stream_state SET ${fields.join(', ')} WHERE id = 1`).run(...values);
  const state = db.prepare('SELECT * FROM stream_state WHERE id = 1').get();

  broadcast('stream-state', state);
  res.json(state);
});
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/server/api/stream-state.ts
git commit -m "feat: support is_recording in stream-state PATCH route"
```

---

### Task 8: Fix UTC Timezone for All Timestamp Displays

SQLite's `CURRENT_TIMESTAMP` stores UTC. JavaScript's `new Date('2024-01-15 05:49:44')` without a timezone marker treats it ambiguously. Appending `'Z'` marks it as UTC so `toLocaleTimeString()` / `toLocaleDateString()` correctly converts to the user's local timezone.

**Files:**
- Modify: `src/server/api/clips.ts:45,49` (export fallback — already fixed in Task 5)
- Modify: `src/server/api/notion-sync.ts:34`
- Modify: `src/renderer/src/panels/MilestonesPanel.tsx:75`
- Modify: `src/renderer/src/panels/ClipsPanel.tsx` (already fixed in Task 6)

- [ ] **Step 1: Fix notion-sync.ts**

In `src/server/api/notion-sync.ts`, change line 34:

```ts
  const time = new Date(clip.created_at + 'Z').toLocaleTimeString('de-DE', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
```

- [ ] **Step 2: Fix MilestonesPanel.tsx**

In `src/renderer/src/panels/MilestonesPanel.tsx`, change line 75:

```tsx
{ms.completed_at ? new Date(ms.completed_at + 'Z').toLocaleDateString('de-DE') : ''}
```

- [ ] **Step 3: Verify typecheck passes**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/server/api/notion-sync.ts src/renderer/src/panels/MilestonesPanel.tsx
git commit -m "fix: append Z to UTC timestamps for correct local timezone display"
```

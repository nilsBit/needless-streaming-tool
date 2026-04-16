# Terminology Rename Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename dev-specific terminology (experiment→challenge, bug→issue, bug_roulette→roulette) so the tool appeals to coding, art, coworking, and game dev streamers equally.

**Architecture:** Pure mechanical rename across all layers: DB schema + migration, shared types, API routes, bot commands, hotkeys, overlays, renderer panels, CSS, translations, and docs. No logic changes.

**Tech Stack:** TypeScript, SQLite (better-sqlite3), React, Express, tmi.js, HTML overlays

**Spec:** `docs/superpowers/specs/2026-04-16-terminology-rename-design.md`

---

### Task 1: Database Schema & Migration

**Files:**
- Modify: `src/server/db/schema.ts:1-97`
- Modify: `src/server/db/index.ts:39-68`

- [ ] **Step 1: Update SCHEMA DDL for fresh installs**

In `src/server/db/schema.ts`, change:
- `SCHEMA_VERSION = 6` → `SCHEMA_VERSION = 7`
- Table `bugs` → `issues` (lines 18-24)
- `experiment_title` → `challenge_title` (line 46)
- `experiment_status` → `challenge_status` (line 47)

```ts
export const SCHEMA_VERSION = 7;
```

In the SCHEMA string:
```sql
CREATE TABLE IF NOT EXISTS issues (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  description TEXT,
  status      TEXT DEFAULT 'open',
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

```sql
CREATE TABLE IF NOT EXISTS stream_state (
  id                INTEGER PRIMARY KEY DEFAULT 1,
  challenge_title   TEXT,
  challenge_status  TEXT DEFAULT 'idle',
  timer_seconds     INTEGER DEFAULT 0,
  timer_running     INTEGER DEFAULT 0,
  is_live           INTEGER DEFAULT 0,
  is_recording      INTEGER DEFAULT 0,
  project_name      TEXT
);
```

- [ ] **Step 2: Add migration in `runMigrations`**

In `src/server/db/index.ts`, add after the `from < 6` block:

```ts
if (from < 7) {
  // Rename bugs → issues
  try {
    db.prepare('SELECT 1 FROM bugs LIMIT 1').get();
    db.exec('ALTER TABLE bugs RENAME TO issues');
    console.log('[DB] Migrated: renamed bugs → issues');
  } catch {}
  // Rename experiment_* → challenge_* in stream_state
  try {
    db.prepare('SELECT experiment_title FROM stream_state LIMIT 1').get();
    db.exec('ALTER TABLE stream_state RENAME COLUMN experiment_title TO challenge_title');
    db.exec('ALTER TABLE stream_state RENAME COLUMN experiment_status TO challenge_status');
    console.log('[DB] Migrated: renamed experiment_* → challenge_* in stream_state');
  } catch {}
}
```

- [ ] **Step 3: Verify typecheck passes**

Run: `npm run typecheck`
Expected: Errors about `experiment_*` and `Bug` references (expected — types not yet updated)

- [ ] **Step 4: Commit**

```bash
git add src/server/db/schema.ts src/server/db/index.ts
git commit -m "refactor: rename DB schema (bugs→issues, experiment→challenge)"
```

---

### Task 2: Shared Types

**Files:**
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Rename all types and constants**

Changes in `src/shared/types.ts`:

```ts
// StreamState interface (lines 5-6):
  challenge_title: string | null;
  challenge_status: 'idle' | 'in_progress' | 'done' | 'failed';

// Interface Bug → Issue (lines 14-20):
export interface Issue {
  id: number;
  title: string;
  description: string | null;
  status: 'open' | 'fixed' | 'wontfix';
  created_at: string;
}

// Stats interface (lines 107-108):
  total_issues: number;
  open_issues: number;

// Constants (lines 142, 145):
export const VALID_ISSUE_STATUS = ['open', 'fixed', 'wontfix'] as const;
export const VALID_CHALLENGE_STATUS = ['idle', 'in_progress', 'done', 'failed'] as const;
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/types.ts
git commit -m "refactor: rename shared types (Bug→Issue, experiment→challenge)"
```

---

### Task 3: API Router — issues (formerly bugs)

**Files:**
- Create: `src/server/api/issues.ts` (copy from `src/server/api/bugs.ts`)
- Delete: `src/server/api/bugs.ts`

- [ ] **Step 1: Create `issues.ts` from `bugs.ts`**

Create `src/server/api/issues.ts` with all `bug` → `issue`, `bugs` → `issues`, `VALID_BUG_STATUS` → `VALID_ISSUE_STATUS`, WebSocket events `bug-created` → `issue-created` etc.:

```ts
import { Router } from 'express';
import { getDb } from '../db/index';
import { broadcast } from '../websocket/index';
import { VALID_ISSUE_STATUS } from '../../shared/types';
import { validateEnum, requireRow } from './validate';

const router = Router();

router.get('/', (_req, res) => {
  const issues = getDb().prepare('SELECT * FROM issues ORDER BY created_at DESC').all();
  res.json(issues);
});

router.post('/', (req, res) => {
  const { title, description } = req.body;
  if (!title) { res.status(400).json({ error: 'title required' }); return; }

  const result = getDb().prepare('INSERT INTO issues (title, description) VALUES (?, ?)').run(title, description || null);
  const issue = getDb().prepare('SELECT * FROM issues WHERE id = ?').get(result.lastInsertRowid);

  broadcast('issue-created', issue);
  res.status(201).json(issue);
});

router.patch('/:id', (req, res) => {
  const { title, description, status } = req.body;
  const db = getDb();

  if (!validateEnum(status, VALID_ISSUE_STATUS, 'status', res)) return;

  const existing = db.prepare('SELECT * FROM issues WHERE id = ?').get(req.params.id);
  if (!requireRow(existing, res)) return;

  const fields: string[] = [];
  const values: unknown[] = [];

  if (title !== undefined) { fields.push('title = ?'); values.push(title); }
  if (description !== undefined) { fields.push('description = ?'); values.push(description); }
  if (status !== undefined) { fields.push('status = ?'); values.push(status); }

  if (fields.length === 0) { res.status(400).json({ error: 'No fields to update' }); return; }

  values.push(req.params.id);
  db.prepare(`UPDATE issues SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  const issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(req.params.id);

  broadcast('issue-updated', issue);
  res.json(issue);
});

router.delete('/:id', (req, res) => {
  const existing = getDb().prepare('SELECT * FROM issues WHERE id = ?').get(req.params.id);
  if (!requireRow(existing, res)) return;

  getDb().prepare('DELETE FROM issues WHERE id = ?').run(req.params.id);
  broadcast('issue-deleted', { id: Number(req.params.id) });
  res.status(204).send();
});

export default router;
```

- [ ] **Step 2: Delete `bugs.ts`**

```bash
rm src/server/api/bugs.ts
```

- [ ] **Step 3: Commit**

```bash
git add src/server/api/issues.ts
git add -u src/server/api/bugs.ts
git commit -m "refactor: rename API router bugs→issues"
```

---

### Task 4: Server index.ts — imports & routes

**Files:**
- Modify: `src/server/index.ts:8,93,120-123`

- [ ] **Step 1: Update import and routes**

```ts
// Line 8: import
import issuesRouter from './api/issues';

// Line 93: route
app.use('/api/issues', issuesRouter);

// Lines 120-123: public endpoint
app.get('/public/issues', (_req, res) => {
  const issues = getDb().prepare('SELECT * FROM issues ORDER BY created_at DESC').all();
  res.json(issues);
});
```

- [ ] **Step 2: Commit**

```bash
git add src/server/index.ts
git commit -m "refactor: update server routes bugs→issues"
```

---

### Task 5: API — stream-state.ts

**Files:**
- Modify: `src/server/api/stream-state.ts`

- [ ] **Step 1: Rename experiment→challenge**

```ts
import { VALID_CHALLENGE_STATUS } from '../../shared/types';

// In PATCH handler:
const { challenge_title, challenge_status, timer_seconds, timer_running, is_live, is_recording } = req.body;

if (!validateEnum(challenge_status, VALID_CHALLENGE_STATUS, 'challenge_status', res)) return;

if (challenge_title !== undefined) { fields.push('challenge_title = ?'); values.push(challenge_title); }
if (challenge_status !== undefined) { fields.push('challenge_status = ?'); values.push(challenge_status); }
```

- [ ] **Step 2: Commit**

```bash
git add src/server/api/stream-state.ts
git commit -m "refactor: rename stream-state API experiment→challenge"
```

---

### Task 6: API — actions.ts

**Files:**
- Modify: `src/server/api/actions.ts:25,36,38-39,43,48,52,82-83,88`

- [ ] **Step 1: Rename all bug references**

In the POST `/roulette` handler and `triggerRoulette` function, rename:
- Comment: `// POST roulette spin`
- `bugs` variable → `issues`
- `'No open bugs'` → `'No open issues'`
- Broadcast payload: `{ bugs, winner_id }` → `{ issues, winner_id }`
- Response: `bugs_count` → `issues_count`

```ts
// POST roulette spin
router.post('/roulette', (_req, res) => {
  // ... cooldown check stays same ...

  const issues = getDb().prepare('SELECT * FROM issues WHERE status = ?').all('open') as Array<{ id: number; title: string }>;

  if (issues.length === 0) {
    res.status(400).json({ error: 'No open issues' });
    return;
  }

  const winner = issues[Math.floor(Math.random() * issues.length)];
  rouletteCooldownUntil = now + ROULETTE_COOLDOWN_MS;

  broadcast('roulette-spin', { issues, winner_id: winner.id });
  broadcast('roulette-result', { title: winner.title, id: winner.id });
  broadcast('roulette-cooldown', { remaining_seconds: 60 });

  res.json({ winner, issues_count: issues.length, cooldown_seconds: 60 });
});
```

Same renames for `triggerRoulette()`:
```ts
export function triggerRoulette(): { winner: { id: number; title: string } } | { error: string } {
  // ... cooldown check ...
  const issues = getDb().prepare('SELECT * FROM issues WHERE status = ?').all('open') as Array<{ id: number; title: string }>;
  if (issues.length === 0) return { error: 'No open issues' };

  const winner = issues[Math.floor(Math.random() * issues.length)];
  rouletteCooldownUntil = now + ROULETTE_COOLDOWN_MS;

  broadcast('roulette-spin', { issues, winner_id: winner.id });
  broadcast('roulette-result', { title: winner.title, id: winner.id });
  broadcast('roulette-cooldown', { remaining_seconds: 60 });

  return { winner };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/server/api/actions.ts
git commit -m "refactor: rename actions API bugs→issues"
```

---

### Task 7: API — stats.ts, backup.ts, clip-tags.ts

**Files:**
- Modify: `src/server/api/stats.ts:14-15`
- Modify: `src/server/api/backup.ts:10`
- Modify: `src/server/api/clip-tags.ts:12`

- [ ] **Step 1: Update stats.ts**

```sql
(SELECT COUNT(*) FROM issues) AS total_issues,
(SELECT COUNT(*) FROM issues WHERE status = 'open') AS open_issues,
```

- [ ] **Step 2: Update backup.ts**

Change TABLES array entry `'bugs'` → `'issues'`.

Add backward-compatible import shim after `const data = req.body`:
```ts
// Backward compatibility: old backups have 'bugs' key
if (data['bugs'] && !data['issues']) {
  data['issues'] = data['bugs'];
  delete data['bugs'];
}
```

- [ ] **Step 3: Update clip-tags.ts**

```ts
{ tag: 'issue', emoji: '⚠️', preset: true },
```

- [ ] **Step 4: Commit**

```bash
git add src/server/api/stats.ts src/server/api/backup.ts src/server/api/clip-tags.ts
git commit -m "refactor: rename stats/backup/clip-tags bugs→issues"
```

---

### Task 8: Bot commands & EventSub

**Files:**
- Modify: `src/server/bot/commands.ts:4,19-36`
- Modify: `src/server/bot/eventsub.ts:76,88-89`

- [ ] **Step 1: Update commands.ts**

Import: `Bug` → `Issue`

```ts
import { StreamState, Issue, Todo } from '../../shared/types';
```

Rename `!experiment` case (keep both aliases):
```ts
case '!challenge':
case '!experiment': {
  const state = getDb().prepare('SELECT * FROM stream_state WHERE id = 1').get() as StreamState;
  if (!state.challenge_title) {
    client.say(channel, 'Keine Challenge aktiv.');
  } else {
    const statusEmoji = state.challenge_status === 'in_progress' ? '🔴' : state.challenge_status === 'done' ? '🟢' : state.challenge_status === 'failed' ? '❌' : '⏸️';
    client.say(channel, `${statusEmoji} Challenge: ${state.challenge_title} [${state.challenge_status}]`);
  }
  break;
}
```

Rename `!bugs` case (keep alias):
```ts
case '!issues':
case '!bugs': {
  const issues = getDb().prepare('SELECT * FROM issues WHERE status = ? ORDER BY created_at DESC LIMIT 5').all('open') as Issue[];
  if (issues.length === 0) {
    client.say(channel, 'Keine offenen Issues! 🎉');
  } else {
    const list = issues.map((b, i) => `${i + 1}. ${b.title}`).join(' | ');
    client.say(channel, `⚠️ Offene Issues (${issues.length}): ${list}`);
  }
  break;
}
```

- [ ] **Step 2: Update eventsub.ts**

Line 76: `rewardType = 'roulette'`
Lines 88-89: check `rewardType === 'roulette'`

```ts
else if (titleLower.includes('roulette')) rewardType = 'roulette';
```

```ts
// Auto-trigger roulette when someone redeems roulette
if (rewardType === 'roulette') {
  triggerRoulette();
}
```

- [ ] **Step 3: Commit**

```bash
git add src/server/bot/commands.ts src/server/bot/eventsub.ts
git commit -m "refactor: rename bot commands/eventsub (bug→issue, experiment→challenge)"
```

---

### Task 9: Hotkeys

**Files:**
- Modify: `src/main/hotkeys.ts:55-67`

- [ ] **Step 1: Rename experiment references**

```ts
// Ctrl+Shift+E — Challenge toggle
globalShortcut.register(hotkeys.challenge_toggle, async () => {
  try {
    const state = await apiGet('/api/stream-state') as { challenge_status: string };
    if (state.challenge_status === 'in_progress') {
      apiCall('PATCH', '/api/stream-state', { challenge_status: 'idle', timer_running: 0 });
    } else {
      apiCall('PATCH', '/api/stream-state', { challenge_status: 'in_progress' });
    }
  } catch (err) {
    console.error('[Hotkey] Challenge toggle failed:', err);
  }
  console.log(`[Hotkey] ${hotkeys.challenge_toggle} — Challenge toggle`);
});
```

Line 89: `challenge_status: 'done'`
Line 95: `challenge_status: 'failed'`

- [ ] **Step 2: Commit**

```bash
git add src/main/hotkeys.ts
git commit -m "refactor: rename hotkeys experiment→challenge"
```

---

### Task 10: Overlays

**Files:**
- Modify: `src/overlays/experiment/index.html` (lines 175, 182-184)
- Modify: `src/overlays/roulette/index.html` (lines 253, 291-314, 326, 392, 447)
- Modify: `src/overlays/alerts/index.html` (line 153)
- Modify: `src/overlays/_template/index.html` (lines 28-29, 50-51)

- [ ] **Step 1: Update experiment overlay**

Replace all `experiment_title` → `challenge_title`, `experiment_status` → `challenge_status`:
```js
if (!state.challenge_title || state.challenge_status === 'idle') {
```
```js
titleEl.textContent = state.challenge_title;
statusLabel.textContent = statusMap[state.challenge_status] || state.challenge_status;
dot.className = 'status-dot ' + state.challenge_status;
```

- [ ] **Step 2: Update roulette overlay**

All changes in `src/overlays/roulette/index.html`:
```js
// Dynamic segments from issues API — NFS Unbound neon palette
```
```js
async function loadIssues() {
  try {
    const res = await fetch('http://localhost:4000/public/issues');
    const issues = await res.json();
    const openIssues = issues.filter(b => b.status === 'open');

    if (openIssues.length === 0) {
      SEGMENTS = [{ id: 0, label: "KEINE ISSUES", bg: "#1a1a1a", txt: "#444", title: "Keine offenen Issues" }];
    } else {
      SEGMENTS = openIssues.map((issue, i) => {
        const style = PALETTE[i % PALETTE.length];
        const label = issue.title.length > 12 ? issue.title.substring(0, 11) + '…' : issue.title;
        return { id: issue.id, label, bg: style.bg, txt: style.txt, title: issue.title };
      });
    }
    // ... rest stays same ...
  } catch (err) {
    console.error('[Roulette] Failed to load issues:', err);
  }
}
```

WebSocket events:
```js
if (msg.event === 'issue-created' || msg.event === 'issue-updated' || msg.event === 'issue-deleted') {
  if (!spinning) loadIssues();
}
```

Counter text (line 392):
```js
document.getElementById('totalPts').textContent = N + ' ISSUES';
```

Result text (line 447):
```js
sub.textContent = 'ALS NÄCHSTES DRAN';
```

Update all calls from `loadBugs()` → `loadIssues()`.

- [ ] **Step 3: Update alerts overlay**

```js
const REWARD_LABELS = {
  spawn_enemys: '💥 Spawn 50 Enemys!',
  name_enemy: '📛 Enemy benennen!',
  roulette: '🎰 Glücksrad!',
  feature_request: '💡 Feature Request!',
  change_music: '🎵 Musik wechseln!',
};
```

- [ ] **Step 4: Update template overlay**

```
│ issue-created / issue-updated  │ Issue hinzugefügt/geändert          │
│ issue-deleted                  │ Issue gelöscht                      │
```
```
- GET /public/stream-state   → { challenge_title, challenge_status, ... }
- GET /public/issues         → [ { id, title, status, ... }, ... ]
```

- [ ] **Step 5: Commit**

```bash
git add src/overlays/
git commit -m "refactor: rename overlays (bug→issue, experiment→challenge)"
```

---

### Task 11: Renderer — Panel files

**Files:**
- Create: `src/renderer/src/panels/IssuesPanel.tsx` (from BugsPanel.tsx)
- Delete: `src/renderer/src/panels/BugsPanel.tsx`
- Create: `src/renderer/src/panels/ChallengePanel.tsx` (from ExperimentPanel.tsx)
- Delete: `src/renderer/src/panels/ExperimentPanel.tsx`
- Modify: `src/renderer/src/panels/StatsPanel.tsx`
- Modify: `src/renderer/src/panels/ClipsPanel.tsx`
- Modify: `src/renderer/src/panels/RewardsPanel.tsx`

- [ ] **Step 1: Create IssuesPanel.tsx**

Rename from BugsPanel: `Bug` → `Issue`, `/bugs` → `/issues`, `bug-created/updated/deleted` → `issue-created/updated/deleted`, `newBug` → `newIssue`, `addBug` → `addIssue`, `fixBug` → `fixIssue`, `deleteBug` → `deleteIssue`, `openBugs` → `openIssues`, `fixedBugs` → `fixedIssues`, `selectedBug` → `selectedIssue`, CSS classes `bugs-panel` → `issues-panel`, `bug-input` → `issue-input`, `bug-list` → `issue-list`, `bug-item` → `issue-item`, `bug-actions` → `issue-actions`.

User-facing strings:
- `'Neuer Bug...'` → `'Neues Issue...'`
- `'Bugs sammeln, Rad drehen, Chat entscheidet was gefixt wird.'` → `'Issues sammeln, Rad drehen, Chat entscheidet was dran kommt.'`
- Emoji `🐛` → `🎯`
- ChatCommands: `{ cmd: '!issues', desc: 'Zeigt offene Issues' }`

- [ ] **Step 2: Create ChallengePanel.tsx**

Rename from ExperimentPanel: all `experiment_title` → `challenge_title`, `experiment_status` → `challenge_status`, `startExperiment` → `startChallenge`, `finishExperiment` → `finishChallenge`, `cancelExperiment` → `cancelChallenge`, CSS classes `experiment-*` → `challenge-*`.

ChatCommands: `{ cmd: '!challenge', desc: 'Zeigt aktuelle Challenge + Status' }`

- [ ] **Step 3: Delete old files**

```bash
rm src/renderer/src/panels/BugsPanel.tsx src/renderer/src/panels/ExperimentPanel.tsx
```

- [ ] **Step 4: Update StatsPanel.tsx**

```ts
{ icon: '⚠️', value: stats.total_issues, label: 'Issues gesamt' },
{ icon: '🔴', value: stats.open_issues, label: 'Offene Issues' },
```

- [ ] **Step 5: Update ClipsPanel.tsx**

```ts
const PRESET_TAGS = ['highlight', 'fail', 'funny', 'tutorial', 'issue'];

const TAG_EMOJI: Record<string, string> = {
  highlight: '⭐',
  fail: '💀',
  funny: '😂',
  tutorial: '📚',
  issue: '⚠️',
};
```

- [ ] **Step 6: Update RewardsPanel.tsx**

```ts
const REWARD_LABELS: Record<string, string> = {
  spawn_enemys: '💥 Spawn 50 Enemys',
  name_enemy: '📛 Enemy benennen',
  roulette: '🎰 Glücksrad',
  feature_request: '💡 Feature Request',
  change_music: '🎵 Musik wechseln',
};
```

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/panels/
git commit -m "refactor: rename renderer panels (Bug→Issue, Experiment→Challenge)"
```

---

### Task 12: App.tsx & Onboarding

**Files:**
- Modify: `src/renderer/src/App.tsx:5-6,25-26`
- Modify: `src/renderer/src/components/onboarding/WelcomeStep.tsx:10`
- Modify: `src/renderer/src/components/onboarding/StreamDeckStep.tsx:34-35`

- [ ] **Step 1: Update App.tsx imports and panel config**

```tsx
import ChallengePanel from './panels/ChallengePanel';
import IssuesPanel from './panels/IssuesPanel';
```

```tsx
{ key: 'challenge', label: 'Challenge', component: ChallengePanel },
{ key: 'issues', label: 'Glücksrad', component: IssuesPanel },
```

- [ ] **Step 2: Update WelcomeStep.tsx**

```tsx
— Overlays, Challenges, Issues, Clips, Milestones und mehr.
```

- [ ] **Step 3: Update StreamDeckStep.tsx**

```tsx
Clips, Issues, Challenges und mehr direkt auf dein Deck legen.
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/App.tsx src/renderer/src/components/onboarding/
git commit -m "refactor: rename App.tsx and onboarding (Bug→Issue)"
```

---

### Task 13: CSS

**Files:**
- Modify: `src/renderer/src/index.css:274-330`

- [ ] **Step 1: Rename CSS classes**

```css
/* Challenge Panel */
.challenge-input { display: flex; gap: 8px; flex-wrap: wrap; }
.challenge-input input { flex: 1; min-width: 120px; }

.challenge-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  background: #0d0d0d;
  border-radius: 4px;
}

.challenge-title { font-weight: 600; font-size: 14px; }
.challenge-state { color: #888; font-size: 13px; margin-left: auto; text-transform: uppercase; }

/* ... timer stays same ... */

.challenge-actions { display: flex; gap: 8px; flex-wrap: wrap; }

/* Issues Panel */
.issue-input { display: flex; gap: 8px; }
.issue-input input { flex: 1; }

/* ... roulette button stays same ... */

.issue-list { display: flex; flex-direction: column; gap: 6px; }

.issue-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  background: #0d0d0d;
  border-radius: 4px;
  font-size: 14px;
}

.issue-item.fixed { opacity: 0.5; text-decoration: line-through; }
.issue-actions { display: flex; gap: 4px; }
.issue-actions button { padding: 4px 8px; font-size: 12px; }
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/index.css
git commit -m "refactor: rename CSS classes (experiment→challenge, bug→issue)"
```

---

### Task 14: Translations

**Files:**
- Modify: `src/renderer/src/i18n/translations.ts`

- [ ] **Step 1: Update translation keys**

```ts
'panel.challenge': { de: 'Challenge', en: 'Challenge' },
'panel.issues': { de: 'Glücksrad', en: 'Glücksrad' },
```

```ts
'onboarding.welcome_text': { de: 'Dein Stream Toolkit für Streaming. Hier steuerst du alles — Overlays, Challenges, Issues, Clips, Milestones und mehr.', en: 'Your Stream Toolkit for Streaming. Control everything here — overlays, challenges, issues, clips, milestones and more.' },
```

```ts
'streamdeck.desc': { de: 'Mit dem Stream Deck Plugin kannst du Buttons für Szenen-Wechsel, Clips, Issues, Challenges und mehr direkt auf dein Deck legen.', en: 'With the Stream Deck plugin you can put buttons for scene switching, clips, issues, challenges and more directly on your deck.' },
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/i18n/translations.ts
git commit -m "refactor: rename translations (Bug→Issue, experiment→challenge)"
```

---

### Task 15: Help Documentation

**Files:**
- Modify: `src/renderer/src/docs/help.ts`

- [ ] **Step 1: Update all references**

Key changes in help.ts:
- "Erste Schritte": `Bugs` → `Issues`
- Chat commands table: `!bugs` → `!issues`, row text updated
- Channel Points: `bug_roulette` references removed
- Overlays table: `Experiment` → `Challenge` (description stays "Challenge-Status")
- Dashboard Panels: `Glücksrad — Tracke Items` (already generic enough, but update "Bug Report" references)
- API Reference: `/api/bugs` → `/api/issues`, `/public/bugs` → `/public/issues`
- WebSocket Events: `bug-created / bug-updated / bug-deleted` → `issue-created / issue-updated / issue-deleted`
- Stream Deck: `Bug Report` → `Issue Report`, `Offene Bug-Anzahl` → `Offene Issue-Anzahl`

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/docs/help.ts
git commit -m "refactor: rename help docs (Bug→Issue, Experiment→Challenge)"
```

---

### Task 16: Typecheck & Verify

- [ ] **Step 1: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: No errors (or only pre-existing ones)

- [ ] **Step 3: Search for leftover references**

Run: `grep -r "experiment_title\|experiment_status\|VALID_BUG\|VALID_EXPERIMENT\|bug-created\|bug-updated\|bug-deleted\|bug_roulette\|'bugs'" src/ --include="*.ts" --include="*.tsx" --include="*.html" -l`

Expected: No results (except possibly the `!bugs` alias in commands.ts which is intentional)

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "refactor: fix remaining terminology references"
```

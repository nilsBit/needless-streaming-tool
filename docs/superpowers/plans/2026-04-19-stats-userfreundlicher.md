# Stats Userfreundlicher — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `StatsPanel` to show grouped, contextualized stats in three sections (Heute / Fortschritt / Gesamt & Trend) with live updates, progress bars, sparklines, and delta pills.

**Architecture:** Backend returns a nested response shape with today's counts + deltas, compound progress pairs, all-time totals, and 14-day trend arrays. Renderer consumes that, splits into three card grids, and listens to existing entity WebSocket events for throttled refetch — no new broadcast event needed.

**Tech Stack:** TypeScript, React, Express, better-sqlite3, ws. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-04-19-stats-userfreundlicher-design.md`

**Testing note:** This project has no automated test suite. Each task ends with manual verification steps in the dev server (`npm run dev`) and a commit.

---

## File Structure

**Modify:**
- `src/shared/types.ts` — replace flat `Stats` interface with nested shape
- `src/server/api/stats.ts` — rewrite aggregation query
- `src/renderer/src/panels/StatsPanel.tsx` — full rewrite
- `src/renderer/src/i18n/translations.ts` — new keys, remove old
- `src/renderer/src/index.css` — add stats section styles

**Create:**
- `src/renderer/src/components/Sparkline.tsx` — inline SVG sparkline
- `src/renderer/src/components/DeltaPill.tsx` — up/down/flat pill
- `src/renderer/src/components/ProgressBar.tsx` — horizontal bar with optional inverted coloring

---

## Task 1: Update shared `Stats` type

**Files:**
- Modify: `src/shared/types.ts:107-118`

- [x] **Step 1: Replace the `Stats` interface** _(done in commit `7ceac2c`)_

Replace lines 107–118 (the current flat `Stats` interface) with:

```ts
export interface Stats {
  today: {
    clips: number;
    delta_clips: number;
    todos_done: number;
    delta_todos: number;
    new_issues: number;
    delta_issues: number;
    milestones: number;
    delta_milestones: number;
  };
  progress: {
    todos:      { done: number; total: number };
    milestones: { completed: number; total: number };
    issues:     { open: number; total: number };
  };
  totals: {
    clips: number;
    raids: number;
    rewards: number;
    active_days_30d: number;
  };
  trends: {
    clips:   number[]; // 14 entries, oldest first
    raids:   number[];
    rewards: number[];
    active:  number[]; // 1 if day had ≥1 clip, else 0
  };
}
```

- [x] **Step 2: Verify typecheck fails** _(confirmed — only `StatsPanel.tsx` errored)_

Run: `npm run typecheck`
Expected: Errors in `StatsPanel.tsx` (old field names) and `src/server/api/stats.ts` (return shape) — this is expected, we fix them in later tasks.

- [x] **Step 3: Commit** _(commit `7ceac2c`)_

```bash
git add src/shared/types.ts
git commit -m "refactor(stats): restructure Stats type to nested shape"
```

---

> **Resume marker:** Tasks 1 is complete (commit `7ceac2c`). Spec-review and code-quality-review were NOT yet run against Task 1 — optional to run retroactively (it's a mechanical one-interface change), or skip and proceed to Task 2.

---

## Task 2: Rewrite `stats.ts` API to return new shape

**Files:**
- Modify: `src/server/api/stats.ts` (full replacement)

The backend needs to compute: today's counts + deltas, progress pairs, all-time totals, and 14-day trend arrays with missing-day zero-fill.

- [ ] **Step 1: Replace file contents**

Replace the entire file with:

```ts
import { Router } from 'express';
import { getDb } from '../db/index';
import type { Stats } from '../../shared/types';

const router = Router();

function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// Count per day over the last 14 days, oldest first.
// Pass the expression that evaluates to a 'YYYY-MM-DD' string for each row
// (e.g. "strftime('%Y-%m-%d', created_at)" or "session_date").
function trendCounts(table: string, dayExpr: string): number[] {
  const db = getDb();
  const since = daysAgoStr(13); // inclusive — today + 13 prior = 14
  const rows = db.prepare(
    `SELECT ${dayExpr} AS day, COUNT(*) AS n
       FROM ${table}
       WHERE ${dayExpr} >= ?
       GROUP BY day`
  ).all(since) as Array<{ day: string; n: number }>;

  const byDay = new Map(rows.map(r => [r.day, r.n]));
  const out: number[] = [];
  for (let i = 13; i >= 0; i--) {
    out.push(byDay.get(daysAgoStr(i)) ?? 0);
  }
  return out;
}

router.get('/', (_req, res) => {
  const db = getDb();
  const today = daysAgoStr(0);
  const yesterday = daysAgoStr(1);
  const sevenDaysAgo = daysAgoStr(6); // inclusive window of 7 days

  // Single query for counts + deltas where possible.
  const row = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM clips WHERE session_date = ?)                                     AS today_clips,
      (SELECT COUNT(*) FROM clips WHERE session_date = ?)                                     AS yday_clips,

      (SELECT COUNT(*) FROM todos WHERE done = 1 AND DATE(created_at) = ?)                    AS today_todos_done,
      (SELECT COUNT(*) FROM todos WHERE done = 1 AND DATE(created_at) >= ?
                                                   AND DATE(created_at) <= ?)                 AS week_todos_done,

      (SELECT COUNT(*) FROM issues WHERE DATE(created_at) = ?)                                AS today_issues,
      (SELECT COUNT(*) FROM issues WHERE DATE(created_at) = ?)                                AS yday_issues,

      (SELECT COUNT(*) FROM milestones WHERE DATE(completed_at) = ?)                          AS today_milestones,
      (SELECT COUNT(*) FROM milestones WHERE DATE(completed_at) = ?)                          AS yday_milestones,

      (SELECT COUNT(*) FROM todos WHERE done = 1)                                             AS prog_todos_done,
      (SELECT COUNT(*) FROM todos)                                                            AS prog_todos_total,
      (SELECT COUNT(*) FROM milestones WHERE status = 'completed')                            AS prog_ms_done,
      (SELECT COUNT(*) FROM milestones)                                                       AS prog_ms_total,
      (SELECT COUNT(*) FROM issues WHERE status = 'open')                                     AS prog_issues_open,
      (SELECT COUNT(*) FROM issues)                                                           AS prog_issues_total,

      (SELECT COUNT(*) FROM clips)                                                            AS total_clips,
      (SELECT COUNT(*) FROM raids)                                                            AS total_raids,
      (SELECT COUNT(*) FROM rewards)                                                          AS total_rewards,
      (SELECT COUNT(DISTINCT session_date) FROM clips WHERE session_date >= ?)                AS active_days_30d
  `).get(
    today, yesterday,
    today, sevenDaysAgo, today,
    today, yesterday,
    today, yesterday,
    daysAgoStr(29)
  ) as Record<string, number>;

  // 7-day avg for todos (done-per-day, averaged over last 7 days including today)
  const weekTodosAvg = row.week_todos_done / 7;

  // Active trend: for each of last 14 days, 1 if ANY clip.session_date = day, else 0.
  // Compute via a DISTINCT session_date lookup.
  const activeDays = db.prepare(
    `SELECT DISTINCT session_date AS day FROM clips WHERE session_date >= ?`
  ).all(daysAgoStr(13)) as Array<{ day: string }>;
  const activeSet = new Set(activeDays.map(r => r.day));
  const activeTrend: number[] = [];
  for (let i = 13; i >= 0; i--) {
    activeTrend.push(activeSet.has(daysAgoStr(i)) ? 1 : 0);
  }

  const payload: Stats = {
    today: {
      clips: row.today_clips,
      delta_clips: row.today_clips - row.yday_clips,
      todos_done: row.today_todos_done,
      delta_todos: Math.round((row.today_todos_done - weekTodosAvg) * 10) / 10,
      new_issues: row.today_issues,
      delta_issues: row.today_issues - row.yday_issues,
      milestones: row.today_milestones,
      delta_milestones: row.today_milestones - row.yday_milestones,
    },
    progress: {
      todos:      { done: row.prog_todos_done, total: row.prog_todos_total },
      milestones: { completed: row.prog_ms_done, total: row.prog_ms_total },
      issues:     { open: row.prog_issues_open, total: row.prog_issues_total },
    },
    totals: {
      clips: row.total_clips,
      raids: row.total_raids,
      rewards: row.total_rewards,
      active_days_30d: row.active_days_30d,
    },
    trends: {
      clips:   trendCounts('clips',   'session_date'),
      raids:   trendCounts('raids',   "strftime('%Y-%m-%d', created_at)"),
      rewards: trendCounts('rewards', "strftime('%Y-%m-%d', created_at)"),
      active:  activeTrend,
    },
  };

  res.json(payload);
});

export default router;
```

- [ ] **Step 2: Start dev server and verify endpoint**

Run: `npm run dev` (or `rs` into the already-running nodemon to restart just main)

Then from another terminal:

```bash
curl -H "Authorization: Bearer $(cat data/api-token.txt 2>/dev/null || echo TOKEN)" http://localhost:4000/api/stats | jq
```

If the token file doesn't exist, grab the token from the `[Auth] Fixed API token:` log line printed on startup. Expected: JSON with `today`, `progress`, `totals`, `trends` keys; `trends.clips` is an array of 14 numbers.

- [ ] **Step 3: Typecheck passes on server**

Run: `npm run typecheck`
Expected: Errors only in `src/renderer/src/panels/StatsPanel.tsx` (still using old shape). Server file should compile clean.

- [ ] **Step 4: Commit**

```bash
git add src/server/api/stats.ts
git commit -m "feat(stats): rewrite /api/stats with today, progress, totals, trends"
```

---

## Task 3: Create `Sparkline` component

**Files:**
- Create: `src/renderer/src/components/Sparkline.tsx`

Tiny inline SVG. Takes `values: number[]` and `width`/`height`, renders a single stroked polyline. No fill, no axes, no tooltip — pure glyph.

- [ ] **Step 1: Create the file**

```tsx
import React from 'react';

interface Props {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  strokeWidth?: number;
}

export default function Sparkline({
  values,
  width = 80,
  height = 24,
  color = '#e67e22',
  strokeWidth = 2,
}: Props) {
  if (values.length < 2) {
    return <svg width={width} height={height} aria-hidden="true" />;
  }

  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;

  const pad = strokeWidth;
  const usableW = width - pad * 2;
  const usableH = height - pad * 2;

  const points = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * usableW;
    const y = pad + usableH - ((v - min) / range) * usableH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return (
    <svg width={width} height={height} aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
```

- [ ] **Step 2: Typecheck passes**

Run: `npm run typecheck`
Expected: no errors in `Sparkline.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/Sparkline.tsx
git commit -m "feat(stats): add Sparkline component"
```

---

## Task 4: Create `DeltaPill` component

**Files:**
- Create: `src/renderer/src/components/DeltaPill.tsx`

- [ ] **Step 1: Create the file**

```tsx
import React from 'react';

interface Props {
  value: number;
  suffix?: string;
}

export default function DeltaPill({ value, suffix }: Props) {
  let cls = 'delta-pill';
  let glyph = '•';
  let sign = '';
  if (value > 0)      { cls += ' up';   glyph = '▲'; sign = '+'; }
  else if (value < 0) { cls += ' down'; glyph = '▼'; sign = '−'; }
  else                { cls += ' flat'; glyph = '•'; }

  const display = value === 0 ? '0' : `${sign}${Math.abs(value)}`;

  return (
    <span className={cls} title={suffix}>
      {glyph} {display}
    </span>
  );
}
```

- [ ] **Step 2: Typecheck passes**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/DeltaPill.tsx
git commit -m "feat(stats): add DeltaPill component"
```

---

## Task 5: Create `ProgressBar` component

**Files:**
- Create: `src/renderer/src/components/ProgressBar.tsx`

- [ ] **Step 1: Create the file**

```tsx
import React from 'react';

interface Props {
  value: number;        // done count
  total: number;
  inverted?: boolean;   // true: value=open issues; color shifts green→red as ratio grows
}

export default function ProgressBar({ value, total, inverted = false }: Props) {
  const ratio = total > 0 ? value / total : 0;
  const pct = Math.round(ratio * 100);

  let color = '#e67e22';
  if (inverted) {
    // 0% open → green, 100% open → red
    if (ratio < 0.2)      color = '#2ecc71';
    else if (ratio < 0.5) color = '#f1c40f';
    else                  color = '#e74c3c';
  }

  return (
    <div className="progress-bar">
      <div
        className="progress-fill"
        style={{ width: `${Math.min(pct, 100)}%`, background: color }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck passes**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/ProgressBar.tsx
git commit -m "feat(stats): add ProgressBar component with inverted variant"
```

---

## Task 6: Update i18n translations

**Files:**
- Modify: `src/renderer/src/i18n/translations.ts:193-204`

- [ ] **Step 1: Replace the `stats.*` block**

Find the block starting at line 193 (`'stats.loading':`). Replace lines 193–204 with:

```ts
  'stats.loading': { de: 'Wird geladen...', en: 'Loading...' },
  'stats.desc':    { de: 'Überblick über alle Stream-Daten.', en: 'Overview of all stream data.' },

  'stats.section.today':    { de: 'Heute', en: 'Today' },
  'stats.section.progress': { de: 'Fortschritt', en: 'Progress' },
  'stats.section.totals':   { de: 'Gesamt & Trend', en: 'Totals & Trend' },

  'stats.today.clips':      { de: 'Clips heute', en: 'Clips today' },
  'stats.today.todos_done': { de: 'Todos erledigt', en: 'Todos done' },
  'stats.today.new_issues': { de: 'Neue Issues', en: 'New issues' },
  'stats.today.milestones': { de: 'Milestones heute', en: 'Milestones today' },

  'stats.progress.todos':      { de: 'Todos', en: 'Todos' },
  'stats.progress.milestones': { de: 'Milestones', en: 'Milestones' },
  'stats.progress.issues':     { de: 'Issues offen', en: 'Issues open' },

  'stats.totals.clips':       { de: 'Clips gesamt', en: 'Total clips' },
  'stats.totals.raids':       { de: 'Raids gesamt', en: 'Total raids' },
  'stats.totals.rewards':     { de: 'Belohnungen gesamt', en: 'Total rewards' },
  'stats.totals.active_days': { de: 'Aktive Tage (30d)', en: 'Active days (30d)' },

  'stats.delta.vs_yesterday': { de: 'vs. gestern', en: 'vs. yesterday' },
  'stats.delta.vs_7d_avg':    { de: 'vs. 7-Tage-Ø', en: 'vs. 7-day avg' },
```

- [ ] **Step 2: Typecheck passes**

Run: `npm run typecheck`
Expected: typecheck still errors only in `StatsPanel.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/i18n/translations.ts
git commit -m "feat(stats): add i18n keys for new stats layout"
```

---

## Task 7: Rewrite `StatsPanel.tsx`

**Files:**
- Modify: `src/renderer/src/panels/StatsPanel.tsx` (full replacement)

Panel structure: three sections, each a grid of cards. Uses the three new components. Includes WebSocket-driven throttled refetch.

- [ ] **Step 1: Replace the file contents**

```tsx
import React, { useEffect, useRef } from 'react';
import { useApi } from '../hooks/useApi';
import { useWebSocket } from '../hooks/useWebSocket';
import { Stats } from '../../../shared/types';
import { useTranslation } from '../i18n/LanguageContext';
import Sparkline from '../components/Sparkline';
import DeltaPill from '../components/DeltaPill';
import ProgressBar from '../components/ProgressBar';

const STATS_REFRESH_EVENTS = new Set([
  'clip-created', 'clip-updated', 'clip-deleted',
  'todo-updated',
  'issue-created', 'issue-updated', 'issue-deleted',
  'milestone-created', 'milestone-updated', 'milestone-deleted',
  'raid-created', 'raid-deleted',
  'reward-redeemed', 'reward-updated',
]);

const THROTTLE_MS = 2000;

export default function StatsPanel() {
  const { data: stats, loading, refetch } = useApi<Stats>('/stats');
  const { t } = useTranslation();

  const lastFetchRef = useRef<number>(0);
  const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleRefetch = () => {
    const now = Date.now();
    const wait = Math.max(0, THROTTLE_MS - (now - lastFetchRef.current));
    if (pendingRef.current) return; // already scheduled
    pendingRef.current = setTimeout(() => {
      pendingRef.current = null;
      lastFetchRef.current = Date.now();
      refetch();
    }, wait);
  };

  useWebSocket((event) => {
    if (STATS_REFRESH_EVENTS.has(event)) scheduleRefetch();
  });

  useEffect(() => () => {
    if (pendingRef.current) clearTimeout(pendingRef.current);
  }, []);

  if (loading || !stats) {
    return (
      <div className="panel stats-panel">
        <h2>📊 Statistiken</h2>
        <p className="panel-desc">{t('stats.loading')}</p>
      </div>
    );
  }

  return (
    <div className="panel stats-panel">
      <h2>📊 Statistiken</h2>
      <p className="panel-desc">{t('stats.desc')}</p>

      <section className="stats-section">
        <h3 className="stats-section-title">{t('stats.section.today')}</h3>
        <div className="stats-grid stats-grid-hero">
          <HeroCard icon="🎬" value={stats.today.clips}
                    label={t('stats.today.clips')}
                    delta={stats.today.delta_clips}
                    deltaLabel={t('stats.delta.vs_yesterday')} />
          <HeroCard icon="✅" value={stats.today.todos_done}
                    label={t('stats.today.todos_done')}
                    delta={stats.today.delta_todos}
                    deltaLabel={t('stats.delta.vs_7d_avg')} />
          <HeroCard icon="⚠️" value={stats.today.new_issues}
                    label={t('stats.today.new_issues')}
                    delta={stats.today.delta_issues}
                    deltaLabel={t('stats.delta.vs_yesterday')} />
          <HeroCard icon="🏆" value={stats.today.milestones}
                    label={t('stats.today.milestones')}
                    delta={stats.today.delta_milestones}
                    deltaLabel={t('stats.delta.vs_yesterday')} />
        </div>
      </section>

      <section className="stats-section">
        <h3 className="stats-section-title">{t('stats.section.progress')}</h3>
        <div className="stats-grid">
          <ProgressCard icon="📝"
                        label={t('stats.progress.todos')}
                        value={stats.progress.todos.done}
                        total={stats.progress.todos.total} />
          <ProgressCard icon="🎯"
                        label={t('stats.progress.milestones')}
                        value={stats.progress.milestones.completed}
                        total={stats.progress.milestones.total} />
          <ProgressCard icon="⚠️"
                        label={t('stats.progress.issues')}
                        value={stats.progress.issues.open}
                        total={stats.progress.issues.total}
                        inverted />
        </div>
      </section>

      <section className="stats-section">
        <h3 className="stats-section-title">{t('stats.section.totals')}</h3>
        <div className="stats-grid">
          <TrendCard icon="🎬" value={stats.totals.clips}
                     label={t('stats.totals.clips')}   trend={stats.trends.clips} />
          <TrendCard icon="⚔️" value={stats.totals.raids}
                     label={t('stats.totals.raids')}   trend={stats.trends.raids} />
          <TrendCard icon="🎁" value={stats.totals.rewards}
                     label={t('stats.totals.rewards')} trend={stats.trends.rewards} />
          <TrendCard icon="📅" value={stats.totals.active_days_30d}
                     label={t('stats.totals.active_days')} trend={stats.trends.active} />
        </div>
      </section>
    </div>
  );
}

interface HeroCardProps {
  icon: string;
  value: number;
  label: string;
  delta: number;
  deltaLabel: string;
}

function HeroCard({ icon, value, label, delta, deltaLabel }: HeroCardProps) {
  return (
    <div className="stat-card stat-card-hero">
      <div className="stat-card-top">
        <span className="stat-icon">{icon}</span>
        <DeltaPill value={delta} suffix={deltaLabel} />
      </div>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

interface ProgressCardProps {
  icon: string;
  label: string;
  value: number;
  total: number;
  inverted?: boolean;
}

function ProgressCard({ icon, label, value, total, inverted }: ProgressCardProps) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="stat-card">
      <div className="stat-card-top">
        <span className="stat-icon">{icon}</span>
        <span className="stat-pct">{pct}%</span>
      </div>
      <span className="stat-value">{value} / {total}</span>
      <span className="stat-label">{label}</span>
      <ProgressBar value={value} total={total} inverted={inverted} />
    </div>
  );
}

interface TrendCardProps {
  icon: string;
  value: number;
  label: string;
  trend: number[];
}

function TrendCard({ icon, value, label, trend }: TrendCardProps) {
  return (
    <div className="stat-card">
      <div className="stat-card-top">
        <span className="stat-icon">{icon}</span>
        <Sparkline values={trend} />
      </div>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck passes**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/panels/StatsPanel.tsx
git commit -m "feat(stats): rewrite StatsPanel with three sections and live refresh"
```

---

## Task 8: Add CSS for the new stats layout

**Files:**
- Modify: `src/renderer/src/index.css` (append)

- [ ] **Step 1: Append stats styles at end of file**

Append this block to `src/renderer/src/index.css`:

```css
/* ============================================================
 * Stats Panel
 * ============================================================ */
.stats-panel .stats-section { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
.stats-panel .stats-section:first-of-type { margin-top: 8px; }
.stats-panel .stats-section-title {
  font-size: 11px;
  font-weight: 600;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  margin: 0;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 8px;
}
.stats-grid-hero {
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
}

.stat-card {
  background: #1a1a1a;
  border: 1px solid #2a2a2a;
  border-radius: 6px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 86px;
}
.stat-card-hero { min-height: 102px; }

.stat-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.stat-icon { font-size: 20px; line-height: 1; }
.stat-card-hero .stat-icon { font-size: 24px; }

.stat-value {
  font-size: 26px;
  font-weight: 700;
  color: #e0e0e0;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}
.stat-card-hero .stat-value { font-size: 34px; }

.stat-label {
  font-size: 12px;
  color: #888;
  line-height: 1.2;
}

.stat-pct {
  font-size: 12px;
  color: #888;
  font-variant-numeric: tabular-nums;
}

.delta-pill {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 10px;
  background: #2a2a2a;
  color: #888;
  font-variant-numeric: tabular-nums;
}
.delta-pill.up   { color: #2ecc71; background: #2ecc7118; }
.delta-pill.down { color: #e74c3c; background: #e74c3c18; }
.delta-pill.flat { color: #666; }

.progress-bar {
  height: 6px;
  background: #2a2a2a;
  border-radius: 3px;
  overflow: hidden;
  margin-top: 4px;
}
.progress-fill {
  height: 100%;
  background: #e67e22;
  transition: width 200ms ease;
}
```

- [ ] **Step 2: Reload renderer**

Vite HMR picks up CSS automatically. Switch to the Electron window (or reload via devtools) and open the Stats-Panel.

Expected: three visually distinct sections; cards have borders; hero row shows bigger numbers; progress bars render orange; sparklines draw a thin orange line; delta pills are green/red/grey.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/index.css
git commit -m "feat(stats): add CSS for new three-section stats layout"
```

---

## Task 9: End-to-end manual QA

- [ ] **Step 1: Run full typecheck**

Run: `npm run typecheck`
Expected: 0 errors across project.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: no new errors in changed files. Fix any.

- [ ] **Step 3: Verify live updates**

With dev server running and StatsPanel open:

1. Create a new clip via the Clips-Panel (or trigger the auto-clip hotkey). → Within ~2s, `Clips heute` increments and `delta_clips` may update.
2. Tick a Todo done. → `Todos erledigt` increments.
3. Create an Issue. → `Neue Issues` increments and Issues-Fortschritt bar moves.
4. Rapidly create 5 clips in under 2s. → Only one or two refetches fire (check browser devtools Network tab — should see `GET /api/stats` at most 2× in that window, not 5×).

- [ ] **Step 4: Verify i18n switch**

Switch language DE → EN in settings. All stats labels update (section titles, card labels, delta suffixes). Then switch back.

- [ ] **Step 5: Verify empty-DB edge case**

If there's no data for today, Hero cards show `0` with `• 0` delta pill (flat/grey). Sparklines render as flat lines (all zeros). No crashes.

- [ ] **Step 6: Verify collapsed panel still refreshes**

Collapse the StatsPanel. Create a clip. Expand again — number is up-to-date, not stale.

- [ ] **Step 7: Final commit (only if changes were needed during QA)**

If any fixes were made during QA:

```bash
git add -A
git commit -m "fix(stats): address QA findings"
```

Otherwise skip.

---

## Self-Review Notes

**Spec coverage:**
- "Heute" section with 4 hero cards + deltas → Task 2 (backend) + Task 7 (HeroCard)
- "Fortschritt" section with 3 compound cards + progress bars → Task 5 (ProgressBar) + Task 7 (ProgressCard)
- "Gesamt & Trend" section with 4 cards + sparklines → Task 3 (Sparkline) + Task 7 (TrendCard); `trends.active` array is in spec + Task 2
- Live updates via WebSocket with 2s throttle → Task 7 (`scheduleRefetch`)
- Styling consistent with dark theme + orange accent → Task 8
- i18n DE/EN → Task 6
- No schema change → confirmed; all queries use existing columns
- Todo "erledigt heute" approximation via `created_at` → documented in spec, implemented in Task 2

**Decisions taken during planning:**
- No new `stats:dirty` broadcast event needed — existing per-entity events (`clip-created`, `todo-updated`, etc.) already fire from mutation routes. StatsPanel listens on a hardcoded set of those. This is simpler than adding a fan-in event.
- Throttle state lives in the panel via refs, not in a shared hook — only one consumer.
- `trends.active` uses a separate DISTINCT-session_date query rather than threading a parameter through `trendCounts`, because the shape is different (0/1 presence, not a count).

# Reward Stats Tracking Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track all-time reward redemption statistics per user and reward type, with dashboard panel, detail log, and `!stats` chat command.

**Architecture:** Two new SQLite tables (`reward_stats` for aggregated counters, `reward_log` for immutable history). EventSub handler writes to both on every redemption. New Express router serves leaderboard and log APIs. New React panel in the `stats` tab. Chat command queries `reward_stats` directly.

**Tech Stack:** SQLite (better-sqlite3), Express, React, tmi.js. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-04-23-reward-stats-design.md`

**Important:** No automated tests in this project. Verification via `npm run typecheck` and `npm run lint`.

---

## File Structure

**Created:**

```
src/server/api/reward-stats.ts           — Express router: leaderboard + user stats + log endpoints
src/renderer/src/panels/RewardStatsPanel.tsx — Dashboard panel with leaderboard + detail log views
```

**Modified:**

```
src/server/db/schema.ts                  — new tables + indexes, version 14 → 15
src/server/bot/eventsub.ts:80-85         — tracking inserts after existing reward INSERT
src/server/bot/commands.ts:11-24,53      — !stats command registration + handler
src/server/index.ts:0-30,94-111          — import + mount reward-stats router
src/renderer/src/App.tsx:19-59           — import + register RewardStatsPanel in stats tab
```

---

### Task 1: Database schema — new tables

**Files:**
- Modify: `src/server/db/schema.ts`

- [ ] **Step 1: Add reward_stats and reward_log tables to SCHEMA**

In `src/server/db/schema.ts`, bump `SCHEMA_VERSION` from 14 to 15. Add the following tables at the end of the SCHEMA template literal (before the closing backtick):

```sql
CREATE TABLE IF NOT EXISTS reward_stats (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  user_name        TEXT NOT NULL,
  reward_type      TEXT NOT NULL,
  count            INTEGER DEFAULT 0,
  last_redeemed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_name, reward_type)
);

CREATE TABLE IF NOT EXISTS reward_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_name     TEXT NOT NULL,
  reward_type   TEXT NOT NULL,
  reward_title  TEXT NOT NULL,
  user_input    TEXT DEFAULT '',
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reward_log_user ON reward_log(user_name);
CREATE INDEX IF NOT EXISTS idx_reward_log_type ON reward_log(reward_type);
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/server/db/schema.ts
git commit -m "feat(db): add reward_stats and reward_log tables

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Tracking inserts in EventSub handler

**Files:**
- Modify: `src/server/bot/eventsub.ts:80-85`

- [ ] **Step 1: Add tracking inserts after existing reward INSERT**

In `src/server/bot/eventsub.ts`, in `handleRedemption()`, after line 85 (`broadcast('reward-redeemed', reward);`), add:

```typescript
  // Track all-time stats (normalize username to lowercase for consistent grouping)
  const normalizedName = userName.toLowerCase();
  getDb().prepare(
    'INSERT INTO reward_log (user_name, reward_type, reward_title, user_input) VALUES (?, ?, ?, ?)'
  ).run(normalizedName, rewardType, rewardTitle, userInput);

  getDb().prepare(`
    INSERT INTO reward_stats (user_name, reward_type, count, last_redeemed_at)
    VALUES (?, ?, 1, CURRENT_TIMESTAMP)
    ON CONFLICT(user_name, reward_type)
    DO UPDATE SET count = count + 1, last_redeemed_at = CURRENT_TIMESTAMP
  `).run(normalizedName, rewardType);
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/server/bot/eventsub.ts
git commit -m "feat(rewards): track all-time stats on every redemption

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: API router for reward stats

**Files:**
- Create: `src/server/api/reward-stats.ts`
- Modify: `src/server/index.ts`

- [ ] **Step 1: Create `src/server/api/reward-stats.ts`**

```typescript
import { Router } from 'express';
import { getDb } from '../db/index';

const router = Router();

// Distinct reward types (for filter dropdowns)
router.get('/types', (_req, res) => {
  const rows = getDb().prepare('SELECT DISTINCT reward_type FROM reward_stats ORDER BY reward_type').all() as Array<{ reward_type: string }>;
  res.json(rows.map(r => r.reward_type));
});

// Paginated detail log (MUST be before /:username to avoid route collision)
router.get('/log', (req, res) => {
  const { user, type, offset, limit } = req.query;
  const maxLimit = Math.min(Number(limit) || 50, 200);
  const skip = Number(offset) || 0;

  let query = 'SELECT * FROM reward_log';
  let countQuery = 'SELECT COUNT(*) as total FROM reward_log';
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (user) { conditions.push('user_name = ?'); values.push(user); }
  if (type) { conditions.push('reward_type = ?'); values.push(type); }

  if (conditions.length > 0) {
    const where = ' WHERE ' + conditions.join(' AND ');
    query += where;
    countQuery += where;
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';

  const total = (getDb().prepare(countQuery).get(...values) as { total: number }).total;
  const items = getDb().prepare(query).all(...values, maxLimit, skip);
  res.json({ items, total });
});

// Leaderboard — aggregated stats
router.get('/', (req, res) => {
  const { type, sort, limit } = req.query;
  const maxLimit = Math.min(Number(limit) || 50, 200);
  const orderBy = sort === 'last_redeemed_at' ? 'last_redeemed_at DESC' : 'count DESC';

  if (type) {
    const rows = getDb().prepare(
      `SELECT user_name, reward_type, count, last_redeemed_at
       FROM reward_stats WHERE reward_type = ?
       ORDER BY ${orderBy} LIMIT ?`
    ).all(type, maxLimit);
    res.json(rows);
  } else {
    const rows = getDb().prepare(
      `SELECT user_name, SUM(count) as count, MAX(last_redeemed_at) as last_redeemed_at
       FROM reward_stats GROUP BY user_name
       ORDER BY ${orderBy} LIMIT ?`
    ).all(maxLimit);
    res.json(rows);
  }
});

// Stats for a specific user
router.get('/:username', (req, res) => {
  const { username } = req.params;
  const byType = getDb().prepare(
    'SELECT reward_type, count, last_redeemed_at FROM reward_stats WHERE user_name = ? ORDER BY count DESC'
  ).all(username) as Array<{ reward_type: string; count: number; last_redeemed_at: string }>;

  const total = byType.reduce((sum, r) => sum + r.count, 0);
  res.json({ user_name: username, total, by_type: byType });
});

export default router;
```

**Note:** `/types` and `/log` routes are defined BEFORE `/:username` to avoid Express matching "types" or "log" as a username param.

- [ ] **Step 2: Register router in `src/server/index.ts`**

Add import after the existing router imports (around line 21):

```typescript
import rewardStatsRouter from './api/reward-stats';
```

Add mount after the existing `app.use('/api/milestones', milestonesRouter);` line:

```typescript
  app.use('/api/reward-stats', rewardStatsRouter);
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/server/api/reward-stats.ts src/server/index.ts
git commit -m "feat(api): add reward-stats endpoints (leaderboard, user, log)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Chat command `!stats`

**Files:**
- Modify: `src/server/bot/commands.ts`

- [ ] **Step 1: Add `rewardstats` to DEFAULT_COMMANDS**

In `src/server/bot/commands.ts`, add to the `DEFAULT_COMMANDS` object (line 23, before the closing `}`):

```typescript
  rewardstats: '!stats',
```

- [ ] **Step 2: Add the case handler in the switch statement**

Find the end of the switch statement (before the closing `}` of the switch). Add a new case. The handler needs to extract the optional username argument from the message and query `reward_stats`.

```typescript
      case 'rewardstats': {
        const args = message.trim().split(' ').slice(1);
        const target = args[0] || tags['display-name'] || tags.username || 'Unknown';

        const byType = getDb().prepare(
          'SELECT reward_type, count FROM reward_stats WHERE user_name = ? ORDER BY count DESC'
        ).all(target.toLowerCase()) as Array<{ reward_type: string; count: number }>;

        if (byType.length === 0) {
          client.say(channel, `@${target} hat noch keine Rewards eingelöst.`);
          break;
        }

        const total = byType.reduce((sum, r) => sum + r.count, 0);
        const breakdown = byType.map(r => `${r.reward_type}: ${r.count}`).join(', ');
        client.say(channel, `@${target} — ${total} Rewards gesamt (${breakdown})`);
        break;
      }
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/server/bot/commands.ts
git commit -m "feat(bot): add !stats chat command for reward leaderboard

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Dashboard panel — RewardStatsPanel

**Files:**
- Create: `src/renderer/src/panels/RewardStatsPanel.tsx`
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Create `src/renderer/src/panels/RewardStatsPanel.tsx`**

```tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useApi, apiGet } from '../hooks/useApi';
import { useWebSocket } from '../hooks/useWebSocket';

interface StatRow {
  user_name: string;
  reward_type?: string;
  count: number;
  last_redeemed_at: string;
}

interface UserStats {
  user_name: string;
  total: number;
  by_type: Array<{ reward_type: string; count: number; last_redeemed_at: string }>;
}

interface LogRow {
  id: number;
  user_name: string;
  reward_type: string;
  reward_title: string;
  user_input: string;
  created_at: string;
}

interface LogResponse {
  items: LogRow[];
  total: number;
}

type View = 'leaderboard' | 'log';

const DEBOUNCE_MS = 2000;

export default function RewardStatsPanel() {
  const [view, setView] = useState<View>('leaderboard');
  const [typeFilter, setTypeFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [logOffset, setLogOffset] = useState(0);
  const [logData, setLogData] = useState<LogResponse | null>(null);
  const [types, setTypes] = useState<string[]>([]);

  // Leaderboard data
  const leaderboardUrl = typeFilter
    ? `/reward-stats?type=${encodeURIComponent(typeFilter)}&limit=50`
    : '/reward-stats?limit=50';
  const { data: leaderboard, loading, refetch } = useApi<StatRow[]>(leaderboardUrl);

  // Debounced refetch on reward events
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useWebSocket((event) => {
    if (event === 'reward-redeemed') {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        refetch();
        if (view === 'log') fetchLog();
      }, DEBOUNCE_MS);
    }
  });

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  // Fetch available reward types for the filter dropdown
  useEffect(() => {
    apiGet<string[]>('/reward-stats/types').then((res) => {
      if (res) setTypes(res);
    });
  }, []);

  // Fetch log data
  const fetchLog = useCallback(() => {
    const params = new URLSearchParams();
    if (userFilter) params.set('user', userFilter);
    if (typeFilter) params.set('type', typeFilter);
    params.set('offset', String(logOffset));
    params.set('limit', '50');
    apiGet<LogResponse>(`/reward-stats/log?${params}`).then((res) => {
      if (res) setLogData(res);
    });
  }, [userFilter, typeFilter, logOffset]);

  useEffect(() => {
    if (view === 'log') fetchLog();
  }, [view, fetchLog]);

  const showUserLog = (username: string) => {
    setUserFilter(username);
    setLogOffset(0);
    setView('log');
  };

  return (
    <div className="panel reward-stats-panel">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2>🏆 Reward Stats</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className={`tab-btn ${view === 'leaderboard' ? 'active' : ''}`}
            onClick={() => setView('leaderboard')}
          >
            Leaderboard
          </button>
          <button
            className={`tab-btn ${view === 'log' ? 'active' : ''}`}
            onClick={() => { setView('log'); setLogOffset(0); }}
          >
            Log
          </button>
        </div>
      </div>

      {/* Type filter */}
      <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setLogOffset(0); }}
          style={{ padding: '4px 8px', background: '#1a1a1a', border: '1px solid #333', borderRadius: 4, color: '#ccc', fontSize: 12 }}
        >
          <option value="">Alle Typen</option>
          {types.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        {view === 'log' && (
          <input
            type="text"
            placeholder="Username suchen..."
            value={userFilter}
            onChange={(e) => { setUserFilter(e.target.value); setLogOffset(0); }}
            style={{ padding: '4px 8px', background: '#1a1a1a', border: '1px solid #333', borderRadius: 4, color: '#ccc', fontSize: 12, flex: 1 }}
          />
        )}
      </div>

      {view === 'leaderboard' && (
        <div>
          {loading ? (
            <p style={{ color: '#666' }}>Laden...</p>
          ) : !leaderboard || leaderboard.length === 0 ? (
            <p style={{ color: '#666' }}>Noch keine Reward-Daten vorhanden.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #333', color: '#888' }}>
                  <th style={{ textAlign: 'left', padding: '6px 8px' }}>#</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px' }}>User</th>
                  {typeFilter && <th style={{ textAlign: 'left', padding: '6px 8px' }}>Typ</th>}
                  <th style={{ textAlign: 'right', padding: '6px 8px' }}>Anzahl</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px' }}>Letztes Mal</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((row, i) => (
                  <tr key={row.user_name + (row.reward_type || '')} style={{ borderBottom: '1px solid #222' }}>
                    <td style={{ padding: '6px 8px', color: '#666' }}>{i + 1}</td>
                    <td style={{ padding: '6px 8px' }}>
                      <button
                        onClick={() => showUserLog(row.user_name)}
                        style={{ background: 'none', border: 'none', color: '#e67e22', cursor: 'pointer', padding: 0, fontSize: 12 }}
                      >
                        {row.user_name}
                      </button>
                    </td>
                    {typeFilter && <td style={{ padding: '6px 8px', color: '#888' }}>{row.reward_type}</td>}
                    <td style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600 }}>{row.count}</td>
                    <td style={{ textAlign: 'right', padding: '6px 8px', color: '#888' }}>
                      {new Date(row.last_redeemed_at).toLocaleDateString('de-DE')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {view === 'log' && (
        <div>
          {!logData ? (
            <p style={{ color: '#666' }}>Laden...</p>
          ) : logData.items.length === 0 ? (
            <p style={{ color: '#666' }}>Keine Einträge gefunden.</p>
          ) : (
            <>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #333', color: '#888' }}>
                    <th style={{ textAlign: 'left', padding: '6px 8px' }}>Zeit</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px' }}>User</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px' }}>Reward</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px' }}>Input</th>
                  </tr>
                </thead>
                <tbody>
                  {logData.items.map((row) => (
                    <tr key={row.id} style={{ borderBottom: '1px solid #222' }}>
                      <td style={{ padding: '6px 8px', color: '#888', whiteSpace: 'nowrap' }}>
                        {new Date(row.created_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td style={{ padding: '6px 8px' }}>{row.user_name}</td>
                      <td style={{ padding: '6px 8px', color: '#888' }}>{row.reward_title}</td>
                      <td style={{ padding: '6px 8px', color: '#666', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row.user_input || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, fontSize: 11, color: '#666' }}>
                <span>{logData.total} Einträge</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    disabled={logOffset === 0}
                    onClick={() => setLogOffset(Math.max(0, logOffset - 50))}
                    style={{ padding: '2px 8px', background: '#1a1a1a', border: '1px solid #333', borderRadius: 4, color: '#ccc', cursor: 'pointer', fontSize: 11 }}
                  >
                    ← Zurück
                  </button>
                  <button
                    disabled={logOffset + 50 >= logData.total}
                    onClick={() => setLogOffset(logOffset + 50)}
                    style={{ padding: '2px 8px', background: '#1a1a1a', border: '1px solid #333', borderRadius: 4, color: '#ccc', cursor: 'pointer', fontSize: 11 }}
                  >
                    Weiter →
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Register panel in `src/renderer/src/App.tsx`**

Add import at the top (after the other panel imports):

```typescript
import RewardStatsPanel from './panels/RewardStatsPanel';
```

Add to the `stats` tab group in the TABS object:

```typescript
  stats: {
    label: '📊 Stats',
    panels: [
      { key: 'stats', label: 'Statistiken', component: StatsPanel },
      { key: 'rewardstats', label: 'Reward Stats', component: RewardStatsPanel },
    ],
  },
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 4: Verify lint**

Run: `npm run lint`
Expected: No new errors (only pre-existing warnings)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/panels/RewardStatsPanel.tsx src/renderer/src/App.tsx
git commit -m "feat(ui): add RewardStatsPanel with leaderboard and detail log

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

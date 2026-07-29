# Reward Leaderboard & Rank-Change Alert Overlays — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two OBS Browser Source overlays — a persistent Top 3 leaderboard and an animated rank-change alert — powered by a server-side leaderboard tracking service.

**Architecture:** A new `reward-leaderboard.ts` module tracks the Top 3 in memory, compares after each redemption, and broadcasts a `reward-leaderboard-update` WebSocket event with rank change details. Both overlays consume this event. A new public endpoint serves the current Top 3 for initial load.

**Tech Stack:** TypeScript (server), HTML/CSS/JS (overlays), SQLite (data), WebSocket (real-time)

**Spec:** `docs/superpowers/specs/2026-04-24-reward-leaderboard-overlay-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/server/reward-leaderboard.ts` | Server-side Top 3 tracking, comparison, WS broadcast |
| Create | `src/overlays/reward-leaderboard/index.html` | Persistent Top 3 overlay (OBS Browser Source) |
| Create | `src/overlays/reward-rankchange/index.html` | Animated rank-change alert overlay |
| Modify | `src/shared/types.ts` | Add leaderboard-related types |
| Modify | `src/server/index.ts` | Add public endpoint + init leaderboard service |
| Modify | `src/server/bot/eventsub.ts` | Call `checkAndBroadcast()` after redemption |

---

## Task 1: Add Shared Types

**Files:**
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Add leaderboard types to `src/shared/types.ts`**

Add after the `Reward` interface (line ~29):

```typescript
export interface LeaderboardEntry {
  rank: number;
  userName: string;
  count: number;
}

export interface LeaderboardUpdateEntry extends LeaderboardEntry {
  previousRank: number | null;
}

export interface RankChange {
  userName: string;
  from: number;
  to: number;
  changeType: 'up' | 'down';
}

export interface RankEntry {
  userName: string;
  rank: number;
}

export interface RankExit {
  userName: string;
  previousRank: number;
}

export interface LeaderboardUpdate {
  type: string;
  leaderboard: LeaderboardUpdateEntry[];
  changes: RankChange[];
  entered: RankEntry[];
  exited: RankExit[];
}

export interface LeaderboardResponse {
  type: string;
  leaderboard: LeaderboardEntry[];
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npm run typecheck`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(types): add leaderboard types for reward overlay"
```

---

## Task 2: Create Leaderboard Tracking Service

**Files:**
- Create: `src/server/reward-leaderboard.ts`

- [ ] **Step 1: Create `src/server/reward-leaderboard.ts`**

```typescript
import { getDb } from './db/index';
import { broadcast } from './websocket/index';
import type {
  LeaderboardEntry,
  LeaderboardUpdateEntry,
  LeaderboardUpdate,
  RankChange,
  RankEntry,
  RankExit,
} from '../shared/types';

// In-memory cache: type key → current top 3
const cache = new Map<string, LeaderboardEntry[]>();
let initialized = false;

/**
 * Query the current Top N from the DB.
 * type="all" aggregates across all reward types.
 */
function queryTop(type: string, limit = 3): LeaderboardEntry[] {
  const db = getDb();
  let rows: Array<{ user_name: string; count: number }>;

  if (type === 'all') {
    rows = db
      .prepare(
        `SELECT user_name, SUM(count) as count
         FROM reward_stats
         GROUP BY user_name
         ORDER BY count DESC, user_name ASC
         LIMIT ?`
      )
      .all(limit) as Array<{ user_name: string; count: number }>;
  } else {
    rows = db
      .prepare(
        `SELECT user_name, count
         FROM reward_stats
         WHERE reward_type = ?
         ORDER BY count DESC, user_name ASC
         LIMIT ?`
      )
      .all(type, limit) as Array<{ user_name: string; count: number }>;
  }

  return rows.map((row, i) => ({
    rank: i + 1,
    userName: row.user_name,
    count: Number(row.count),
  }));
}

/**
 * Compare old and new leaderboards, detect changes.
 */
function detectChanges(
  oldBoard: LeaderboardEntry[],
  newBoard: LeaderboardEntry[]
): { changes: RankChange[]; entered: RankEntry[]; exited: RankExit[] } {
  const oldByName = new Map(oldBoard.map((e) => [e.userName, e]));
  const newByName = new Map(newBoard.map((e) => [e.userName, e]));

  const changes: RankChange[] = [];
  const entered: RankEntry[] = [];
  const exited: RankExit[] = [];

  // Detect entries that moved rank or are new
  for (const entry of newBoard) {
    const old = oldByName.get(entry.userName);
    if (!old) {
      entered.push({ userName: entry.userName, rank: entry.rank });
    } else if (old.rank !== entry.rank) {
      changes.push({
        userName: entry.userName,
        from: old.rank,
        to: entry.rank,
        changeType: entry.rank < old.rank ? 'up' : 'down',
      });
    }
  }

  // Detect users who fell out
  for (const entry of oldBoard) {
    if (!newByName.has(entry.userName)) {
      exited.push({ userName: entry.userName, previousRank: entry.rank });
    }
  }

  return { changes, entered, exited };
}

/**
 * Initialize cache from DB. Must be called before connectEventSub().
 */
export function initRewardLeaderboard(): void {
  // Load "all" type
  cache.set('all', queryTop('all'));

  // Load each known reward type
  const types = getDb()
    .prepare('SELECT DISTINCT reward_type FROM reward_stats')
    .all() as Array<{ reward_type: string }>;

  for (const { reward_type } of types) {
    cache.set(reward_type, queryTop(reward_type));
  }

  initialized = true;
  console.log('[Leaderboard] Initialized with', cache.size, 'type(s)');
}

/**
 * Check if the Top 3 changed for a given type and broadcast if so.
 */
export function checkAndBroadcast(type: string): void {
  if (!initialized) return;

  const newBoard = queryTop(type);
  const oldBoard = cache.get(type) || [];

  // Check if anything actually changed (rank or count)
  const changed =
    newBoard.length !== oldBoard.length ||
    newBoard.some((entry, i) => {
      const old = oldBoard[i];
      return !old || old.userName !== entry.userName || old.count !== entry.count;
    });

  if (!changed) return;

  const { changes, entered, exited } = detectChanges(oldBoard, newBoard);

  // Build update payload
  const leaderboard: LeaderboardUpdateEntry[] = newBoard.map((entry) => {
    const old = oldBoard.find((o) => o.userName === entry.userName);
    return { ...entry, previousRank: old?.rank ?? null };
  });

  const update: LeaderboardUpdate = {
    type,
    leaderboard,
    changes,
    entered,
    exited,
  };

  // Update cache
  cache.set(type, newBoard);

  // Broadcast to all connected clients
  broadcast('reward-leaderboard-update', update);
}

/**
 * Get current Top N for a given type (used by public endpoint).
 */
export function getTopRewards(type: string, limit = 3): LeaderboardEntry[] {
  return queryTop(type, limit);
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npm run typecheck`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add src/server/reward-leaderboard.ts
git commit -m "feat(server): add reward leaderboard tracking service"
```

---

## Task 3: Add Public Endpoint & Integrate Service

**Files:**
- Modify: `src/server/index.ts`
- Modify: `src/server/bot/eventsub.ts`

- [ ] **Step 1: Add import and public endpoint to `src/server/index.ts`**

Add import (after `initAutoClips` import, line ~29):

```typescript
import { initRewardLeaderboard, getTopRewards } from './reward-leaderboard';
```

Add public endpoint after the `/public/progress` endpoint (after line ~146):

```typescript
  app.get('/public/reward-stats/top', (req, res) => {
    const type = (req.query.type as string) || 'all';
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 3, 1), 10);
    res.json({ type, leaderboard: getTopRewards(type, limit) });
  });
```

Add `initRewardLeaderboard()` call in the server startup, **before** `connectBot()` (before line ~192):

```typescript
      initRewardLeaderboard();
```

- [ ] **Step 2: Add `checkAndBroadcast` call to `src/server/bot/eventsub.ts`**

Add import at top of file (after existing imports):

```typescript
import { checkAndBroadcast } from '../reward-leaderboard';
```

Add after the reward_stats transaction (after line 99, before the roulette check):

```typescript
  // Update leaderboard tracking
  checkAndBroadcast('all');
  checkAndBroadcast(rewardType);
```

- [ ] **Step 3: Verify typecheck passes**

Run: `npm run typecheck`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add src/server/index.ts src/server/bot/eventsub.ts
git commit -m "feat(server): add public leaderboard endpoint and integrate tracking"
```

---

## Task 4: Create Leaderboard Overlay

**Files:**
- Create: `src/overlays/reward-leaderboard/index.html`

- [ ] **Step 1: Create `src/overlays/reward-leaderboard/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Reward Leaderboard</title>
<style>
:root {
  --color-primary: #ff2d7b;
  --color-secondary: #00d4ff;
  --color-accent: #ffd700;
  --color-bg: #0a0a0a;
  --font-display: 'Rajdhani', sans-serif;
  --font-body: 'Inter', sans-serif;
}
html { visibility: hidden; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  background: transparent;
  font-family: var(--font-body);
  overflow: hidden;
}

.leaderboard {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  width: 280px;
}

.header {
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 2px;
  color: rgba(255,255,255,0.5);
  margin-bottom: 4px;
}

.entry {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: rgba(10, 10, 10, 0.85);
  border-radius: 6px;
  border-left: 3px solid var(--color-primary);
  transition: all 0.5s ease;
}

.entry.rank-1 {
  border-left-color: var(--color-accent);
  background: rgba(255, 215, 0, 0.08);
}
.entry.rank-2 {
  border-left-color: #c0c0c0;
}
.entry.rank-3 {
  border-left-color: #cd7f32;
}

.rank {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 700;
  color: var(--color-accent);
  min-width: 28px;
  text-align: center;
}
.entry.rank-2 .rank { color: #c0c0c0; }
.entry.rank-3 .rank { color: #cd7f32; }

.name {
  flex: 1;
  font-size: 15px;
  font-weight: 600;
  color: #fff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.count {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 700;
  color: var(--color-secondary);
  transition: transform 0.3s ease;
}

.count.updated {
  transform: scale(1.3);
}
</style>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&family=Rajdhani:wght@600;700&display=swap" rel="stylesheet">
</head>
<body>
<div class="leaderboard" id="leaderboard">
  <div class="header">Top Redeemer</div>
</div>

<!-- Overlay config loader -->
<script>
(function() {
  var name = 'reward-leaderboard';
  function hexToRgb(hex) {
    hex = hex.replace('#','');
    if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    var n = parseInt(hex, 16);
    return ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255);
  }
  fetch('http://localhost:4000/public/overlay-config')
    .then(function(r) { return r.json(); })
    .then(function(config) {
      var vars = Object.assign({}, config.global || {}, (config.overrides || {})[name] || {});
      var root = document.documentElement;
      Object.keys(vars).forEach(function(k) { root.style.setProperty(k, vars[k]); });
      ['--color-primary', '--color-secondary', '--color-accent', '--color-bg'].forEach(function(k) {
        if (vars[k]) root.style.setProperty(k + '-rgb', hexToRgb(vars[k]));
      });
      var fonts = [vars['--font-display'], vars['--font-body']].filter(Boolean);
      if (fonts.length > 0) {
        var families = fonts.map(function(f) { return f.split(',')[0].replace(/'/g, '').trim(); });
        var link = document.createElement('link');
        link.href = 'https://fonts.googleapis.com/css2?family=' + families.map(function(f) { return encodeURIComponent(f) + ':wght@400;600;700'; }).join('&') + '&display=swap';
        link.rel = 'stylesheet';
        document.head.appendChild(link);
      }
    })
    .catch(function() {})
    .finally(function() { document.documentElement.style.visibility = 'visible'; });
  window.__applyOverlayConfig = function(config) {
    var vars = Object.assign({}, config.global || {}, (config.overrides || {})[name] || {});
    var root = document.documentElement;
    Object.keys(vars).forEach(function(k) { root.style.setProperty(k, vars[k]); });
    ['--color-primary', '--color-secondary', '--color-accent', '--color-bg'].forEach(function(k) {
      if (vars[k]) root.style.setProperty(k + '-rgb', hexToRgb(vars[k]));
    });
  };
})();
</script>

<!-- Main logic -->
<script>
const params = new URLSearchParams(window.location.search);
const configuredType = params.get('type') || 'all';

let leaderboard = [];
let wsConnected = false;
let fallbackInterval = null;

async function fetchLeaderboard() {
  try {
    const res = await fetch(`http://localhost:4000/public/reward-stats/top?type=${configuredType}&limit=3`);
    const data = await res.json();
    leaderboard = data.leaderboard || [];
    render();
  } catch (err) {
    console.error('[Leaderboard] Fetch failed:', err);
  }
}

function render() {
  const container = document.getElementById('leaderboard');
  // Keep header, remove entries
  const header = container.querySelector('.header');
  container.innerHTML = '';
  container.appendChild(header);

  for (const entry of leaderboard) {
    const el = document.createElement('div');
    el.className = `entry rank-${entry.rank}`;
    el.dataset.user = entry.userName;
    el.innerHTML = `
      <span class="rank">#${entry.rank}</span>
      <span class="name">${escapeHtml(entry.userName)}</span>
      <span class="count">${entry.count}</span>
    `;
    container.appendChild(el);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function handleLeaderboardUpdate(data) {
  if (data.type !== configuredType) return;

  // Animate count changes
  const oldCounts = new Map(leaderboard.map(e => [e.userName, e.count]));
  leaderboard = (data.leaderboard || []).map(e => ({
    rank: e.rank,
    userName: e.userName,
    count: e.count,
  }));
  render();

  // Flash updated counts
  for (const entry of leaderboard) {
    const old = oldCounts.get(entry.userName);
    if (old !== undefined && old !== entry.count) {
      const el = document.querySelector(`.entry[data-user="${CSS.escape(entry.userName)}"] .count`);
      if (el) {
        el.classList.add('updated');
        setTimeout(() => el.classList.remove('updated'), 400);
      }
    }
  }
}

// Fallback polling
function startFallbackPolling() {
  if (fallbackInterval) return;
  fallbackInterval = setInterval(fetchLeaderboard, 10000);
}

function stopFallbackPolling() {
  if (fallbackInterval) {
    clearInterval(fallbackInterval);
    fallbackInterval = null;
  }
}

// WebSocket
function connectWS() {
  const ws = new WebSocket('ws://localhost:4000?overlay=1');

  ws.onopen = () => {
    console.log('[Leaderboard] WebSocket connected');
    wsConnected = true;
    stopFallbackPolling();
    fetchLeaderboard();
  };

  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.event === 'reward-leaderboard-update') handleLeaderboardUpdate(msg.data);
      if (msg.event === 'reward-redeemed') fetchLeaderboard(); // also refresh on any redeem for count updates
      if (msg.event === 'overlay-config' && window.__applyOverlayConfig) window.__applyOverlayConfig(msg.data);
    } catch {}
  };

  ws.onclose = () => {
    console.log('[Leaderboard] WebSocket closed, reconnecting...');
    wsConnected = false;
    startFallbackPolling();
    setTimeout(connectWS, 2000);
  };

  ws.onerror = () => ws.close();
}

connectWS();
startFallbackPolling();
</script>
</body>
</html>
```

- [ ] **Step 2: Verify the file is served**

Start the dev server (`npm run dev`), then open `http://localhost:4000/overlay/reward-leaderboard/index.html` in a browser. The overlay should load (empty or with data if reward stats exist).

- [ ] **Step 3: Commit**

```bash
git add src/overlays/reward-leaderboard/index.html
git commit -m "feat(overlay): add reward leaderboard Top 3 overlay"
```

---

## Task 5: Create Rank-Change Alert Overlay

**Files:**
- Create: `src/overlays/reward-rankchange/index.html`

- [ ] **Step 1: Create `src/overlays/reward-rankchange/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Rank Change Alert</title>
<style>
:root {
  --color-primary: #ff2d7b;
  --color-secondary: #00d4ff;
  --color-accent: #ffd700;
  --color-bg: #0a0a0a;
  --font-display: 'Rajdhani', sans-serif;
  --font-body: 'Inter', sans-serif;
}
html { visibility: hidden; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  background: transparent;
  font-family: var(--font-body);
  overflow: hidden;
}

.alert-container {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 320px;
  opacity: 0;
  pointer-events: none;
}

.alert-container.visible {
  opacity: 1;
}

/* Slide in/out */
.alert-container.slide-in {
  animation: slideIn 0.5s ease forwards;
}
.alert-container.slide-out {
  animation: slideOut 0.5s ease forwards;
}

@keyframes slideIn {
  from { transform: translate(-50%, -50%) translateX(-60px); opacity: 0; }
  to   { transform: translate(-50%, -50%) translateX(0); opacity: 1; }
}
@keyframes slideOut {
  from { transform: translate(-50%, -50%) translateX(0); opacity: 1; }
  to   { transform: translate(-50%, -50%) translateX(60px); opacity: 0; }
}

.alert-header {
  font-family: var(--font-display);
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 2px;
  color: var(--color-primary);
  text-align: center;
  margin-bottom: 10px;
}

.alert-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  position: relative;
}

.alert-entry {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: rgba(10, 10, 10, 0.9);
  border-radius: 6px;
  border-left: 3px solid var(--color-primary);
  position: relative;
  transition: transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.5s ease;
}

.alert-entry.rank-1 {
  border-left-color: var(--color-accent);
  background: rgba(255, 215, 0, 0.1);
}
.alert-entry.rank-2 { border-left-color: #c0c0c0; }
.alert-entry.rank-3 { border-left-color: #cd7f32; }

.alert-entry.changed {
  box-shadow: 0 0 12px rgba(255, 45, 123, 0.4);
}

.alert-entry.entered {
  animation: enterSlide 0.5s ease 0.8s both;
}

@keyframes enterSlide {
  from { transform: translateX(-40px); opacity: 0; }
  to   { transform: translateX(0); opacity: 1; }
}

.alert-entry.exiting {
  animation: exitSlide 0.5s ease both;
}

@keyframes exitSlide {
  from { transform: translateX(0); opacity: 1; }
  to   { transform: translateX(40px); opacity: 0; }
}

.rank {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 700;
  color: var(--color-accent);
  min-width: 28px;
  text-align: center;
}
.alert-entry.rank-2 .rank { color: #c0c0c0; }
.alert-entry.rank-3 .rank { color: #cd7f32; }

.name {
  flex: 1;
  font-size: 15px;
  font-weight: 600;
  color: #fff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.count {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 700;
  color: var(--color-secondary);
}

.badge {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 3px;
  text-transform: uppercase;
  letter-spacing: 1px;
}
.badge.up {
  background: rgba(0, 200, 83, 0.2);
  color: #00c853;
}
.badge.down {
  background: rgba(255, 82, 82, 0.2);
  color: #ff5252;
}
.badge.new {
  background: rgba(0, 212, 255, 0.2);
  color: var(--color-secondary);
}
</style>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&family=Rajdhani:wght@600;700&display=swap" rel="stylesheet">
</head>
<body>
<div class="alert-container" id="alertContainer">
  <div class="alert-header">Platzwechsel!</div>
  <div class="alert-list" id="alertList"></div>
</div>

<!-- Overlay config loader -->
<script>
(function() {
  var name = 'reward-rankchange';
  function hexToRgb(hex) {
    hex = hex.replace('#','');
    if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    var n = parseInt(hex, 16);
    return ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255);
  }
  fetch('http://localhost:4000/public/overlay-config')
    .then(function(r) { return r.json(); })
    .then(function(config) {
      var vars = Object.assign({}, config.global || {}, (config.overrides || {})[name] || {});
      var root = document.documentElement;
      Object.keys(vars).forEach(function(k) { root.style.setProperty(k, vars[k]); });
      ['--color-primary', '--color-secondary', '--color-accent', '--color-bg'].forEach(function(k) {
        if (vars[k]) root.style.setProperty(k + '-rgb', hexToRgb(vars[k]));
      });
      var fonts = [vars['--font-display'], vars['--font-body']].filter(Boolean);
      if (fonts.length > 0) {
        var families = fonts.map(function(f) { return f.split(',')[0].replace(/'/g, '').trim(); });
        var link = document.createElement('link');
        link.href = 'https://fonts.googleapis.com/css2?family=' + families.map(function(f) { return encodeURIComponent(f) + ':wght@400;600;700'; }).join('&') + '&display=swap';
        link.rel = 'stylesheet';
        document.head.appendChild(link);
      }
    })
    .catch(function() {})
    .finally(function() { document.documentElement.style.visibility = 'visible'; });
  window.__applyOverlayConfig = function(config) {
    var vars = Object.assign({}, config.global || {}, (config.overrides || {})[name] || {});
    var root = document.documentElement;
    Object.keys(vars).forEach(function(k) { root.style.setProperty(k, vars[k]); });
    ['--color-primary', '--color-secondary', '--color-accent', '--color-bg'].forEach(function(k) {
      if (vars[k]) root.style.setProperty(k + '-rgb', hexToRgb(vars[k]));
    });
  };
})();
</script>

<!-- Main logic -->
<script>
const params = new URLSearchParams(window.location.search);
const configuredType = params.get('type') || 'all';

const queue = [];
let animating = false;

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function handleLeaderboardUpdate(data) {
  if (data.type !== configuredType) return;
  // Only alert on actual rank changes or new entries
  if ((!data.changes || data.changes.length === 0) && (!data.entered || data.entered.length === 0)) return;
  queue.push(data);
  processQueue();
}

async function processQueue() {
  if (animating || queue.length === 0) return;
  animating = true;

  const data = queue.shift();
  await playAnimation(data);

  animating = false;
  processQueue();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function playAnimation(data) {
  const container = document.getElementById('alertContainer');
  const list = document.getElementById('alertList');
  list.innerHTML = '';

  const changedUsers = new Set((data.changes || []).map(c => c.userName));
  const enteredUsers = new Set((data.entered || []).map(e => e.userName));

  // Build entries
  for (const entry of data.leaderboard) {
    const el = document.createElement('div');
    const isChanged = changedUsers.has(entry.userName);
    const isEntered = enteredUsers.has(entry.userName);

    let classes = `alert-entry rank-${entry.rank}`;
    if (isChanged) classes += ' changed';
    if (isEntered) classes += ' entered';
    el.className = classes;

    let badge = '';
    if (isEntered) {
      badge = '<span class="badge new">Neu</span>';
    } else if (isChanged) {
      const change = data.changes.find(c => c.userName === entry.userName);
      if (change) {
        const arrow = change.changeType === 'up' ? '\u25B2' : '\u25BC';
        badge = `<span class="badge ${change.changeType}">${arrow}</span>`;
      }
    }

    el.innerHTML = `
      <span class="rank">#${entry.rank}</span>
      <span class="name">${escapeHtml(entry.userName)}</span>
      ${badge}
      <span class="count">${entry.count}</span>
    `;
    list.appendChild(el);
  }

  // Slide in
  container.classList.remove('slide-out');
  container.classList.add('visible', 'slide-in');

  // Hold
  await sleep(5500);

  // Slide out
  container.classList.remove('slide-in');
  container.classList.add('slide-out');
  await sleep(500);

  // Reset
  container.classList.remove('visible', 'slide-out');
  list.innerHTML = '';
}

// WebSocket
function connectWS() {
  const ws = new WebSocket('ws://localhost:4000?overlay=1');

  ws.onopen = () => {
    console.log('[RankChange] WebSocket connected');
  };

  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.event === 'reward-leaderboard-update') handleLeaderboardUpdate(msg.data);
      if (msg.event === 'overlay-config' && window.__applyOverlayConfig) window.__applyOverlayConfig(msg.data);
    } catch {}
  };

  ws.onclose = () => {
    console.log('[RankChange] WebSocket closed, reconnecting...');
    setTimeout(connectWS, 2000);
  };

  ws.onerror = () => ws.close();
}

connectWS();
</script>
</body>
</html>
```

- [ ] **Step 2: Verify the file is served**

Open `http://localhost:4000/overlay/reward-rankchange/index.html` in a browser. The overlay should load (invisible, since no alerts are active).

- [ ] **Step 3: Commit**

```bash
git add src/overlays/reward-rankchange/index.html
git commit -m "feat(overlay): add rank-change alert overlay with animations"
```

---

## Task 6: End-to-End Verification

- [ ] **Step 1: Verify typecheck**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 2: Verify lint**

Run: `npm run lint`
Expected: No new errors (fix any that appear)

- [ ] **Step 3: Manual E2E test**

1. Start dev server: `npm run dev`
2. Open leaderboard overlay: `http://localhost:4000/overlay/reward-leaderboard/index.html`
3. Open rank-change overlay: `http://localhost:4000/overlay/reward-rankchange/index.html`
4. Insert test data via the running app's DB to simulate rank changes
5. Verify leaderboard updates and rank-change animation plays

- [ ] **Step 4: Final commit if any fixes were needed**

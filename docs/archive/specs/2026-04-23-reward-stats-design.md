# Reward Stats Tracking — Design Spec

**Goal:** Track all-time reward redemption statistics per user and reward type. Provide a dashboard panel with leaderboard + detail log, and a `!stats` chat command.

## Database

### New table: `reward_stats`

Aggregated counters per user + reward type. Upserted on every redemption.

```sql
CREATE TABLE IF NOT EXISTS reward_stats (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  user_name        TEXT NOT NULL,
  reward_type      TEXT NOT NULL,
  count            INTEGER DEFAULT 0,
  last_redeemed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_name, reward_type)
);
```

### New table: `reward_log`

Immutable log of every redemption. Never deleted — this is the all-time record.

```sql
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

Schema version bumped from 14 → 15 in `src/server/db/schema.ts`.

## Tracking Flow

In `src/server/bot/eventsub.ts`, inside `handleRedemption()` (after the existing `INSERT INTO rewards`), add:

```typescript
// 1. Insert into reward_log
getDb().prepare(
  'INSERT INTO reward_log (user_name, reward_type, reward_title, user_input) VALUES (?, ?, ?, ?)'
).run(userName, rewardType, rewardTitle, userInput);

// 2. Upsert into reward_stats
getDb().prepare(`
  INSERT INTO reward_stats (user_name, reward_type, count, last_redeemed_at)
  VALUES (?, ?, 1, CURRENT_TIMESTAMP)
  ON CONFLICT(user_name, reward_type)
  DO UPDATE SET count = count + 1, last_redeemed_at = CURRENT_TIMESTAMP
`).run(userName, rewardType);
```

No changes to existing reward logic. The new tracking is additive.

## API Endpoints

New file: `src/server/api/reward-stats.ts`, mounted at `/api/reward-stats` in `src/server/index.ts`.

### `GET /api/reward-stats`

Leaderboard — aggregated stats, sortable and filterable.

Query params:
- `type` (optional) — filter by reward_type
- `sort` (optional) — `count` (default) or `last_redeemed_at`
- `limit` (optional) — default 50, max 200

**With `type` filter:** Query `reward_stats` where `reward_type = ?`, return `{ user_name, reward_type, count, last_redeemed_at }`.

**Without `type` filter:** Group by `user_name`, sum counts: `SELECT user_name, SUM(count) as count, MAX(last_redeemed_at) as last_redeemed_at FROM reward_stats GROUP BY user_name`. Response: `{ user_name, count, last_redeemed_at }` (no `reward_type` field).

### `GET /api/reward-stats/:username`

Stats for a specific user.

Response: `{ user_name, total: number, by_type: [{ reward_type, count, last_redeemed_at }] }`.

### `GET /api/reward-log`

Paginated detail log.

Query params:
- `user` (optional) — filter by user_name
- `type` (optional) — filter by reward_type
- `offset` (optional) — default 0
- `limit` (optional) — default 50

Response: `{ items: [{ id, user_name, reward_type, reward_title, user_input, created_at }], total: number }`.

## Dashboard Panel

New file: `src/renderer/src/panels/RewardStatsPanel.tsx`

Registered in `App.tsx` under the `stats` tab group (alongside the existing StatsPanel). Panel key: `rewardstats`.

### Layout

Two views, togglable:

**Leaderboard view (default):**
- Dropdown filter by reward type (or "All")
- Table: Rank | Username | Count | Last Redeemed
- Sorted by count descending
- Clicking a username switches to the detail log filtered to that user

**Detail Log view:**
- Search field for username
- Dropdown filter by reward type
- Table: Time | Username | Reward | Input
- Paginated (50 per page)
- Back button to return to leaderboard

### WebSocket updates

Listen for the existing `reward-redeemed` event. Debounce re-fetch by 2 seconds to avoid excessive requests during active streams. No new WebSocket events needed.

## Chat Command

In `src/server/bot/commands.ts`:

Add `rewardstats: '!stats'` to `DEFAULT_COMMANDS`. Add `case 'rewardstats':` in the switch.

The argument (optional username) is extracted from the message: `const args = message.trim().split(' ').slice(1); const target = args[0] || tags['display-name'];`

### `!stats`

Shows the calling user's own all-time stats.

Response format: `@username — 42 Rewards gesamt (Roulette: 15, Scene Change: 12, Feature Request: 8, ...)`

### `!stats <username>`

Shows stats for a specific user.

Response format: `@target — 42 Rewards gesamt (Roulette: 15, Scene Change: 12, ...)`

If user not found: `@target hat noch keine Rewards eingelöst.`

All chat responses in German (matching existing bot language).

## Files

**Created:**
- `src/server/api/reward-stats.ts` — API routes
- `src/renderer/src/panels/RewardStatsPanel.tsx` — Dashboard panel

**Modified:**
- `src/server/db/schema.ts` — new tables, version bump
- `src/server/bot/eventsub.ts` — tracking inserts in handleRedemption
- `src/server/bot/commands.ts` — !stats command
- `src/server/index.ts` — register reward-stats router
- `src/renderer/src/App.tsx` — register RewardStatsPanel in TABS

## Out of Scope

- Retroactive import of existing rewards data
- Overlay for stream display (can be added later)
- Reward-specific icons or images in the panel

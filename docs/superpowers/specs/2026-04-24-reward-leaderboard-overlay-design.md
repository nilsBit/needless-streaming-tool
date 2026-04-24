# Reward Leaderboard & Rank-Change Alert Overlays

## Overview

Two new OBS Browser Source overlays for reward stats:

1. **Reward Leaderboard** — persistent Top 3 display
2. **Rank-Change Alert** — animated notification when positions change in the Top 3

Both are powered by a server-side leaderboard tracking service that detects rank changes and broadcasts events.

## Architecture: Server-Side Top-3 Tracking

The server tracks the current Top 3 in memory. After every reward redemption, it queries the new Top 3 from the DB, compares with the previous state, and broadcasts a `reward-leaderboard-update` event if anything changed. Both overlays consume this single event.

This keeps overlay logic simple and centralized.

## Components

### 1. Public API Endpoint

**`GET /public/reward-stats/top`**

Query params:
- `limit` — number of entries (default: 3)
- `type` — `"all"` (default, aggregates across all reward types) or a specific reward type

Response:
```json
{
  "type": "all",
  "leaderboard": [
    { "rank": 1, "userName": "user1", "count": 42 },
    { "rank": 2, "userName": "user2", "count": 38 },
    { "rank": 3, "userName": "user3", "count": 35 }
  ]
}
```

- `type=all`: runs `SELECT user_name, SUM(count) as count FROM reward_stats GROUP BY user_name ORDER BY count DESC LIMIT ?`
- `type=<specific>`: filters `WHERE reward_type = ?`
- No auth required (public endpoint for overlays)

### 2. Leaderboard Tracking Service

**New file:** `src/server/services/reward-leaderboard.ts`

Responsibilities:
- Maintains current Top 3 in memory (per type key: `"all"` + each known reward type)
- Exposes `checkAndBroadcast(type?: string)` — called after every reward redemption
- Queries DB for current Top 3, compares with cached state
- If rankings changed: broadcasts `reward-leaderboard-update` via WebSocket
- Initializes from DB on server startup

**WebSocket Event: `reward-leaderboard-update`**

```json
{
  "type": "all",
  "leaderboard": [
    { "rank": 1, "userName": "user1", "count": 42, "previousRank": 1 },
    { "rank": 2, "userName": "user3", "count": 38, "previousRank": 3 },
    { "rank": 3, "userName": "user2", "count": 37, "previousRank": 2 }
  ],
  "changes": [
    { "userName": "user3", "from": 3, "to": 2, "changeType": "up" },
    { "userName": "user2", "from": 2, "to": 3, "changeType": "down" }
  ],
  "entered": [
    { "userName": "newUser", "rank": 3 }
  ],
  "exited": [
    { "userName": "oldUser", "previousRank": 3 }
  ]
}
```

- `previousRank`: the user's rank before this update, `null` if newly entered
- `changes`: only populated when actual rank swaps occurred (empty array = no alert needed)
- `entered`: users who just entered the Top 3
- `exited`: users who just fell out of the Top 3

**Integration point:** Called in `handleRedemption()` in `src/server/bot/eventsub.ts` after the DB update (reward_stats + reward_log inserts).

### 3. Leaderboard Overlay

**File:** `src/overlays/reward-leaderboard/index.html`

Single-file HTML overlay (HTML + CSS + JS inline), following the existing overlay pattern.

**Behavior:**
- On load: fetch Top 3 from `/public/reward-stats/top?type=<type>`
- URL param `?type=all` (default) or `?type=hydrate` to filter by reward type
- WebSocket: on `reward-leaderboard-update`, update display with CSS transitions for count changes
- Overlay config support via `/public/overlay-config` and `overlay-config` event
- Fallback polling every 30s if WebSocket disconnects

**Visual design:**
- Vertical list, 3 entries
- Each entry: rank number, username, count
- Rank 1 visually highlighted (gold accent)
- Transparent background (OBS Browser Source)
- Compact layout, suitable for a corner placement
- Smooth CSS transitions when counts update

### 4. Rank-Change Alert Overlay

**File:** `src/overlays/reward-rankchange/index.html`

Single-file HTML overlay (HTML + CSS + JS inline).

**Behavior:**
- Default state: completely invisible (transparent)
- WebSocket: on `reward-leaderboard-update` with non-empty `changes` or `entered` arrays → play animation
- URL param `?type=all` (default) or specific type
- Queue system: if multiple changes arrive rapidly, queue and play sequentially
- Overlay config support

**Animation sequence:**
1. **Slide-in:** Top 3 list slides into view
2. **Rank animation:** entries that changed position animate to their new spots (rows visually swap places, sport-table style)
3. **New entries:** slide in from the side; exited users slide out
4. **Highlight:** changed positions get a glow/color highlight effect
5. **Hold:** display for ~5 seconds
6. **Slide-out:** list slides back out

**Visual design:**
- Similar style to the leaderboard overlay
- Animated transitions for position changes
- Highlight effect on changed positions (glow or color shift)
- Transparent background

## Data Flow

```
Twitch EventSub → handleRedemption()
  → Insert into reward_stats + reward_log (existing)
  → rewardLeaderboard.checkAndBroadcast("all")
  → rewardLeaderboard.checkAndBroadcast(rewardType)
    → Query DB for new Top 3
    → Compare with cached Top 3
    → If changed: broadcast("reward-leaderboard-update", payload)
      → Leaderboard Overlay: smooth update
      → Rank-Change Alert: play animation (only if changes/entered non-empty)
```

## Files to Create/Modify

### New files:
- `src/server/services/reward-leaderboard.ts` — leaderboard tracking service
- `src/overlays/reward-leaderboard/index.html` — persistent Top 3 overlay
- `src/overlays/reward-rankchange/index.html` — rank-change alert overlay

### Modified files:
- `src/server/index.ts` — add `/public/reward-stats/top` endpoint, initialize leaderboard service
- `src/server/bot/eventsub.ts` — call `checkAndBroadcast()` after reward redemption
- `src/shared/types.ts` — add types for leaderboard data and WS event

## Out of Scope

- Overlay panel UI for configuring the leaderboard overlays (can be added later)
- Historical rank tracking / rank change history
- More than Top 3 (configurable via `limit` param but default is 3)

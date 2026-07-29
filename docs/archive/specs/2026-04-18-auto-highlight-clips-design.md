# Auto-Highlight Clips: Automatic Clip Detection

**Date:** 2026-04-18
**Status:** Approved

## Goal

Automatically detect clip-worthy moments during streams based on 5 trigger sources (chat spikes, rewards, hype moments, milestones, raids). Create clips with OBS timecodes and confidence scores. User reviews and confirms or rejects auto-clips.

## Architecture

Two new server modules: `chat-monitor.ts` tracks chat message rate with sliding window for spike detection. `auto-clips.ts` listens to internal events and creates clips when triggers fire. Auto-clips are normal clips with `auto-*` tags and a `confidence` field. Existing clip infrastructure (timecodes, export, Notion sync) works unchanged.

## DB Change

**Add column to `clips`:**
```sql
ALTER TABLE clips ADD COLUMN confidence TEXT;
```

Values: `'high'`, `'medium'`, or `NULL` (for manual clips). Migration v10.

**Update `Clip` interface:**
```ts
confidence: 'high' | 'medium' | null;
```

## Chat-Spike Detection

**New module:** `src/server/bot/chat-monitor.ts`

**Algorithm:** Adaptive sliding window
- Counts every chat message (not just commands)
- Maintains a ring buffer of message counts per 30-second window
- Computes running average over the last 5 minutes (10 windows)
- Spike detected when: `current_window_count > average × SPIKE_MULTIPLIER`
- Default multiplier: 3x (configurable via settings key `auto_clip_spike_multiplier`)
- Cooldown: 60 seconds after a detected spike (prevents duplicate clips)
- Emits callback when spike detected with the multiplier value

**API:**
```ts
export function initChatMonitor(client: Client, onSpike: (multiplier: number) => void): void;
```

Hooks into the tmi.js client's `message` event to count all messages (before command filtering).

## Auto-Clip Triggers

**New module:** `src/server/auto-clips.ts`

Listens to WebSocket broadcast events + chat-monitor callback. Creates clips via internal function (same as POST /clips but called directly, not via HTTP).

| Trigger | Event Source | Clip Tag | Note Format | Confidence |
|---------|-------------|----------|-------------|------------|
| Chat Spike | chat-monitor callback | `auto-chat` | `"Chat spike ({mult}x)"` | `high` if >5x, `medium` if >3x |
| Reward Redeemed | `reward-redeemed` broadcast | `auto-reward` | `"Reward: {title} by {user}"` | `medium` |
| Hype Moment | `compile-pray` broadcast | `auto-hype` | `"Hype moment"` | `high` |
| Milestone | `milestone-trigger` broadcast | `auto-milestone` | `"Milestone: {title}"` | `high` |
| Raid | `raid-created` broadcast | `auto-raid` | `"Raid: {streamer} ({viewers})"` | `high` |

**Global cooldown:** 10 seconds between any two auto-clips (prevents event storms from creating many clips at once).

**Settings-controlled:** Each trigger can be individually enabled/disabled. Master toggle to disable all auto-clips.

### Integration with broadcast system

The `broadcast` function in `websocket/index.ts` currently sends to WebSocket clients. To let `auto-clips.ts` listen, add an internal event listener pattern:

```ts
// In websocket/index.ts — add internal listener support
type BroadcastListener = (event: string, data: unknown) => void;
const listeners: BroadcastListener[] = [];
export function onBroadcast(listener: BroadcastListener): void { listeners.push(listener); }

// In existing broadcast function, also call listeners:
export function broadcast(event: string, data: unknown) {
  // ... existing WebSocket send logic ...
  listeners.forEach(fn => fn(event, data));
}
```

Then `auto-clips.ts` registers via `onBroadcast()` at startup.

### Clip creation

Auto-clips are created by calling the clips API internally (reuse the same logic as POST /clips):

```ts
import { createClip } from '../api/clips';
// createClip(tag, note, confidence) → creates clip with OBS timecodes
```

Extract the clip creation logic from the POST handler into a shared `createClip` function that both the HTTP handler and auto-clips module can call.

## UI: ClipsPanel Changes

### Auto-Clip Badge
- Auto-clips (tag starts with `auto-`) show a `🤖` badge
- Confidence dot: `🟢` high, `🟡` medium

### Review Actions
- "✓" button on auto-clips → confirms (removes `auto-` prefix from tag, e.g. `auto-chat` → `chat`)
- "✕" button → deletes the auto-clip
- Both use existing PATCH/DELETE APIs

### Filter
- New "🤖 Auto" filter button alongside existing tag filters
- Filters to show only `auto-*` tagged clips

## Settings UI

New section in SettingsPanel: **"Auto-Clips"**

- Master toggle: Enable/disable auto-clips (setting: `auto_clips_enabled`, default: `true`)
- Spike multiplier: Slider 2x–6x (setting: `auto_clip_spike_multiplier`, default: `3`)
- 5 checkboxes for individual triggers (settings: `auto_clip_trigger_chat`, `auto_clip_trigger_reward`, etc., all default `true`)

## Translation Keys (~12)

```
auto_clips.title — "Auto-Clips" / "Auto-Clips"
auto_clips.desc — "Automatisch Clips bei besonderen Momenten erstellen." / "Automatically create clips at special moments."
auto_clips.enabled — "Auto-Clips aktiviert" / "Auto-Clips enabled"
auto_clips.disabled — "Auto-Clips deaktiviert" / "Auto-Clips disabled"
auto_clips.spike_multiplier — "Chat-Spike Empfindlichkeit" / "Chat spike sensitivity"
auto_clips.trigger_chat — "Chat-Spikes" / "Chat spikes"
auto_clips.trigger_reward — "Channel Point Rewards" / "Channel point rewards"
auto_clips.trigger_hype — "Hype Moments" / "Hype moments"
auto_clips.trigger_milestone — "Milestones" / "Milestones"
auto_clips.trigger_raid — "Raids" / "Raids"
auto_clips.confirm — "Bestätigen" / "Confirm"
auto_clips.reject — "Verwerfen" / "Reject"
```

## Affected Files

| Category | Files |
|----------|-------|
| DB | `src/server/db/schema.ts` (v10), `src/server/db/index.ts` (migration) |
| Types | `src/shared/types.ts` (confidence on Clip) |
| New | `src/server/bot/chat-monitor.ts` (message counter + spike detection) |
| New | `src/server/auto-clips.ts` (event listener + clip creation) |
| WebSocket | `src/server/websocket/index.ts` (add onBroadcast listener) |
| API | `src/server/api/clips.ts` (extract createClip function) |
| Bot | `src/server/bot/index.ts` (init chat monitor) |
| Server | `src/server/index.ts` (init auto-clips) |
| UI | `src/renderer/src/panels/ClipsPanel.tsx` (auto badge, confirm/reject, filter) |
| UI | `src/renderer/src/panels/SettingsPanel.tsx` (auto-clips section) |
| i18n | `src/renderer/src/i18n/translations.ts` (~12 keys) |

## What Does NOT Change

- Manual clip creation (works as before)
- CSV export (auto-clips export normally)
- Clip overlay
- Notion sync (auto-clips sync like normal clips)
- Existing clip tags and tag management

## Risk

- Medium: chat-monitor needs tuning (multiplier setting helps)
- Low: event-based triggers are deterministic
- Key risk: too many auto-clips in active chats → mitigated by cooldowns (60s for chat, 10s global)
- Performance: message counting is O(1) per message, no concern

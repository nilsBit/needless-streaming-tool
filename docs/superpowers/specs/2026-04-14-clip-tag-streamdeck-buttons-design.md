# Clip Tag Stream Deck Buttons — Design Spec

**Date:** 2026-04-14
**Status:** Draft

## Overview

Extend the Stream Deck plugin with individual buttons per clip tag. The 5 preset tags (highlight, fail, funny, tutorial, bug) each get a dedicated button. Custom tags defined in the app get a generic "Custom Clip" button that loads available tags via a Property Inspector dropdown.

## API Changes

### New Endpoint: `GET /api/clip-tags`

Returns all available clip tags (presets + custom):

```json
[
  { "tag": "highlight", "emoji": "⭐", "preset": true },
  { "tag": "fail", "emoji": "💀", "preset": true },
  { "tag": "funny", "emoji": "😂", "preset": true },
  { "tag": "tutorial", "emoji": "📚", "preset": true },
  { "tag": "bug", "emoji": "🐛", "preset": true },
  { "tag": "rage-quit", "emoji": "🏷️", "preset": false }
]
```

Preset tags are hardcoded. Custom tags are stored in the `settings` table under key `custom_clip_tags` as a JSON array of strings (e.g. `["rage-quit", "clutch"]`). Custom tags always receive the default emoji `🏷️`.

### New Endpoint: `POST /api/clip-tags`

Add a custom tag. Body: `{ "tag": "rage-quit" }`. Validates tag is not empty and not a duplicate of an existing preset or custom tag. Stores the updated array back to `settings.custom_clip_tags`.

Broadcasts WebSocket event `clip-tags-changed` with the full updated tag list.

### New Endpoint: `DELETE /api/clip-tags/:tag`

Remove a custom tag. Returns 400 if the tag is a preset. Broadcasts `clip-tags-changed`.

## App UI Changes (ClipsPanel)

The existing tag button row in ClipsPanel is extended:

- Preset tag buttons remain unchanged (hardcoded `PRESET_TAGS` array)
- Custom tag buttons appear after the presets, same visual style, with default emoji `🏷️`
- Custom tag buttons show a small `×` delete affordance; preset buttons do not
- A `+` button at the end opens an inline text input to create a new custom tag
- Tag list is loaded via `GET /api/clip-tags` and refreshed on `clip-tags-changed` WebSocket event

## Stream Deck Plugin: Clip Actions

### 5 Fixed Preset Clip Buttons

Defined in `manifest.json` as separate actions:

| Action ID | Tag | Icon |
|---|---|---|
| `com.nilsr.stream-toolkit.clip.highlight` | highlight | ⭐ |
| `com.nilsr.stream-toolkit.clip.fail` | fail | 💀 |
| `com.nilsr.stream-toolkit.clip.funny` | funny | 😂 |
| `com.nilsr.stream-toolkit.clip.tutorial` | tutorial | 📚 |
| `com.nilsr.stream-toolkit.clip.bug` | bug | 🐛 |

Each button has its tag hardcoded. No Property Inspector needed. On press: `POST /api/clips { tag: "<tag>" }`. Green flash on success, red flash on error.

### 1 Generic "Custom Clip" Button

Action ID: `com.nilsr.stream-toolkit.clip.custom`

- **Property Inspector:** Dropdown populated by `GET /api/clip-tags` (filtered to non-preset tags only). Live-updated via WebSocket `clip-tags-changed` event without reopening the PI.
- **Button title:** Shows the selected tag name. Shows "Setup" if no tag is selected.
- **On press:** `POST /api/clips { tag: "<selected-tag>" }`. Ignored if no tag selected.
- **Feedback:** Green flash on success, red flash on error.

The user can drag multiple instances of this button onto their deck, each configured with a different custom tag.

## WebSocket Events

| Event | Payload | Triggered by |
|---|---|---|
| `clip-tags-changed` | Full tag list (same format as `GET /api/clip-tags`) | `POST /api/clip-tags`, `DELETE /api/clip-tags/:tag` |

## Error Handling

- `POST /api/clip-tags` with empty tag → 400
- `POST /api/clip-tags` with duplicate tag → 409
- `DELETE /api/clip-tags/:tag` on preset tag → 400
- `DELETE /api/clip-tags/:tag` on non-existent tag → 404
- Custom Clip button pressed without tag selected → no-op

## Out of Scope

- Custom emoji per custom tag (always uses default `🏷️`)
- Reordering tags
- Renaming tags

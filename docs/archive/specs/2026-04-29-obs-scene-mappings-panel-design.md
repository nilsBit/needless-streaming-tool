# OBS Scene Mappings Panel

## Summary

A dedicated panel for configuring Channel Point Reward-to-OBS Scene mappings. When a viewer redeems a reward, OBS automatically switches to the mapped scene.

## Context

The backend already supports scene mappings (`GET/POST /api/obs/mappings`, `GET /api/obs/scenes`). The `findSceneForReward()` function in `src/server/obs/index.ts` matches reward titles and triggers `changeScene()` via EventSub in `src/server/bot/eventsub.ts`. There is no UI to configure these mappings.

## Design

### New API Endpoint

**`GET /api/auth/twitch/rewards`** — Fetches custom Channel Point rewards from Twitch Helix API (`GET /helix/channel_points/custom_rewards`). Requires `channel:read:redemptions` scope (already configured). Returns `{ rewards: Array<{ id: string, title: string }> }`. Returns empty array if Twitch is not connected.

### Panel: OBS Panel

**Location:** Settings tab in `TABS`, alongside Settings, Overlays, Hotkeys. Key: `obs`, label: `OBS`.

**File:** `src/renderer/src/panels/ObsPanel.tsx`

**Layout (top to bottom):**

1. **Connection Status** — Same pattern as other panels: status dot + text ("OBS Connected" / "OBS Not Connected"). If not connected, show a hint to connect in Settings.

2. **Scene Mappings Section** — Header "Scene Mappings" with description text.

3. **Mapping Rows** — Each row contains:
   - Reward dropdown (populated from `GET /api/auth/twitch/rewards`, disabled with hint if Twitch not connected)
   - Scene dropdown (populated from `GET /api/obs/scenes`, disabled with hint if OBS not connected)
   - Delete button (trash icon)

4. **Add Button** — "Mapping hinzufuegen" button below the rows. Adds an empty row.

5. **Auto-save** — Changes are saved automatically on every dropdown change or row deletion via `POST /api/obs/mappings`.

### Data Flow

1. Panel mounts → fetches OBS status, OBS scenes, Twitch rewards, existing mappings (4 parallel API calls)
2. User selects reward + scene in a row → `POST /api/obs/mappings` with full mappings array
3. EventSub receives reward redemption → `findSceneForReward()` looks up mapping → `changeScene()` triggers OBS scene switch
4. WebSocket events `obs-status` and `bot-status` update connection indicators in real-time

### Translation Keys

All new text uses `obs.*` namespace in translations (e.g., `obs.scene_mappings`, `obs.add_mapping`, `obs.no_obs_hint`, `obs.no_twitch_hint`).

### Edge Cases

- **OBS not connected:** Scene dropdown disabled, shows placeholder "OBS nicht verbunden"
- **Twitch not connected:** Reward dropdown disabled, shows placeholder "Twitch nicht verbunden"
- **No custom rewards:** Reward dropdown shows "Keine Rewards gefunden"
- **OBS reconnects:** Scenes list auto-refreshes via `obs-status` WebSocket event

### Files to Create/Modify

| File | Action |
|------|--------|
| `src/renderer/src/panels/ObsPanel.tsx` | Create — new panel component |
| `src/renderer/src/App.tsx` | Modify — import ObsPanel, add to settings tab |
| `src/server/api/auth.ts` | Modify — add `GET /twitch/rewards` endpoint |
| `src/renderer/src/i18n/translations.ts` | Modify — add obs panel translation keys |
| `src/renderer/src/index.css` | Modify — add mapping row styles if needed |

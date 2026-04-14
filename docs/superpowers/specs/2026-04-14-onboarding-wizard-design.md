# Onboarding Wizard Design

## Overview

A fullscreen step-by-step wizard that appears on first launch. Guides new users through connecting Twitch, OBS, Notion, setting up overlays, and Stream Deck. Can be re-launched from Settings at any time.

## Architecture

A new React component `OnboardingWizard` renders as a fullscreen overlay on top of the app. The flag `onboarding_completed` in the `settings` database table controls whether it appears. When false or missing, the wizard shows instead of the normal app UI.

## Steps

| Step | Title | Content | Required | Completion Criteria |
|---|---|---|---|---|
| 0 | Welcome | Logo, greeting, what the app does, "Start Setup" button | Yes | Click "Start Setup" |
| 1 | Twitch | Client-ID input + OAuth connect button. Same logic as SettingsPanel. Shows connection status dot. | Yes | Bot status shows connected |
| 2 | OBS | Host, port, password fields + connect button. Shows connection status. | Yes | OBS status shows connected |
| 3 | Notion | Token input + Database-ID input. Skip button available. | No | Token saved OR skipped |
| 4 | Overlays | List of all overlay URLs with copy buttons. Short explanation of how to add as OBS Browser Source. | Yes | Click "Next" (informational only) |
| 5 | Stream Deck | Show API token with copy button. Link/info about the Stream Deck plugin. Skip button available. | No | Token copied OR skipped |
| 6 | Done | Summary with checkmarks showing what was configured. "Los geht's" button that sets `onboarding_completed=true` and dismisses the wizard. | Yes | Click "Los geht's" |

## Navigation

- **Back / Next** buttons at the bottom of each step
- **Skip** button on optional steps (Notion, Stream Deck)
- **Step indicator** at the top (dot indicators showing current position)
- Steps show green checkmark in the indicator when completed
- User can go back to previous steps to change settings

## API

Two new endpoints on the settings router:

- `GET /api/settings/onboarding` → `{ completed: boolean }`
- `POST /api/settings/onboarding` → `{ completed: boolean }` — sets or resets the flag

The flag is stored as `onboarding_completed` in the `settings` table (key-value store, value is `"true"` or `"false"`).

## File Structure

```
src/renderer/src/
  components/
    OnboardingWizard.tsx        -- Main wizard container (step state, navigation)
    onboarding/
      WelcomeStep.tsx           -- Step 0: greeting
      TwitchStep.tsx            -- Step 1: Twitch setup
      ObsStep.tsx               -- Step 2: OBS setup
      NotionStep.tsx            -- Step 3: Notion setup (optional)
      OverlaysStep.tsx          -- Step 4: overlay URLs
      StreamDeckStep.tsx        -- Step 5: API token + plugin info (optional)
      DoneStep.tsx              -- Step 6: summary + launch
```

## Integration Points

- `App.tsx`: Fetch `/api/settings/onboarding` on mount. If not completed, render `OnboardingWizard` instead of tabs/panels.
- `SettingsPanel.tsx`: Add "Setup-Wizard erneut starten" button that calls `POST /api/settings/onboarding { completed: false }` and reloads.
- Step components reuse the same API calls as the existing SettingsPanel (connect Twitch, connect OBS, save Notion token, etc.)

## Styling

- Fullscreen dark overlay matching app background (#0d0d0d)
- Centered content card, max-width 500px
- Orange accent (#e67e22) for primary buttons and active step indicators
- Step indicator dots at top: gray for pending, orange for current, green for completed
- Smooth fade transitions between steps
- Same font and component styles as the rest of the app

## Constraints

- No new dependencies
- Reuses existing API endpoints for all connections
- No changes to the database schema (uses existing settings key-value table)
- Works in both dev and production builds

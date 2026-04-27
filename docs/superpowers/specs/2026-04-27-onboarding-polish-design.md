# Onboarding Wizard Polish

## Overview

Fix critical bugs, error handling, i18n gaps, loading states, input validation, and accessibility issues in the onboarding wizard.

## Components

### 1. Navigation Fix

**File:** `src/renderer/src/components/OnboardingWizard.tsx`

The parent wizard renders a "Next" button only for the first 3 steps (Language, Profile, Welcome). Steps 3-7 (Twitch, OBS, Notion, Overlays, StreamDeck) have no parent-rendered Next button — users can only proceed via the parent's step navigation which is not visible.

**Fix:** Render the "Next/Skip" button for ALL steps in the parent. For required steps (Twitch, OBS), disable the Next button until the service is connected. The step components already expose connection status via `useApi` hooks.

This means the parent needs to know which steps are "done":
- Twitch: `botStatus?.connected`
- OBS: `obsStatus?.connected`
- Notion: always skippable
- Overlays: informational, always next-able
- StreamDeck: always skippable

### 2. Error Handling with Toast

**Files:** `TwitchStep.tsx`, `ObsStep.tsx`, `NotionStep.tsx`, `StreamDeckStep.tsx`

All API calls in step components get try-catch with `toast.error()` on failure. Import `useToast` from `'../../i18n/ToastContext'`.

Specific fixes:
- `TwitchStep.saveClientId()` — toast on failure
- `TwitchStep` OAuth open — toast on failure
- `ObsStep.saveAndConnect()` — toast on failure
- `NotionStep.saveToken()` — toast on failure
- `StreamDeckStep.installPlugin()` — replace empty catch with toast

### 3. i18n Cleanup

**File:** `OnboardingWizard.tsx`
- Replace hardcoded STEPS array with i18n keys

**File:** `LanguageStep.tsx`
- The title "Sprache / Language" is intentionally bilingual (shown before language is chosen). Keep as-is — this is correct UX.

**File:** `DoneStep.tsx`
- Service names "Twitch", "OBS", "Notion" — these are brand names, not translatable. Keep as-is.

**File:** `ObsStep.tsx`
- Use i18n keys for placeholder text

**New i18n keys needed:**
```
'onboarding.step.language', 'onboarding.step.profile', 'onboarding.step.welcome',
'onboarding.step.twitch', 'onboarding.step.obs', 'onboarding.step.notion',
'onboarding.step.overlays', 'onboarding.step.streamdeck', 'onboarding.step.done'
```

### 4. Loading/Disabled States

**File:** `TwitchStep.tsx`
- Add `saving` state, disable "Save" button while saving Client ID
- Disable button when input is empty

**File:** `ObsStep.tsx`
- Add `connecting` state, disable "Connect" button during connection attempt
- Show loading text on button

**File:** `NotionStep.tsx`
- Add `saving` state, disable button during save

**File:** `StreamDeckStep.tsx`
- Already has `installing` state — use it to disable button (check if already done)

**File:** `OverlaysStep.tsx`
- Show loading indicator while `overlays` data is being fetched

### 5. Input Validation

**File:** `ObsStep.tsx`
- Port input: `type="number"` with `min="1"` `max="65535"`

**File:** `TwitchStep.tsx`
- Disable save button when Client ID input is empty (already partly done, reinforce)

**File:** `NotionStep.tsx`
- Add format hint below input: token should start with `ntn_` or `secret_`

### 6. Accessibility

**Files:** `LanguageStep.tsx`, `WelcomeStep.tsx`, `DoneStep.tsx`
- Add `role="img"` and `aria-label` to emoji containers

**Files:** `TwitchStep.tsx`, `ObsStep.tsx`, `DoneStep.tsx`
- Add text label next to color status dots (e.g., "Connected" / "Not connected")

### 7. SKIPPABLE Comment

**File:** `OnboardingWizard.tsx`
- Fix confusing comment on SKIPPABLE set

## Files to Modify

| File | Changes |
|------|---------|
| `OnboardingWizard.tsx` | Navigation for all steps, i18n step labels, fix SKIPPABLE comment |
| `TwitchStep.tsx` | Error toast, loading state, button disabled |
| `ObsStep.tsx` | Error toast, loading state, port input type, i18n placeholders |
| `NotionStep.tsx` | Error toast, loading state, format hint |
| `StreamDeckStep.tsx` | Error toast (replace empty catch) |
| `OverlaysStep.tsx` | Loading state |
| `LanguageStep.tsx` | Accessibility (emoji aria-label) |
| `WelcomeStep.tsx` | Accessibility (emoji aria-label) |
| `DoneStep.tsx` | Accessibility (emoji aria-label, status text) |
| `translations.ts` | Step label keys, error messages |

## Out of Scope

- Wizard redesign / reordering steps
- Error boundaries around individual steps
- Confirmation dialog on window close during onboarding
- Making the wizard re-runnable from Settings

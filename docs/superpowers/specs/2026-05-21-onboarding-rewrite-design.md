# Onboarding Rewrite — Variant A

**Date:** 2026-05-21
**Status:** Approved (pending implementation)
**Author:** brainstorm with user (lizenzen_nils)

## Problem

The first-run onboarding wizard currently has 9 steps including a full Notion setup (token + clip database picker) and a decorative Welcome splash. The user reports that the Notion / clip-database part isn't important for most streamers — what streamers actually need is OBS, Twitch, "what they do" (profile + overlays), and maybe Stream Deck. The current flow is too long and frontloads optional integrations.

## Goals

1. Remove the entire Notion step (token + clip database picker) from the onboarding wizard. Notion remains fully configurable in the Settings panel (already wired) for users who do want it.
2. Drop the standalone Welcome splash step — fold the welcome header into the existing Profile step so the flow gets to the point faster.
3. Keep the rest of the flow linear and skip-able where it already was.
4. No backend / API / database changes.

## Non-goals

- Redesigning the visual style of onboarding cards or the step indicator.
- Removing or rewriting the Notion configuration UI in the Settings panel.
- Touching NotionDatabasePicker, NotionSetupModal, ClipSyncBadge, the `/settings/notion` API routes, or the clip-sync logic in `auto-clips.ts` / `notion-sync.ts`.
- Changing the onboarding-completed persistence model.
- Restructuring the Overlays or Stream Deck steps themselves.

## Design

### New step flow

7 steps instead of 9, with welcome content folded into the Profile step:

| Index | Step        | Component         | Skippable | Gate                       |
|-------|-------------|-------------------|-----------|----------------------------|
| 0     | Language    | `LanguageStep`    | —         | —                          |
| 1     | Profile     | `ProfileStep` *   | —         | —                          |
| 2     | Twitch      | `TwitchStep`      | —         | `onReady = connected`      |
| 3     | OBS         | `ObsStep`         | —         | `onReady = connected`      |
| 4     | Overlays    | `OverlaysStep`    | —         | —                          |
| 5     | Stream Deck | `StreamDeckStep`  | **yes**   | —                          |
| 6     | Done        | `DoneStep`        | —         | Twitch + OBS connected     |

*Profile step gains a welcome header on top (full version — icon + title + text).

Wizard state changes in `OnboardingWizard.tsx`:
- `STEP_KEYS` shrinks from 9 to 7 entries (`onboarding.step.welcome` and `onboarding.step.notion` removed)
- `SKIPPABLE` changes from `{5, 7}` to `{5}` (only Stream Deck)
- `READY_REQUIRED` changes from `{3, 4}` to `{2, 3}` (Twitch + OBS at their new indices)

### Files removed

- `src/renderer/src/components/onboarding/NotionStep.tsx` — deleted entirely
- `src/renderer/src/components/onboarding/WelcomeStep.tsx` — deleted entirely

### Files modified

**`src/renderer/src/components/OnboardingWizard.tsx`**
- Drop imports of `NotionStep` and `WelcomeStep`
- Remove the two step entries from `STEP_KEYS`
- Update `SKIPPABLE` and `READY_REQUIRED` sets
- Update the `step === N` render branches to match the new 0–6 indices

**`src/renderer/src/components/onboarding/ProfileStep.tsx`**
- Prepend a welcome header above the existing profile content:
  ```tsx
  <div className="welcome-icon" role="img" aria-label="Welcome">🔬</div>
  <h1>{t('onboarding.welcome_title')}</h1>
  <p className="welcome-text">{t('onboarding.welcome_text')}</p>
  ```
- Existing `<h1>{t('profile.title')}</h1>` becomes `<h2>` (Welcome owns the h1)
- No other changes to logic / profile selection

**`src/renderer/src/components/onboarding/DoneStep.tsx`**
- Remove the `useApi<{ configured: boolean }>('/settings/notion')` call and the `notionInfo`/`notionDone` references
- Remove the `Notion (optional)` row from the `items` checklist
- `canFinish` stays gated on Twitch + OBS (unchanged behavior)

**`src/renderer/src/i18n/translations.ts`**
- Remove keys: `onboarding.step.welcome`, `onboarding.step.notion`, `onboarding.welcome_sub`
- Keep keys: `onboarding.welcome_title`, `onboarding.welcome_text` (now used by ProfileStep)
- Keep all `notion.*` keys (still used by SettingsPanel + NotionDatabasePicker + NotionSetupModal)
- Keep all other step keys

### Wizard render block (after changes)

```tsx
{step === 0 && <LanguageStep onNext={next} />}
{step === 1 && <ProfileStep />}
{step === 2 && <TwitchStep onReady={onStepReady} />}
{step === 3 && <ObsStep onReady={onStepReady} />}
{step === 4 && <OverlaysStep />}
{step === 5 && <StreamDeckStep />}
{step === 6 && <DoneStep onFinish={finish} />}
```

## Verification

Manual verification (user runs the dev server — Claude does not start processes per CLAUDE.md):

- Fresh install / reset onboarding-completed flag → wizard shows 7-dot step indicator
- Step order matches the table above
- Step 1 shows welcome icon + title + text on top of profile cards
- Step 5 (Stream Deck) shows Skip button
- "Finish" only enabled when both Twitch and OBS are connected
- After completing onboarding, Notion can still be set up via Settings panel (token field, database picker, ClipsPanel sync works)
- Both DE and EN languages render correctly with no missing translation keys
- `npm run typecheck` passes
- `npm run lint` passes

## Risks & edge cases

- **In-flight onboarding state:** the wizard does not persist mid-flow position — the `step` state is component-local and resets each app launch. The `onboarding-completed` flag persists only the binary done/not-done state. So users mid-onboarding when they update get a fresh start. No migration needed.
- **Orphaned translation keys:** only the 3 keys named above will be deleted. `TranslationKey` is a TypeScript union derived from the translations map, so any unintended deletion will surface as a `tsc` error immediately. The plan is bounded.
- **Shared CSS classes** (`.welcome-icon`, `.welcome-step`, `.onboarding-step`, `.welcome-text`): still used by `LanguageStep`, `DoneStep`, and the new ProfileStep header. No CSS changes needed.
- **No backend / API / DB / WebSocket changes.** Server bootup behavior, schema, migrations all unaffected.

## Out of scope (deferred)

- Optional-hub UI (Variant C) — only worth doing if more optional integrations are added later
- Visual polish of the merged Welcome+Profile step beyond the markup shown above
- Reworking how the Settings panel surfaces Notion (it's already accessible there)

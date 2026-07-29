# i18n Completion: Full Translation Support

**Date:** 2026-04-17
**Status:** Approved

## Goal

Replace all ~120 hardcoded German strings with the existing `t()` i18n system, add English translations, restructure help docs for multi-language support, and add language selection to the onboarding wizard.

## Architecture

### Translations System (existing, extended)

- `src/renderer/src/i18n/translations.ts` gets ~110-120 new keys for panels + onboarding
- Structure stays: `{ de: '...', en: '...' }` per key
- New languages: add values per key + extend `Lang` type

### Dynamic String Interpolation Pattern

The existing `t()` function returns a plain string with no interpolation. For strings with variables, use this pattern:

```tsx
// Static part via t(), variable via JS template literal
`${t('settings.connected_to', lang)} #${botStatus.channel}`

// For conditional fragments
`${obsConfig.host}:${obsConfig.port} ${t(obsConfig.has_password ? 'settings.with_password' : 'settings.without_password', lang)}`

// For count-based strings
`${t('panel.section_done', lang)} (${done.length})`
```

No changes to `t()` function signature needed. Static text parts get translation keys, variables stay as JS expressions.

### Help Documentation (restructured)

- `src/renderer/src/docs/help-de.ts` — existing German content (renamed from help.ts)
- `src/renderer/src/docs/help-en.ts` — English translation
- `src/renderer/src/docs/help.ts` — exports a map: `{ de: HELP_SECTIONS_DE, en: HELP_SECTIONS_EN }`

The map approach is simplest since `help.ts` is a plain module without React context access. `HelpPanel.tsx` reads `lang` from context and indexes the map.

### Onboarding Language Selection (new)

- New `LanguageStep` component as Step 0 in the wizard (before WelcomeStep)
- Two buttons: "Deutsch" / "English"
- Uses existing `setLang()` from `LanguageContext` which persists to `localStorage` (no API call needed)

### Onboarding Step Index Shift

Adding LanguageStep as Step 0 means:
- `STEPS` array gets a new entry at index 0
- `SKIPPABLE` set indices must shift: `new Set([3, 5])` → `new Set([4, 6])` (Notion and StreamDeck)
- Step dot navigation must account for the new step

## Detailed Changes

### 1. translations.ts — New Keys

Add ~110-120 new translation keys covering:

**Panel descriptions & labels (~50 keys):**
- TodosPanel: panel desc, placeholder, empty state, section headers
- RewardsPanel: panel desc, empty state, section headers, buttons
- ClipsPanel: placeholder, empty state, buttons, date labels
- StatsPanel: loading text, all stat card labels (10 labels)
- ChallengePanel: panel desc, placeholder, button labels, status text, chat command descs
- IssuesPanel: panel desc, placeholder, button states, section headers
- SettingsPanel: all section titles, descriptions, status texts, button labels, including:
  - Twitch section (~8 keys)
  - Notion section (~6 keys)
  - OBS section (~8 keys)
  - Stream Deck token section (~3 keys)
  - Autostart section (~4 keys: title, desc, "Aktiviert", "Deaktiviert")
  - Backup section (~6 keys: title, desc, export/import buttons, success/error messages)
  - Theme/Design section (~2 keys)
  - Wizard restart section (~2 keys)
- OverlaysPanel: section titles, button labels, empty state
- MilestonesPanel: empty state, section header
- ProgressPanel: placeholder, empty state, button
- HelpPanel: title, desc
- ChatPanel: connection message
- SongPanel: desc, placeholder, buttons
- DesignsPanel: desc, placeholder, button labels, status text
- HotkeysPanel: all hotkey labels, desc, format hint, buttons, save confirmation
- RaidsPanel: desc, empty state, labels

**Onboarding strings (~30 keys):**
- WelcomeStep: title, text, subtitle, button (some already exist as keys)
- TwitchStep: all setup instructions, status messages, buttons
- ObsStep: all setup instructions, status messages, buttons
- NotionStep: all setup instructions, placeholders, status messages
- OverlaysStep: instructions, available overlays text, hints
- StreamDeckStep: instructions, button labels, hints
- DoneStep: titles, warnings, hints, button
- OnboardingWizard: navigation buttons (back, next, skip, finish)

**Component strings (~5 keys):**
- ErrorBoundary: error title, error message, retry button
- ChatCommands: section label

**New language step (~3 keys):**
- LanguageStep: title, subtitle

**Fix existing:** `panel.issues` English value should be `'Lucky Wheel'` not `'Glücksrad'`

### 2. Panel Files — Replace Hardcoded Strings

All 16 panel files in `src/renderer/src/panels/`:
- Import `useLanguage` hook (or `t` + `lang` from context)
- Replace every hardcoded German string with `t('key', lang)` call
- For dynamic strings with variables: use the interpolation pattern defined above
- No logic changes, no visual changes

Files:
- `TodosPanel.tsx`
- `RewardsPanel.tsx`
- `ClipsPanel.tsx`
- `StatsPanel.tsx`
- `ChallengePanel.tsx`
- `IssuesPanel.tsx`
- `SettingsPanel.tsx` (largest file, ~35-40 keys)
- `OverlaysPanel.tsx`
- `MilestonesPanel.tsx`
- `ProgressPanel.tsx`
- `HelpPanel.tsx`
- `ChatPanel.tsx`
- `SongPanel.tsx`
- `DesignsPanel.tsx`
- `HotkeysPanel.tsx`
- `RaidsPanel.tsx`

### 3. Onboarding Files — Replace Hardcoded Strings

All 7 onboarding files + wizard:
- `WelcomeStep.tsx`
- `TwitchStep.tsx`
- `ObsStep.tsx`
- `NotionStep.tsx`
- `OverlaysStep.tsx`
- `StreamDeckStep.tsx`
- `DoneStep.tsx`
- `OnboardingWizard.tsx`

Many of these already have translation keys defined but unused. Wire them up.

### 4. Component Files

- `ErrorBoundary.tsx` — This is a class component and cannot use `useTranslation()` hook. Solution: pass translated strings via props from the parent, or convert the error display to a functional child component that accesses context.
- `ChatCommands.tsx` — Translate the "Chat Commands" label

### 5. Help Documentation — Restructure

**Create:** `src/renderer/src/docs/help-de.ts`
- Move existing `HELP_SECTIONS` array from `help.ts`
- Export as `HELP_SECTIONS_DE`

**Create:** `src/renderer/src/docs/help-en.ts`
- English translation of all 12 help sections
- Export as `HELP_SECTIONS_EN`

**Modify:** `src/renderer/src/docs/help.ts`
- Import both language files
- Export a map: `const HELP_SECTIONS: Record<Lang, HelpSection[]> = { de: HELP_SECTIONS_DE, en: HELP_SECTIONS_EN }`

**Modify:** `HelpPanel.tsx`
- Use current language from context to index the map

### 6. Language Step in Onboarding

**Create:** `src/renderer/src/components/onboarding/LanguageStep.tsx`
- Simple component with two large buttons: "Deutsch" / "English"
- On selection: calls `setLang()` from `LanguageContext` (persists to localStorage automatically)
- No back button (it's the first step)

**Modify:** `OnboardingWizard.tsx`
- Add LanguageStep as Step 0 (before WelcomeStep)
- Update `STEPS` array and `SKIPPABLE` indices accordingly
- Ensure navigation buttons use `t()` (keys already exist: `onboarding.back`, `onboarding.next`, `onboarding.skip`, `onboarding.finish`)

### 7. Settings Panel — Language Switcher

Already exists partially. Ensure:
- Language dropdown in Settings works with the new translation keys
- Changing language refreshes all translated strings immediately (already handled by LanguageContext re-render)

## What Does NOT Change

- `t()` function signature and LanguageContext implementation
- Overlay HTML files (stay in German, only visible to streamer in OBS)
- Bot chat messages (stay in German, sent to Twitch chat)
- API error messages (stay in English, technical)
- Server-side code (no i18n needed)
- Database schema

## New Language Extensibility

Adding a new language (e.g. French) requires:
1. Add `'fr'` to the `Lang` type in translations.ts
2. Add `fr: '...'` to every translation key
3. Create `help-fr.ts` with French help sections
4. Add French option to LanguageStep

## Risk

- Medium effort: ~110-120 new translation keys + English help docs
- Low risk: purely additive, no logic changes
- ErrorBoundary class component needs careful handling (cannot use hooks)
- Biggest risk: translation quality for English help docs (consider having a native speaker review)

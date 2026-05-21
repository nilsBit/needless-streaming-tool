# Onboarding Rewrite Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trim the first-run onboarding wizard from 9 to 7 steps by removing the Notion setup step and folding the decorative Welcome splash into the Profile step.

**Architecture:** Renderer-only change. Edit `OnboardingWizard.tsx` to drop two step entries and renumber the `SKIPPABLE` / `READY_REQUIRED` sets. Prepend a welcome header to `ProfileStep.tsx`. Strip the Notion checklist item from `DoneStep.tsx`. Delete the two unused step files. Remove three orphaned i18n keys. No backend, API, or DB changes.

**Tech Stack:** React + TypeScript (Vite-bundled renderer). Verification via `npm run typecheck` and `npm run lint`. Manual smoke test in the running dev session (Nodemon auto-reloads — do NOT start or restart processes).

**Spec reference:** `docs/superpowers/specs/2026-05-21-onboarding-rewrite-design.md`

**Workflow notes for executor:**
- Do NOT run `npm run dev`, `npm run build`, `npm start`, or any process that binds to ports. The user's Nodemon-driven dev server is already running.
- Batch related edits inside a single task to minimize Nodemon restart churn.
- Verification is `npm run typecheck` and `npm run lint` only; manual UI verification is the user's responsibility (he will run through the wizard after the plan completes).

---

## Task 1: Prepend welcome header to ProfileStep

**Files:**
- Modify: `src/renderer/src/components/onboarding/ProfileStep.tsx`

**Goal:** Make ProfileStep show the welcome icon + title + text on top, so it becomes the new step-1 landing page once the standalone Welcome splash is removed in Task 2.

- [ ] **Step 1: Read the current ProfileStep file**

Read `/Users/nilsrobatscher/stream-toolkit/src/renderer/src/components/onboarding/ProfileStep.tsx` to confirm the JSX matches what's listed below.

- [ ] **Step 2: Replace the rendered JSX block**

The current JSX inside `return (...)` is:

```tsx
<div className="onboarding-step">
  <h1>{t('profile.title')}</h1>
  <p className="welcome-text">{t('profile.subtitle')}</p>
  <div className="profile-grid">
    {PROFILES.map(p => (
      …unchanged…
    ))}
  </div>
</div>
```

Change it to:

```tsx
<div className="onboarding-step">
  <div className="welcome-icon" role="img" aria-label="Welcome">🔬</div>
  <h1>{t('onboarding.welcome_title')}</h1>
  <p className="welcome-text">{t('onboarding.welcome_text')}</p>
  <h2>{t('profile.title')}</h2>
  <p className="welcome-text">{t('profile.subtitle')}</p>
  <div className="profile-grid">
    {PROFILES.map(p => (
      …unchanged…
    ))}
  </div>
</div>
```

Three concrete edits in this file:
1. Insert the `<div className="welcome-icon">…</div>` line as the first child of the root `<div>`.
2. Insert `<h1>{t('onboarding.welcome_title')}</h1>` and `<p className="welcome-text">{t('onboarding.welcome_text')}</p>` after it.
3. Change the existing `<h1>{t('profile.title')}</h1>` line to `<h2>{t('profile.title')}</h2>`.

Do NOT touch the imports, `PROFILES` constant, state, or `selectProfile` handler.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: passes. If a TypeScript error mentions an unknown translation key, double-check that `onboarding.welcome_title` and `onboarding.welcome_text` still exist in `translations.ts` (they should — they are kept per spec).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/onboarding/ProfileStep.tsx
git commit -m "$(cat <<'EOF'
feat(onboarding): fold welcome header into profile step

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Rewire OnboardingWizard and delete the WelcomeStep file

**Files:**
- Modify: `src/renderer/src/components/OnboardingWizard.tsx`
- Delete: `src/renderer/src/components/onboarding/WelcomeStep.tsx`

**Goal:** New 7-step linear flow with correct skip and ready-gate sets, and no orphaned imports.

**Important — do NOT delete `NotionStep.tsx`.** It is still imported by `NotionSetupModal.tsx` (which `SettingsPanel.tsx` and `ClipsPanel.tsx` use for the in-app Notion setup modal). After this task it just stops being used from the onboarding wizard; the modal usage continues. Only `WelcomeStep.tsx` is safe to delete because nothing else imports it.

- [ ] **Step 1: Read the current wizard**

Read `/Users/nilsrobatscher/stream-toolkit/src/renderer/src/components/OnboardingWizard.tsx`.

- [ ] **Step 2: Update imports**

Remove these two import lines:

```tsx
import WelcomeStep from './onboarding/WelcomeStep';
import NotionStep from './onboarding/NotionStep';
```

Keep all other imports as-is.

- [ ] **Step 3: Replace STEP_KEYS, SKIPPABLE, READY_REQUIRED**

Current:

```tsx
const STEP_KEYS = [
  'onboarding.step.language', 'onboarding.step.profile', 'onboarding.step.welcome',
  'onboarding.step.twitch', 'onboarding.step.obs', 'onboarding.step.notion',
  'onboarding.step.overlays', 'onboarding.step.streamdeck', 'onboarding.step.done',
] as const;
const SKIPPABLE = new Set([5, 7]); // Notion, Stream Deck
const READY_REQUIRED = new Set([3, 4]); // Twitch, OBS
```

Replace with:

```tsx
const STEP_KEYS = [
  'onboarding.step.language', 'onboarding.step.profile',
  'onboarding.step.twitch', 'onboarding.step.obs',
  'onboarding.step.overlays', 'onboarding.step.streamdeck', 'onboarding.step.done',
] as const;
const SKIPPABLE = new Set([5]); // Stream Deck
const READY_REQUIRED = new Set([2, 3]); // Twitch, OBS
```

- [ ] **Step 4: Replace the step-content render block**

Current block:

```tsx
{step === 0 && <LanguageStep onNext={next} />}
{step === 1 && <ProfileStep />}
{step === 2 && <WelcomeStep />}
{step === 3 && <TwitchStep onReady={onStepReady} />}
{step === 4 && <ObsStep onReady={onStepReady} />}
{step === 5 && <NotionStep onComplete={next} />}
{step === 6 && <OverlaysStep />}
{step === 7 && <StreamDeckStep />}
{step === 8 && <DoneStep onFinish={finish} />}
```

Replace with:

```tsx
{step === 0 && <LanguageStep onNext={next} />}
{step === 1 && <ProfileStep />}
{step === 2 && <TwitchStep onReady={onStepReady} />}
{step === 3 && <ObsStep onReady={onStepReady} />}
{step === 4 && <OverlaysStep />}
{step === 5 && <StreamDeckStep />}
{step === 6 && <DoneStep onFinish={finish} />}
```

- [ ] **Step 5: Delete only the WelcomeStep file**

```bash
rm src/renderer/src/components/onboarding/WelcomeStep.tsx
```

**Do NOT delete `NotionStep.tsx`** — it is still imported by `src/renderer/src/components/NotionSetupModal.tsx:2`, which in turn is rendered by `ClipsPanel.tsx` (and reachable from `SettingsPanel.tsx`) for the in-app Notion setup modal. After Task 2 it is simply no longer reached from the onboarding wizard; its modal usage continues unchanged. Also leave `NotionDatabasePicker.tsx`, `NotionSetupModal.tsx`, and `ClipSyncBadge.tsx` alone.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: passes. If you see `Cannot find module './onboarding/WelcomeStep'`, check that nothing else still imports it:

```bash
grep -rn "from ['\"].*onboarding/WelcomeStep['\"]" src/ || echo "no remaining WelcomeStep imports"
```

Expected output: `no remaining WelcomeStep imports`.

`NotionStep` should NOT have been deleted, so any error mentioning it indicates a mistake in Step 5 — restore the file if needed.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/OnboardingWizard.tsx src/renderer/src/components/onboarding/WelcomeStep.tsx
git commit -m "$(cat <<'EOF'
feat(onboarding): drop notion + welcome steps, rewire to 7-step flow

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

(`git add` stages the WelcomeStep.tsx deletion alongside the wizard edits. `NotionStep.tsx` is unchanged on disk.)

---

## Task 3: Strip Notion from DoneStep checklist

**Files:**
- Modify: `src/renderer/src/components/onboarding/DoneStep.tsx`

**Goal:** Final-step recap no longer references Notion.

- [ ] **Step 1: Read DoneStep**

Read `/Users/nilsrobatscher/stream-toolkit/src/renderer/src/components/onboarding/DoneStep.tsx`.

- [ ] **Step 2: Remove the Notion API call**

Delete this line:

```tsx
const { data: notionInfo } = useApi<{ configured: boolean }>('/settings/notion');
```

- [ ] **Step 3: Remove the notionDone variable**

Delete this line:

```tsx
const notionDone = !!notionInfo?.configured;
```

- [ ] **Step 4: Remove the Notion item from the items array**

Current:

```tsx
const items = [
  { label: 'Twitch', done: twitchDone, required: true },
  { label: 'OBS', done: obsDone, required: true },
  { label: `Notion (${t('done.optional')})`, done: notionDone, required: false },
];
```

Replace with:

```tsx
const items = [
  { label: 'Twitch', done: twitchDone, required: true },
  { label: 'OBS', done: obsDone, required: true },
];
```

Do NOT change anything else — `canFinish`, the JSX, the WebSocket subscription all stay as-is.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: passes. If `t('done.optional')` is now flagged as unused, that's expected — Step 6 will look at whether to delete it. For Task 3 keep `done.optional` in translations; it may be reused elsewhere.

Sanity check that `done.optional` is not still referenced:

```bash
grep -rn "done\.optional" src/ || echo "no references to done.optional"
```

If output is `no references…`, note this for follow-up but **do not delete** the key as part of Task 3 (translations cleanup happens in Task 4 and only touches the three keys the spec lists).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/onboarding/DoneStep.tsx
git commit -m "$(cat <<'EOF'
feat(onboarding): remove notion entry from done-step checklist

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Remove orphaned translation keys

**Files:**
- Modify: `src/renderer/src/i18n/translations.ts`

**Goal:** Delete the three i18n keys that are no longer referenced anywhere: `onboarding.step.welcome`, `onboarding.step.notion`, `onboarding.welcome_sub`.

- [ ] **Step 1: Safety grep**

Before deleting, confirm nothing in the repo still references these keys:

```bash
grep -rn "'onboarding.step.welcome'\|\"onboarding.step.welcome\"" src/ || echo "no refs to onboarding.step.welcome"
grep -rn "'onboarding.step.notion'\|\"onboarding.step.notion\"" src/ || echo "no refs to onboarding.step.notion"
grep -rn "'onboarding.welcome_sub'\|\"onboarding.welcome_sub\"" src/ || echo "no refs to onboarding.welcome_sub"
```

Expected: all three print "no refs to …". If any reference remains, stop and surface it — the spec assumes these are orphaned and any remaining reference is a bug in the spec/plan.

- [ ] **Step 2: Read the translations file**

Read `/Users/nilsrobatscher/stream-toolkit/src/renderer/src/i18n/translations.ts` (full file).

- [ ] **Step 3: Delete the three lines**

Remove these three exact lines (each defined once in the translation map):

```ts
'onboarding.welcome_sub': { de: 'Lass uns in ein paar Schritten alles einrichten.', en: 'Let\'s set everything up in a few steps.' },
'onboarding.step.welcome': { de: 'Willkommen', en: 'Welcome' },
'onboarding.step.notion': { de: 'Notion', en: 'Notion' },
```

Keep `onboarding.welcome_title`, `onboarding.welcome_text`, and all `notion.*` keys (still used by SettingsPanel / NotionDatabasePicker / NotionSetupModal).

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: passes. `TranslationKey` is a union derived from the translations map — if any source file still references a deleted key, tsc will fail with a clear error. If it does, restore the offending key and surface the conflict.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/i18n/translations.ts
git commit -m "$(cat <<'EOF'
chore(i18n): remove orphaned onboarding keys

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Final verification & hand-off

**Goal:** Confirm the codebase compiles and lints clean, then surface the change to the user for manual UI verification.

- [ ] **Step 1: Typecheck (whole project)**

Run: `npm run typecheck`
Expected: passes with no errors.

- [ ] **Step 2: Lint (whole project)**

Run: `npm run lint`
Expected: passes with no errors.

- [ ] **Step 3: Git log sanity**

Run: `git log --oneline -5`
Expected: see the four commits from Tasks 1–4 in order.

- [ ] **Step 4: Diff summary**

Run: `git diff --stat <branch-base>..HEAD` (or `git log --stat -5`) so the user can see the changed files at a glance.

- [ ] **Step 5: Hand-off message**

Report to the user:

> Onboarding-Rewrite ist umgesetzt. Vier Commits, alle typecheck + lint sauber. Bitte einmal durch den Wizard klicken (Settings → Onboarding zurücksetzen oder DB-Eintrag/Flag manuell zurücksetzen) und folgendes prüfen:
> - 7 Step-Dots im Indicator
> - Step 1 zeigt Welcome-Header (🔬 + "Willkommen bei NST!" + Beschreibung) über den Profilkarten
> - Step 5 hat einen Skip-Button (Stream Deck)
> - "Fertig"-Button nur aktiv wenn Twitch + OBS verbunden
> - Notion in Settings funktioniert weiterhin (Token, DB-Picker, Clip-Sync)
> - DE und EN durchprobieren

Do NOT start, restart, or kill any dev process — Nodemon will have already hot-reloaded between edits. The user manages their own dev server (see CLAUDE.md).

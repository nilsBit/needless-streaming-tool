# UX Foundation + Progress/Todos Vertical Slice

**Date:** 2026-04-20
**Status:** Approved
**Research reference:** `memory/reference_ux_patterns_catalog.md`

## Problem

Stream Toolkit's end-user is a non-technical streamer, but the current UI leaves them alone with empty panels, silent failures, and discovery-by-trial. The recent sub-todos change exposed this bluntly: the user activated a Kanban item, opened the todos overlay, saw nothing, and had no way to know what was supposed to happen next. A single fix for that one flow will not scale — every feature has the same kind of silent hand-off between panels, and every panel has its own "how do I even start" gap.

Prior fixes added inline hints and toasts ad-hoc, but without shared primitives the patterns drift, copy is inconsistent, and the app has no vocabulary for "first-touch guidance vs. recurring push vs. pull help".

## Goal

Establish a small, research-backed UX foundation the whole project will reuse, and prove it works by fully applying it to the **Progress/Kanban + Todos-Overlay** flow (the current pain point). This gives us:

1. **Principles** everyone (and future specs) can cite.
2. **Shared components** — one empty-state, one try-this badge, one error-toast, one celebrate helper, one first-touch hook — dropped into new panels as needed, not reinvented.
3. **A working reference implementation** in the Progress/Todos flow, so the patterns have a concrete use site.

Subsequent UX specs apply the same foundation to other panels (Onboarding, Clips, Chat, Songs, Overlays, Designs, Milestones, Raids, Issues) without re-deriving the patterns.

## Non-Goals

- Command-Palette (`Ctrl+K`) — deferred to a later spec; touches every panel and needs an action registry.
- Keyboard shortcut overlay (`?`) — follows the palette.
- Persistent setup checklist pinned to the app chrome — needs app-wide integration-status plumbing.
- Connection-status footer — needs integration-health polling layer.
- Live-mode toggle — needs "what is destructive mid-stream" catalog per panel.
- Onboarding-wizard redesign (Twitch OAuth flow, OBS auto-detection, Notion onboarding polish) — own spec.
- Per-panel UX application beyond Progress/Todos — each gets its own spec reusing this foundation.
- Automated tests — project convention is `typecheck` + `lint` + manual QA.
- Achievement/gamification systems, streaks, XP.
- Modal "click-here, next, next" onboarding tours (research consensus: strongest anti-pattern).

## Principles

The three principles synthesized from research and adopted project-wide:

1. **Respect the user's time and screen real estate.** Prefer pull-based help (palette, `?`, tooltip on hover) over push-based (badges, toasts) over modals. Every modal is a small hostage situation. Never block mid-stream work.
2. **Teach through the product, not around it.** Every empty state is a free onboarding slide the wizard didn't have to shove in front of the user. Seeded examples, teachable empty states, ghost hints, contextual tooltips beat any tour.
3. **Make success visible and failure recoverable.** 200–400ms microinteractions confirm things worked; error copy explains WHAT broke + one primary action + details-on-demand. A non-technical user builds trust on cause-and-effect they can see.

## Copy Tone

- **Short, respectful, not childish.** "Noch keine Clips — drück `Strg+Shift+C` zum Speichern" beats "Yay! Lass uns deinen allerersten Clip erstellen! 🎉".
- **User-centric, not product-centric.** "Verbinde Twitch, damit dein Chat erscheint" beats "Stream Toolkit benötigt eine Twitch-Authentifizierung".
- **Consistent DE (primary) + EN (per existing i18n).**
- **Emojis intentional, not decorative.** Status indicators (✅ ⚠️ 🔴), empty-state anchors (📺 📋 🎬), section emojis. Not "🎉🎉🎉 perfekt! 🎊".
- **Error-toast template:** `{what broke in one line}` + `[Primary Action]` + `[Details anzeigen]`. Technical detail one click away, never primary.

## Architecture Overview

| Layer | Change |
|-------|--------|
| Frontend `src/renderer/src/components/ux/` (new directory) | `EmptyState.tsx`, `TryThisBadge.tsx`, `ErrorToast.tsx`, `celebrate.ts`, `useFirstTouch.ts` |
| Frontend `src/renderer/src/panels/ProgressPanel.tsx` | Applies all new components; uses example-seed; Trello-style card progress bar; Things-style active flag |
| Frontend `src/overlays/todos/index.html` | Improved empty-state copy when active item has no sub-todos |
| Frontend `src/renderer/src/index.css` | Celebrate keyframes + prefers-reduced-motion handling + styles for the new components |
| Frontend `src/renderer/src/i18n/translations.ts` | New keys (`empty.*`, `try_this.*`, `celebrate.*`, `progress.seed_*`) |
| Backend `src/server/api/progress.ts` | New endpoint `POST /progress/seed-examples` |
| Settings | New key namespace `ux_hint_seen_<name>` (no schema change — uses existing `settings` table) |

No DB migration required. No WebSocket event additions — existing `progress-update` covers the seeded-examples broadcast.

## Shared UX Components

All live in `src/renderer/src/components/ux/`. Dumb components (no global side-effects, state via hooks). Each file has one responsibility.

### `EmptyState.tsx`

One empty-state component, used app-wide.

```tsx
interface EmptyStateProps {
  icon: string;                 // emoji
  title: string;                // short headline
  description?: string;         // 1-2 sentences
  cta?: { label: string; onClick: () => void };
  secondaryCta?: { label: string; onClick: () => void };  // e.g. "Beispiele einfügen"
  arrow?: 'up' | 'down' | 'left' | 'right';
  size?: 'normal' | 'compact';  // panel vs. sub-section
}
```

Rendered as centered card with dashed border, icon, title, description, CTA button. `arrow` renders a subtle animated arrow pointing to the adjacent CTA or off-component target (purely decorative, CSS-only).

### `TryThisBadge.tsx`

Persistent red-dot badge. Disappears permanently when `done` becomes true.

```tsx
interface TryThisBadgeProps {
  hint: string;               // tooltip text shown on hover/focus
  done: boolean;              // when true: nothing renders
  children: React.ReactNode;  // wrapped target (e.g. a button)
}
```

Renders `children` unchanged; adds an absolutely-positioned red dot with `pulse` animation on the top-right of the child. On hover, a subtle tooltip appears. When `done === true`, the badge is not rendered and the dot pulse stops immediately. No dismissal — the action completion is the dismissal.

### `ErrorToast.tsx`

Standardizes the error-toast format across the app. Extends the existing `ToastContext` with a new method:

```tsx
toast.errorAction({
  message: string;                                   // one-line
  action?: { label: string; onClick: () => void };   // primary recovery
  details?: string;                                  // one-click expand
});
```

Implementation adds an `errorAction` method to the existing toast context; falls back to `toast.error(message)` when no action/details. Details render as `[Details anzeigen ▸]` that expands inline (never opens another modal).

Adopting sites should migrate from `toast.error('...')` to `toast.errorAction({...})` when a recovery action exists. This spec does not mass-migrate existing call sites — Progress/Todos will use the new API, others stay as-is until their own UX spec.

### `celebrate.ts`

Helper that triggers a short CSS animation on an element, respecting `prefers-reduced-motion`.

```ts
type CelebrateKind = 'check' | 'spark' | 'success';
export function celebrate(kind: CelebrateKind, el: HTMLElement | null): void;
```

Implementation: adds a `celebrate-<kind>` class, sets `animationend` listener to remove it. CSS defines keyframes in `index.css`. `prefers-reduced-motion: reduce` disables keyframes (fallback: immediate finish, no animation).

Kinds:
- `check` — 300ms soft green pulse
- `spark` — 400ms sparkle (simple radial glow)
- `success` — 400ms subtle pulse + brief border glow

No audio, no confetti, no libraries. CSS-only.

### `useFirstTouch.ts`

Hook tracking "has this hint been shown before".

```ts
export function useFirstTouch(name: string): {
  seen: boolean;
  markSeen: () => Promise<void>;
  loading: boolean;
};
```

Implementation:
- On mount, fetches `/api/settings/get/ux_hint_seen_${name}` via `useApi`.
- `seen` = response value === 'true'.
- `markSeen()` calls `POST /api/settings/set { key: 'ux_hint_seen_${name}', value: 'true' }` and optimistically flips local `seen` to `true`.
- `loading` is true until the initial fetch resolves (caller treats loading as "don't show hint yet").

Naming convention for hint names: `<panel>.<action>`, lowercase, underscore-separated action. Examples: `progress.activate_item`, `progress.first_todo_checked`, `clips.first_clip`, `chat.first_command`. The same key is reusable across sessions.

## Application to Progress + Todos

### Kanban empty state

When `items.length === 0`:

```
┌──────────────────────────────────────────┐
│                 📋                       │
│       Dein Kanban ist leer               │
│  Features & Tasks, die du streamst,      │
│  verwaltest du hier. Fang klein an.      │
│                                          │
│      [➕ Erstes Feature anlegen]         │
│                                          │
│  oder lass mich 3 Beispiele für dich     │
│  anlegen: [Beispiele einfügen]           │
└──────────────────────────────────────────┘
```

Implementation:
- Replaces the current "Hier Features fallen lassen" empty copy inside `renderColumn('pending', ...)` with `<EmptyState>`.
- Secondary CTA "Beispiele einfügen" calls `POST /api/progress/seed-examples`.
- After seeding: items appear via existing `progress-update` WS event → normal refetch.
- The empty state replaces the entire kanban board (all three columns) when zero items exist, not just the backlog column — cleaner signal.

### Kanban card inline checklist progress

When an item has ≥1 sub-todo, show progress on the card face (Trello pattern):

```
┌────────────────────────────────────────┐
│ 🔨  Build overlay system      2/5  ──▃ │
└────────────────────────────────────────┘
```

- Badge: `☑ {done}/{total}` replaces the existing `{doneTodos.length}/{todos.length} ✓` text.
- Thin progress bar under the header row (2px), width = `done/total * 100%`, fills with `--accent` when < 100%, `--color-accent-rgb` (green) when done.
- When all todos done: bar is full green + item title gets strikethrough styling (no state change on the item itself).

### First-Touch on item activation

The existing hint in ProgressPanel (commit `160c0ca`) is enhanced:

- Replace the unconditional toast on activate with `useFirstTouch('progress.activate_item')`. Toast fires only when `seen === false`; after firing, call `markSeen()`.
- The auto-expand and autofocus behaviors stay as-is.
- Add a `TryThisBadge` on the sub-todo input wrapper:
  ```tsx
  <TryThisBadge hint={t('try_this.add_subtodo')} done={todos.length > 0}>
    <input ... />
  </TryThisBadge>
  ```
  Pulses until the first sub-todo exists for this item.

### First sub-todo completion celebrate

On the first time any sub-todo is toggled from `done: 0` → `done: 1`:

- Call `celebrate('check', checkboxRef)`.
- Use `useFirstTouch('progress.first_todo_checked')` — after firing, `markSeen()` so subsequent completions just check without fanfare.
- Toast: `t('celebrate.first_todo_done')` = "Erstes Task erledigt 🎯 — das erscheint live im Overlay."

### Todos-overlay empty-state improvement

Current: "KEIN AKTIVES FEATURE" or "KEINE TASKS VORHANDEN".

New (when active item exists but has zero sub-todos):

```
Feature: "{active title}"
Noch keine Sub-Tasks angelegt.
Füge welche in der App hinzu —
sie erscheinen hier live.
```

Implementation in `src/overlays/todos/index.html`:
- The existing `!projectTitle && total === 0` branch keeps "KEIN AKTIVES FEATURE" (truly no active item case).
- New branch: `projectTitle && total === 0` renders the new copy (three-line html injected into `#todoList`).

Keep the overlay purely read-only; no button to add todos from the overlay (viewers see this overlay, not the streamer).

### TryThis badges on key actions

Exactly two badges in this spec:

1. **"+" button in empty Kanban** — covered by the `<EmptyState>` CTA (no badge needed on that path; the empty state IS the guide).
2. **Sub-todo input in the active item** — `TryThisBadge` with `done={todos.length > 0}`, `hint` from i18n.

We deliberately do NOT add badges on the status-cycle button or the delete button — those actions are self-evident from the UI and a badge would be noise.

## Backend

### `POST /api/progress/seed-examples`

Creates 3 example kanban items with sub-todos, demonstrating real stream workflow patterns.

- Body: none.
- Idempotency: if any `project_items` rows already exist, returns `409 { error: 'already_has_items' }`. The client hides the "Beispiele einfügen" button in that case (empty state only shows when `items.length === 0`).
- Transaction: 3 items + their sub-todos in one transaction.
- Broadcasts `progress-update` with `{ action: 'items-seeded', count: 3 }` after commit.
- Response: `201 { items: [...] }` (full objects with their todos).

**Seeded content** (copied verbatim into code so implementers don't guess):

```ts
const EXAMPLES: Array<{ title: string; todos: string[] }> = [
  {
    title: '🎨 Intro überarbeiten',
    todos: [
      'Neue Musik aussuchen',
      'Titel-Card designen',
      'In OBS einfügen & testen',
    ],
  },
  {
    title: '🔧 Overlay-Set erneuern',
    todos: [
      'Farbschema festlegen',
      'Alerts stylen',
      'Chat-Box stylen',
    ],
  },
  {
    title: '🎮 Nächste Stream-Session planen',
    todos: [
      'Thema wählen',
      'Discord-Post vorbereiten',
    ],
  },
];
```

Examples are explicitly *streaming-specific*, not generic "Welcome" items — the goal is that the user can keep + edit them, not immediately delete.

All examples get `status: 'pending'`. None are pre-activated. Users choose which to activate themselves.

## Settings & Data Flow

### New settings keys

All `TEXT` values in the existing `settings` table. No schema migration.

```
ux_hint_seen_progress.activate_item        "true" | missing
ux_hint_seen_progress.first_todo_checked   "true" | missing
```

(Other `ux_hint_seen_*` keys will be added by subsequent UX specs when they introduce their own hints.)

### `useFirstTouch` data-flow

1. Mount → `useApi('/settings/get/ux_hint_seen_' + name)` → returns `{ value: string | null }`.
2. Derived: `seen = value === 'true'`.
3. `markSeen()` → `apiPost('/settings/set', { key: 'ux_hint_seen_' + name, value: 'true' })` + optimistic local `seen = true`.
4. No WebSocket propagation (hint-seen is per-session-ish; cross-session-sync via DB is enough).

### Example-seeding flow

1. User clicks "Beispiele einfügen" on the empty kanban.
2. Client POSTs `/api/progress/seed-examples`.
3. Server creates items + todos in a transaction, broadcasts `progress-update`.
4. Client receives WS → existing `refetch()` runs → kanban renders 3 items.
5. If server returns 409 (already has items), toast `error.already_has_items` — but the client should have hidden the button already so this is a defensive fallback.

### Reset-hints (future-proof, not UI-exposed here)

Deleting `settings` rows with `LIKE 'ux_hint_seen_%'` resets all first-touches. A later Help-panel spec will expose this as a button; for this slice, the backend query is documented but no UI.

## i18n

New keys added to `src/renderer/src/i18n/translations.ts`:

```ts
// Empty states (reusable across panels)
'empty.kanban.title': { de: 'Dein Kanban ist leer', en: 'Your kanban is empty' },
'empty.kanban.desc': { de: 'Features & Tasks, die du streamst, verwaltest du hier. Fang klein an.', en: 'Features and tasks you are streaming live here. Start small.' },
'empty.kanban.cta': { de: '➕ Erstes Feature anlegen', en: '➕ Create your first feature' },
'empty.kanban.secondary': { de: 'oder lass mich 3 Beispiele für dich anlegen:', en: 'or let me create 3 examples for you:' },
'empty.kanban.seed': { de: 'Beispiele einfügen', en: 'Insert examples' },

// Try-this hints
'try_this.add_subtodo': { de: 'Füge hier deine erste Sub-Task hinzu', en: 'Add your first sub-task here' },

// Celebrate toasts
'celebrate.first_todo_done': { de: 'Erstes Task erledigt 🎯 — das erscheint live im Overlay.', en: 'First task done 🎯 — it appears live on the overlay.' },

// Seed-examples
'progress.seed_success': { de: '3 Beispiele angelegt. Du kannst sie anpassen oder löschen.', en: '3 examples created. You can edit or delete them.' },
'progress.seed_error': { de: 'Konnte keine Beispiele einfügen.', en: 'Could not insert examples.' },

// Todos-overlay empty state (german-only UI, matches overlay language)
// Note: overlay uses hard-coded german copy (it always has); not part of i18n system.
```

## Verification

No automated tests; project convention is typecheck + lint + manual QA.

1. `npm run typecheck` → clean.
2. `npm run lint` → no new warnings.
3. **Manual QA paths:**
   - Fresh DB → open Progress panel → see new empty state with both CTAs visible.
   - Click "➕ Erstes Feature anlegen" → input focused → type a title → item created → empty state disappears.
   - Alternative: fresh DB → click "Beispiele einfügen" → 3 items with sub-todos appear → success toast.
   - Click "Beispiele einfügen" again (after seeding) → button is not visible (empty state is gone).
   - Expand an item with sub-todos → check one → green pulse animation on checkbox + toast (first time only).
   - Refresh page → check another sub-todo → no toast, just the check (first-touch already marked).
   - Card face shows `☑ 2/5` + progress bar; bar fills green when all done; title strikes through when 5/5.
   - Activate an item with no sub-todos → auto-expand + input focus + toast (first time only) + TryThisBadge pulse on input.
   - Add a sub-todo → badge pulse stops immediately; badge vanishes.
   - Open todos overlay with active item but no sub-todos → sees the new "Noch keine Sub-Tasks" copy, not "KEINE TASKS VORHANDEN".
   - Open todos overlay with no active item at all → still "KEIN AKTIVES FEATURE" (unchanged).
   - Set `prefers-reduced-motion: reduce` in DevTools → celebrate animations skip.
   - Language → EN → all new strings are English.

## Future Roadmap (not part of this spec)

The foundation shipped here is deliberately minimal. Future UX specs build on it:

| Future spec | Purpose |
|-------------|---------|
| Command-Palette (`Ctrl+K`) | Global action registry + searchable palette |
| Shortcut-Overlay (`?`) | Grouped keyboard-shortcut cheatsheet modal |
| Setup-Checklist | App-chrome top-bar progress widget ("3 of 5 done") |
| Connection-Status-Footer | Persistent colored-dot health indicators |
| Live-Mode-Toggle | Dim chrome + disable destructive actions mid-stream |
| Onboarding-Wizard 2.0 | Auto-config, one-click OAuth, pre-seeded workspace |
| UX application to Clips, Chat, Songs, Overlays, Designs, Milestones, Raids, Issues | One spec per panel; each reuses this foundation |

Each future spec is its own brainstorm → plan → implementation cycle, referencing this one for principles and components.

## Open Questions

None — all decisions are fixed in this spec.

# UX Foundation + Progress/Todos Vertical Slice — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a small, research-backed UX foundation (5 shared components) and prove it by fully applying it to the Progress/Kanban + Todos-Overlay flow.

**Architecture:** Five new dumb/stateless UX primitives under `src/renderer/src/components/ux/` (`EmptyState`, `TryThisBadge`, `celebrate`, `useFirstTouch`, extended `ToastContext`). A backend endpoint seeds example kanban items. `ProgressPanel` adopts all primitives; `todos` overlay gets better empty-state copy. No DB schema change — first-touch hints reuse the existing `settings` table.

**Tech Stack:** TypeScript, React, Electron, Vite, Express, better-sqlite3, existing i18n + toast infrastructure.

**Spec:** `docs/superpowers/specs/2026-04-20-ux-foundation-progress-todos-design.md`

**Memory reference:** `memory/reference_ux_patterns_catalog.md` — consult for any UX decision.

## Progress (as of 2026-04-20)

**Tasks 1–11: DONE + pushed to origin/main.** Commits:
- `c143e58` — Task 1 (celebrate() + keyframes)
- `ae4bae4` — Task 2 (useFirstTouch hook)
- `947740d` — Task 3 (EmptyState component)
- `e023e40` — Task 4 (TryThisBadge component)
- `1395fb1` — Task 5 (errorAction toast extension)
- `df40316` — Task 6 (i18n keys)
- `8c579e6` — Task 7 (/seed-examples backend)
- `9ef0e83` — Task 8 (ProgressPanel empty-state)
- `63c6d25` — Task 9 (Card progress bar + strikethrough)
- `26e08fa` — Task 10 (first-touch + celebrate)
- `6e60ba4` — Task 11 (overlay empty-state copy)

**Task 12 (Manual E2E QA): NOT STARTED.** Requires `npm run dev` + interactive QA (fresh-DB empty state, seed-examples, first-touch gates, celebrate animation, overlay copy, reduced-motion, i18n switch). See Task 12 section for the full checklist.

Baseline SHA before implementation: `1f6dd2f`.

**Conventions:**
- Projekt hat keine Automated Tests — Verifikation per `npm run typecheck` und `npm run lint`. Manuelle QA am Ende.
- Direkte Commits auf `main` sind für das Projekt freigegeben.
- Conventional commits.

---

## File Map

**Neu (unter `src/renderer/src/components/ux/`):**
- `EmptyState.tsx`
- `TryThisBadge.tsx`
- `celebrate.ts`
- `useFirstTouch.ts`

**Geändert:**
- `src/renderer/src/i18n/ToastContext.tsx` — neuer `errorAction`-Toast-Typ mit Action + Details
- `src/renderer/src/components/ToastContainer.tsx` — rendert neuen Typ
- `src/renderer/src/panels/ProgressPanel.tsx` — nutzt alle neuen Primitives
- `src/overlays/todos/index.html` — bessere Empty-State-Copy
- `src/renderer/src/index.css` — Celebrate-Keyframes + Component-Styles + `prefers-reduced-motion`
- `src/renderer/src/i18n/translations.ts` — neue Keys
- `src/server/api/progress.ts` — neuer `POST /progress/seed-examples`-Endpoint

Keine DB-Migration nötig.

---

## Task 1: `celebrate` helper + CSS keyframes

**Files:**
- Create: `src/renderer/src/components/ux/celebrate.ts`
- Modify: `src/renderer/src/index.css` (append keyframes + classes)

- [ ] **Step 1: Create celebrate helper**

Write `src/renderer/src/components/ux/celebrate.ts`:

```ts
export type CelebrateKind = 'check' | 'spark' | 'success';

export function celebrate(kind: CelebrateKind, el: HTMLElement | null): void {
  if (!el) return;
  const className = `celebrate-${kind}`;
  el.classList.remove(className);
  // Force reflow so the animation can restart if the class was just removed.
  void el.offsetWidth;
  el.classList.add(className);
  const onEnd = () => {
    el.classList.remove(className);
    el.removeEventListener('animationend', onEnd);
  };
  el.addEventListener('animationend', onEnd);
}
```

- [ ] **Step 2: Append CSS keyframes to `index.css`**

Append to the end of `src/renderer/src/index.css`:

```css
/* ---------- UX Foundation: celebrate() ---------- */
@keyframes celebrate-check {
  0%   { box-shadow: 0 0 0 0 rgba(46, 204, 113, 0.6); background-color: rgba(46, 204, 113, 0); }
  40%  { box-shadow: 0 0 0 8px rgba(46, 204, 113, 0); background-color: rgba(46, 204, 113, 0.25); }
  100% { box-shadow: 0 0 0 0 rgba(46, 204, 113, 0); background-color: rgba(46, 204, 113, 0); }
}
@keyframes celebrate-spark {
  0%   { filter: brightness(1) drop-shadow(0 0 0 rgba(74, 158, 255, 0)); }
  50%  { filter: brightness(1.3) drop-shadow(0 0 8px rgba(74, 158, 255, 0.8)); }
  100% { filter: brightness(1) drop-shadow(0 0 0 rgba(74, 158, 255, 0)); }
}
@keyframes celebrate-success {
  0%   { box-shadow: 0 0 0 0 rgba(74, 158, 255, 0.5); }
  50%  { box-shadow: 0 0 0 6px rgba(74, 158, 255, 0); }
  100% { box-shadow: 0 0 0 0 rgba(74, 158, 255, 0); }
}
.celebrate-check   { animation: celebrate-check   300ms ease-out both; }
.celebrate-spark   { animation: celebrate-spark   400ms ease-out both; }
.celebrate-success { animation: celebrate-success 400ms ease-out both; }

@media (prefers-reduced-motion: reduce) {
  .celebrate-check, .celebrate-spark, .celebrate-success { animation: none; }
}
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/ux/celebrate.ts src/renderer/src/index.css
git commit -m "feat(ux): add celebrate() helper with 3 keyframes + reduced-motion support"
```

---

## Task 2: `useFirstTouch` hook

**Files:**
- Create: `src/renderer/src/components/ux/useFirstTouch.ts`

Backend endpoints already exist (`GET /api/settings/get/:key`, `POST /api/settings/set`). Hook wraps them with optimistic local state.

- [ ] **Step 1: Create the hook**

Write `src/renderer/src/components/ux/useFirstTouch.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost } from '../../hooks/useApi';

interface Result {
  seen: boolean;
  loading: boolean;
  markSeen: () => Promise<void>;
}

export function useFirstTouch(name: string): Result {
  const key = `ux_hint_seen_${name}`;
  const [seen, setSeen] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    apiGet<{ value: string | null }>(`/settings/get/${encodeURIComponent(key)}`).then((data) => {
      if (cancelled) return;
      setSeen(data?.value === 'true');
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [key]);

  const markSeen = useCallback(async () => {
    setSeen(true); // optimistic
    await apiPost('/settings/set', { key, value: 'true' });
  }, [key]);

  return { seen, loading, markSeen };
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: passes. `apiGet` was added in an earlier feature and is already exported from `src/renderer/src/hooks/useApi.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/ux/useFirstTouch.ts
git commit -m "feat(ux): add useFirstTouch hook for per-hint first-time tracking"
```

---

## Task 3: `EmptyState` component + styles

**Files:**
- Create: `src/renderer/src/components/ux/EmptyState.tsx`
- Modify: `src/renderer/src/index.css` (append styles)

- [ ] **Step 1: Create the component**

Write `src/renderer/src/components/ux/EmptyState.tsx`:

```tsx
import React from 'react';

export interface EmptyStateCta {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

interface Props {
  icon: string;
  title: string;
  description?: string;
  cta?: EmptyStateCta;
  secondaryCta?: EmptyStateCta;
  secondaryLeadIn?: string;
  size?: 'normal' | 'compact';
}

export default function EmptyState({ icon, title, description, cta, secondaryCta, secondaryLeadIn, size = 'normal' }: Props) {
  return (
    <div className={`ux-empty ${size === 'compact' ? 'compact' : ''}`}>
      <div className="ux-empty-icon" aria-hidden>{icon}</div>
      <div className="ux-empty-title">{title}</div>
      {description && <div className="ux-empty-desc">{description}</div>}
      {cta && (
        <button className="ux-empty-cta" onClick={cta.onClick} disabled={cta.disabled}>
          {cta.label}
        </button>
      )}
      {secondaryCta && (
        <div className="ux-empty-secondary-row">
          {secondaryLeadIn && <span className="ux-empty-lead">{secondaryLeadIn}</span>}
          <button className="ux-empty-secondary" onClick={secondaryCta.onClick} disabled={secondaryCta.disabled}>
            {secondaryCta.label}
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Append styles to `index.css`**

Append to the end of `src/renderer/src/index.css`:

```css
/* ---------- UX Foundation: EmptyState ---------- */
.ux-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 10px;
  padding: 40px 24px;
  border: 1.5px dashed rgba(255,255,255,0.12);
  border-radius: 12px;
  background: rgba(255,255,255,0.02);
  color: var(--muted, #aaa);
}
.ux-empty.compact { padding: 20px 16px; gap: 6px; }
.ux-empty-icon { font-size: 44px; line-height: 1; }
.ux-empty.compact .ux-empty-icon { font-size: 28px; }
.ux-empty-title { font-size: 15px; font-weight: 600; color: #e0e0e0; }
.ux-empty.compact .ux-empty-title { font-size: 13px; }
.ux-empty-desc { font-size: 13px; line-height: 1.5; max-width: 380px; color: var(--muted, #888); }
.ux-empty-cta {
  margin-top: 4px;
  padding: 9px 18px;
  border-radius: 8px;
  background: var(--accent, #4a9eff);
  color: white;
  border: none;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
}
.ux-empty-cta:hover:not(:disabled) { filter: brightness(1.1); }
.ux-empty-cta:disabled { opacity: 0.5; cursor: not-allowed; }
.ux-empty-secondary-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--muted, #888);
  margin-top: 4px;
}
.ux-empty-secondary {
  background: none;
  border: 1px solid rgba(255,255,255,0.15);
  color: inherit;
  padding: 5px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
}
.ux-empty-secondary:hover:not(:disabled) { background: rgba(255,255,255,0.05); }
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/ux/EmptyState.tsx src/renderer/src/index.css
git commit -m "feat(ux): add EmptyState component"
```

---

## Task 4: `TryThisBadge` component + styles

**Files:**
- Create: `src/renderer/src/components/ux/TryThisBadge.tsx`
- Modify: `src/renderer/src/index.css` (append styles)

- [ ] **Step 1: Create the component**

Write `src/renderer/src/components/ux/TryThisBadge.tsx`:

```tsx
import React from 'react';

interface Props {
  hint: string;
  done: boolean;
  children: React.ReactNode;
}

export default function TryThisBadge({ hint, done, children }: Props) {
  if (done) return <>{children}</>;
  return (
    <span className="ux-try-this-wrapper">
      {children}
      <span className="ux-try-this-dot" title={hint} aria-label={hint} />
    </span>
  );
}
```

- [ ] **Step 2: Append styles**

Append to the end of `src/renderer/src/index.css`:

```css
/* ---------- UX Foundation: TryThisBadge ---------- */
.ux-try-this-wrapper {
  position: relative;
  display: inline-flex;
}
.ux-try-this-dot {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #ff2d7b;
  box-shadow: 0 0 0 2px var(--bg, #0f0f0f);
  animation: ux-try-this-pulse 1.6s ease-in-out infinite;
  pointer-events: auto;
  cursor: help;
}
@keyframes ux-try-this-pulse {
  0%, 100% { transform: scale(1); box-shadow: 0 0 0 2px var(--bg, #0f0f0f), 0 0 0 0 rgba(255, 45, 123, 0.5); }
  50%      { transform: scale(1.25); box-shadow: 0 0 0 2px var(--bg, #0f0f0f), 0 0 0 6px rgba(255, 45, 123, 0); }
}
@media (prefers-reduced-motion: reduce) {
  .ux-try-this-dot { animation: none; }
}
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/ux/TryThisBadge.tsx src/renderer/src/index.css
git commit -m "feat(ux): add TryThisBadge component"
```

---

## Task 5: Extend `ToastContext` with `errorAction`

**Files:**
- Modify: `src/renderer/src/i18n/ToastContext.tsx`
- Modify: `src/renderer/src/components/ToastContainer.tsx`
- Modify: `src/renderer/src/index.css` (append styles)

- [ ] **Step 1: Extend ToastContext**

Replace the contents of `src/renderer/src/i18n/ToastContext.tsx` with:

```tsx
import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

type ToastType = 'success' | 'error' | 'info' | 'error-action';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  action?: ToastAction;
  details?: string;
}

export interface ErrorActionParams {
  message: string;
  action?: ToastAction;
  details?: string;
}

interface ToastContextType {
  toasts: ToastItem[];
  toast: {
    success: (msg: string) => void;
    error: (msg: string) => void;
    info: (msg: string) => void;
    errorAction: (params: ErrorActionParams) => void;
  };
}

const ToastContext = createContext<ToastContextType>({
  toasts: [],
  toast: { success: () => {}, error: () => {}, info: () => {}, errorAction: () => {} },
});

const MAX_TOASTS = 3;
const TOAST_DURATION = 4000;
const TOAST_DURATION_ACTION = 8000; // longer so the user has time to click the action

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const pushToast = useCallback((item: Omit<ToastItem, 'id'>) => {
    const id = ++idRef.current;
    const duration = item.type === 'error-action' ? TOAST_DURATION_ACTION : TOAST_DURATION;
    setToasts((prev) => {
      const next = [...prev, { ...item, id }];
      return next.slice(-MAX_TOASTS);
    });
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const toast = {
    success: useCallback((msg: string) => pushToast({ message: msg, type: 'success' }), [pushToast]),
    error: useCallback((msg: string) => pushToast({ message: msg, type: 'error' }), [pushToast]),
    info: useCallback((msg: string) => pushToast({ message: msg, type: 'info' }), [pushToast]),
    errorAction: useCallback((params: ErrorActionParams) => pushToast({
      message: params.message,
      type: 'error-action',
      action: params.action,
      details: params.details,
    }), [pushToast]),
  };

  return (
    <ToastContext.Provider value={{ toasts, toast }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
```

- [ ] **Step 2: Update ToastContainer**

Replace the contents of `src/renderer/src/components/ToastContainer.tsx` with:

```tsx
import React, { useState } from 'react';
import { useToast } from '../i18n/ToastContext';

export default function ToastContainer() {
  const { toasts } = useToast();
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  if (toasts.length === 0) return null;

  const toggleDetails = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          <div className="toast-message">{t.message}</div>
          {t.action && (
            <button className="toast-action" onClick={t.action.onClick}>{t.action.label}</button>
          )}
          {t.details && (
            <button className="toast-details-toggle" onClick={() => toggleDetails(t.id)}>
              {expanded.has(t.id) ? 'Details ausblenden' : 'Details anzeigen ▸'}
            </button>
          )}
          {t.details && expanded.has(t.id) && (
            <pre className="toast-details">{t.details}</pre>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Append styles**

Append to the end of `src/renderer/src/index.css`:

```css
/* ---------- UX Foundation: errorAction toast ---------- */
.toast-error-action {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.toast-message { font-weight: 500; }
.toast-action {
  align-self: flex-start;
  margin-top: 4px;
  padding: 5px 12px;
  background: rgba(255,255,255,0.1);
  border: 1px solid rgba(255,255,255,0.2);
  color: white;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
}
.toast-action:hover { background: rgba(255,255,255,0.18); }
.toast-details-toggle {
  align-self: flex-start;
  background: none;
  border: none;
  color: rgba(255,255,255,0.6);
  font-size: 11px;
  cursor: pointer;
  padding: 0;
}
.toast-details-toggle:hover { color: rgba(255,255,255,0.9); }
.toast-details {
  font-size: 11px;
  font-family: monospace;
  background: rgba(0,0,0,0.3);
  padding: 6px 8px;
  border-radius: 4px;
  white-space: pre-wrap;
  word-break: break-word;
  max-width: 100%;
  margin: 0;
}
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: passes. Existing `toast.success/error/info` calls across the codebase stay unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/i18n/ToastContext.tsx src/renderer/src/components/ToastContainer.tsx src/renderer/src/index.css
git commit -m "feat(ux): add errorAction toast type with recovery button + expandable details"
```

---

## Task 6: i18n keys

**Files:**
- Modify: `src/renderer/src/i18n/translations.ts`

- [ ] **Step 1: Add new keys**

In `src/renderer/src/i18n/translations.ts`, add these keys in the Progress Panel section (after `'progress.subtodo_hint_toast'`, before the chat panel section):

```ts
  // Empty-state foundations
  'empty.kanban.title': { de: 'Dein Kanban ist leer', en: 'Your kanban is empty' },
  'empty.kanban.desc': { de: 'Features und Tasks, die du streamst, verwaltest du hier. Fang klein an.', en: 'Features and tasks you are streaming live here. Start small.' },
  'empty.kanban.cta': { de: '➕ Erstes Feature anlegen', en: '➕ Create your first feature' },
  'empty.kanban.secondary_lead': { de: 'oder lass mich 3 Beispiele anlegen:', en: 'or let me create 3 examples:' },
  'empty.kanban.seed': { de: 'Beispiele einfügen', en: 'Insert examples' },
  // Try-this
  'try_this.add_subtodo': { de: 'Füge hier deine erste Sub-Task hinzu', en: 'Add your first sub-task here' },
  // Celebrate
  'celebrate.first_todo_done': { de: 'Erstes Task erledigt 🎯 — das erscheint live im Overlay.', en: 'First task done 🎯 — it appears live on the overlay.' },
  // Seed
  'progress.seed_success': { de: '3 Beispiele angelegt. Du kannst sie anpassen oder löschen.', en: '3 examples created. You can edit or delete them.' },
  'progress.seed_error': { de: 'Konnte keine Beispiele einfügen.', en: 'Could not insert examples.' },
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: passes. Keys are additive.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/i18n/translations.ts
git commit -m "feat(ux): add i18n keys for empty state, try-this, celebrate, seed"
```

---

## Task 7: Backend `POST /progress/seed-examples`

**Files:**
- Modify: `src/server/api/progress.ts`

- [ ] **Step 1: Add the endpoint**

In `src/server/api/progress.ts`, add a new route right after the existing `router.post('/items', ...)` handler (before the `router.patch('/items/:id', ...)` handler):

```ts
// POST /seed-examples — creates 3 pre-made kanban items with sub-todos when the board is empty
router.post('/seed-examples', (_req, res) => {
  const db = getDb();
  const count = db.prepare('SELECT COUNT(*) as c FROM project_items').get() as { c: number };
  if (count.c > 0) { res.status(409).json({ error: 'already_has_items' }); return; }

  const EXAMPLES: Array<{ title: string; todos: string[] }> = [
    {
      title: '🎨 Intro überarbeiten',
      todos: ['Neue Musik aussuchen', 'Titel-Card designen', 'In OBS einfügen & testen'],
    },
    {
      title: '🔧 Overlay-Set erneuern',
      todos: ['Farbschema festlegen', 'Alerts stylen', 'Chat-Box stylen'],
    },
    {
      title: '🎮 Nächste Stream-Session planen',
      todos: ['Thema wählen', 'Discord-Post vorbereiten'],
    },
  ];

  const inserted: Array<Record<string, unknown>> = [];
  const doSeed = db.transaction(() => {
    EXAMPLES.forEach((ex, idx) => {
      const itemResult = db.prepare('INSERT INTO project_items (title, status, sort_order) VALUES (?, ?, ?)').run(ex.title, 'pending', idx);
      const itemId = Number(itemResult.lastInsertRowid);
      ex.todos.forEach((title, j) => {
        db.prepare('INSERT INTO todos (title, sort_order, parent_id) VALUES (?, ?, ?)').run(title, j, itemId);
      });
      const item = db.prepare('SELECT * FROM project_items WHERE id = ?').get(itemId) as Record<string, unknown>;
      item.todos = db.prepare('SELECT * FROM todos WHERE parent_id = ? ORDER BY sort_order ASC').all(itemId);
      inserted.push(item);
    });
  });

  doSeed();

  broadcast('progress-update', { action: 'items-seeded', count: inserted.length });
  res.status(201).json({ items: inserted });
});
```

- [ ] **Step 2: Typecheck + Lint**

```bash
npm run typecheck
npm run lint
```

Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add src/server/api/progress.ts
git commit -m "feat(progress): add /seed-examples endpoint for empty-board onboarding"
```

---

## Task 8: ProgressPanel — empty state integration

**Files:**
- Modify: `src/renderer/src/panels/ProgressPanel.tsx`

When `items.length === 0`, render `<EmptyState>` instead of the 3 columns.

- [ ] **Step 1: Add the import**

In `src/renderer/src/panels/ProgressPanel.tsx`, add after the existing imports (near the top):

```tsx
import EmptyState from '../components/ux/EmptyState';
```

- [ ] **Step 2: Add the seed handler**

Inside the `ProgressPanel` function, add near the other handlers (e.g. after `addItem`):

```tsx
const seedExamples = async () => {
  const result = await apiPost('/progress/seed-examples', {});
  if (!result) { toast.error(t('progress.seed_error')); return; }
  toast.success(t('progress.seed_success'));
  refetch();
};
```

- [ ] **Step 3: Render EmptyState when items are empty**

Find the existing `<div className="kanban-board">...</div>` block inside the component's `return`:

```tsx
<div className="kanban-board">
  {renderColumn('pending', t('kanban.backlog'), '⬜', backlog)}
  {renderColumn('in_progress', t('kanban.in_progress'), '🔨', inProgress)}
  {renderColumn('done', t('kanban.done'), '✅', done)}
</div>
```

Replace it with the conditional below. The empty-case renders the `EmptyState` card AND an adjacent add-input (because the pending column that normally hosts the add-input is hidden in the empty case):

```tsx
{items.length === 0 ? (
  <>
    <EmptyState
      icon="📋"
      title={t('empty.kanban.title')}
      description={t('empty.kanban.desc')}
      cta={{ label: t('empty.kanban.cta'), onClick: () => {
        const el = document.getElementById('kanban-empty-input');
        if (el instanceof HTMLInputElement) el.focus();
      } }}
      secondaryLeadIn={t('empty.kanban.secondary_lead')}
      secondaryCta={{ label: t('empty.kanban.seed'), onClick: seedExamples }}
    />
    <div className="kanban-add kanban-add-empty">
      <input
        id="kanban-empty-input"
        type="text"
        placeholder={t('progress.item_placeholder')}
        value={newItem}
        onChange={e => setNewItem(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && addItem()}
      />
      <button onClick={addItem}>+</button>
    </div>
  </>
) : (
  <div className="kanban-board">
    {renderColumn('pending', t('kanban.backlog'), '⬜', backlog)}
    {renderColumn('in_progress', t('kanban.in_progress'), '🔨', inProgress)}
    {renderColumn('done', t('kanban.done'), '✅', done)}
  </div>
)}
```

- [ ] **Step 4: Append CSS for the inline add input in empty state**

Append to `src/renderer/src/index.css`:

```css
.kanban-add-empty { max-width: 420px; margin: 12px auto 0 auto; display: flex; gap: 6px; }
.kanban-add-empty input { flex: 1; padding: 8px 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.15); background: rgba(255,255,255,0.03); color: inherit; font-size: 13px; }
.kanban-add-empty button { padding: 8px 14px; border-radius: 6px; background: rgba(255,255,255,0.08); color: inherit; border: 1px solid rgba(255,255,255,0.15); cursor: pointer; }
```

- [ ] **Step 5: Typecheck + Lint**

```bash
npm run typecheck
npm run lint
```

Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/panels/ProgressPanel.tsx src/renderer/src/index.css
git commit -m "feat(progress): show teachable empty state with seed-examples button"
```

---

## Task 9: Card checklist progress bar + strikethrough

**Files:**
- Modify: `src/renderer/src/panels/ProgressPanel.tsx`
- Modify: `src/renderer/src/index.css`

- [ ] **Step 1: Update the card-header rendering**

In `src/renderer/src/panels/ProgressPanel.tsx`, find the existing `renderItem` function. Replace the `kanban-item-header` JSX block with the version that adds the progress bar under it:

Current block:

```tsx
<div
  className="kanban-item-header"
  draggable
  onDragStart={e => handleDragStart(e, item.id)}
  onDragEnd={handleDragEnd}
>
  <button className="status-toggle" onClick={e => { e.stopPropagation(); cycleStatus(item); }}>{statusEmoji(item.status)}</button>
  <span className="item-title" onClick={() => toggleExpand(item.id)}>{item.title}</span>
  {hasTodos && <span className="todo-count">{doneTodos.length}/{todos.length} ✓</span>}
  {displayTime > 0 && <span className="item-time">{formatTime(displayTime)}</span>}
  <button className="btn-delete-small" onClick={e => { e.stopPropagation(); deleteItem(item.id); }} title={t('tooltip.delete')}>✕</button>
</div>
```

Replace with:

```tsx
<div
  className="kanban-item-header"
  draggable
  onDragStart={e => handleDragStart(e, item.id)}
  onDragEnd={handleDragEnd}
>
  <button className="status-toggle" onClick={e => { e.stopPropagation(); cycleStatus(item); }}>{statusEmoji(item.status)}</button>
  <span className={`item-title ${hasTodos && doneTodos.length === todos.length ? 'all-done' : ''}`} onClick={() => toggleExpand(item.id)}>{item.title}</span>
  {hasTodos && <span className="todo-count">☑ {doneTodos.length}/{todos.length}</span>}
  {displayTime > 0 && <span className="item-time">{formatTime(displayTime)}</span>}
  <button className="btn-delete-small" onClick={e => { e.stopPropagation(); deleteItem(item.id); }} title={t('tooltip.delete')}>✕</button>
</div>
{hasTodos && (
  <div className="kanban-item-progress">
    <div
      className={`kanban-item-progress-fill ${doneTodos.length === todos.length ? 'full' : ''}`}
      style={{ width: `${(doneTodos.length / todos.length) * 100}%` }}
    />
  </div>
)}
```

- [ ] **Step 2: Append styles**

Append to `src/renderer/src/index.css`:

```css
/* Kanban-item progress bar on card face (Trello pattern) */
.kanban-item-progress {
  height: 2px;
  background: rgba(255,255,255,0.08);
  border-radius: 1px;
  margin: 0 10px 6px 10px;
  overflow: hidden;
}
.kanban-item-progress-fill {
  height: 100%;
  background: var(--accent, #4a9eff);
  transition: width 0.25s ease, background 0.2s ease;
}
.kanban-item-progress-fill.full { background: #2ecc71; }
.kanban-item .item-title.all-done { text-decoration: line-through; text-decoration-color: rgba(46, 204, 113, 0.6); opacity: 0.7; }
```

- [ ] **Step 3: Typecheck + Lint**

```bash
npm run typecheck
npm run lint
```

Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/panels/ProgressPanel.tsx src/renderer/src/index.css
git commit -m "feat(progress): add Trello-style card progress bar + strikethrough when done"
```

---

## Task 10: First-touch wiring + TryThisBadge + celebrate on first todo

**Files:**
- Modify: `src/renderer/src/panels/ProgressPanel.tsx`

Replace the existing unconditional activation-toast with a first-touch gate, add `TryThisBadge` on the sub-todo input, and trigger `celebrate('check')` when the user checks the first sub-todo of their stream life.

- [ ] **Step 1: Imports**

In `src/renderer/src/panels/ProgressPanel.tsx`, add to the top imports:

```tsx
import TryThisBadge from '../components/ux/TryThisBadge';
import { celebrate } from '../components/ux/celebrate';
import { useFirstTouch } from '../components/ux/useFirstTouch';
```

- [ ] **Step 2: Wire first-touches**

Inside the `ProgressPanel` function, near the other hooks, add:

```tsx
const firstActivate = useFirstTouch('progress.activate_item');
const firstCheck = useFirstTouch('progress.first_todo_checked');
```

- [ ] **Step 3: Replace the cycleStatus toast guard**

Find the existing `cycleStatus` function. It currently has:

```tsx
if (next === 'in_progress' && (item.todos || []).length === 0) {
  toast.info(t('progress.subtodo_hint_toast').replace('{title}', item.title));
  setFocusItemId(item.id);
}
```

Replace with (gate the toast behind first-touch; keep the autofocus unchanged so repeated activations still feel guided):

```tsx
if (next === 'in_progress' && (item.todos || []).length === 0) {
  if (!firstActivate.seen && !firstActivate.loading) {
    toast.info(t('progress.subtodo_hint_toast').replace('{title}', item.title));
    firstActivate.markSeen();
  }
  setFocusItemId(item.id);
}
```

Apply the **same** replacement inside the `handleDrop` function. Find:

```tsx
if (targetStatus === 'in_progress' && (item.todos || []).length === 0) {
  toast.info(t('progress.subtodo_hint_toast').replace('{title}', item.title));
  setFocusItemId(itemId);
}
```

Replace with:

```tsx
if (targetStatus === 'in_progress' && (item.todos || []).length === 0) {
  if (!firstActivate.seen && !firstActivate.loading) {
    toast.info(t('progress.subtodo_hint_toast').replace('{title}', item.title));
    firstActivate.markSeen();
  }
  setFocusItemId(itemId);
}
```

- [ ] **Step 4: Celebrate on first todo-check**

Find the existing `toggleTodo` function. Replace its body with:

```tsx
const toggleTodo = async (todoId: number, currentDone: number, el?: HTMLElement | null) => {
  const result = await apiPatch(`/progress/todos/${todoId}`, { done: currentDone ? 0 : 1 });
  if (!result) { toast.error(t('error.action_failed')); return; }
  // First-ever sub-todo completion: celebrate.
  if (currentDone === 0 && !firstCheck.seen && !firstCheck.loading) {
    if (el) celebrate('check', el);
    toast.success(t('celebrate.first_todo_done'));
    firstCheck.markSeen();
  }
  refetch();
};
```

Find the button that calls `toggleTodo` inside `renderItem` / the sub-todo map. Currently:

```tsx
<button className="sub-todo-check" onClick={() => toggleTodo(td.id, td.done)}>
  {td.done ? '☑' : '☐'}
</button>
```

Replace with (passes the element so celebrate() can animate it):

```tsx
<button
  className="sub-todo-check"
  onClick={e => toggleTodo(td.id, td.done, e.currentTarget)}
>
  {td.done ? '☑' : '☐'}
</button>
```

- [ ] **Step 5: TryThisBadge on the sub-todo input**

Inside `renderItem`, find the `<div className="sub-todo-add">...` block. Wrap the entire block with `TryThisBadge`. The current block:

```tsx
<div className="sub-todo-add">
  <input
    ref={el => {
      if (el && focusItemId === item.id) {
        el.focus();
        setFocusItemId(null);
      }
    }}
    type="text"
    placeholder={t('todos.placeholder')}
    value={newTodoText[item.id] || ''}
    onChange={e => setNewTodoText(prev => ({ ...prev, [item.id]: e.target.value }))}
    onKeyDown={e => e.key === 'Enter' && addTodo(item.id)}
    onClick={e => e.stopPropagation()}
  />
  <button onClick={() => addTodo(item.id)}>+</button>
</div>
```

Wrap it:

```tsx
<TryThisBadge hint={t('try_this.add_subtodo')} done={!isActive || todos.length > 0}>
  <div className="sub-todo-add">
    <input
      ref={el => {
      if (el && focusItemId === item.id) {
        el.focus();
        setFocusItemId(null);
      }
    }}
      type="text"
      placeholder={t('todos.placeholder')}
      value={newTodoText[item.id] || ''}
      onChange={e => setNewTodoText(prev => ({ ...prev, [item.id]: e.target.value }))}
      onKeyDown={e => e.key === 'Enter' && addTodo(item.id)}
      onClick={e => e.stopPropagation()}
    />
    <button onClick={() => addTodo(item.id)}>+</button>
  </div>
</TryThisBadge>
```

The badge only pulses on the currently active item (`isActive`) that still has zero todos — when either changes, the wrapper becomes transparent.

Append a small style tweak to `src/renderer/src/index.css`:

```css
/* TryThisBadge wrapping sub-todo-add should still take full width */
.sub-todo-add { width: 100%; }
.ux-try-this-wrapper > .sub-todo-add { width: 100%; }
.kanban-item-todos .ux-try-this-wrapper { width: 100%; }
```

- [ ] **Step 6: Typecheck + Lint**

```bash
npm run typecheck
npm run lint
```

Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/panels/ProgressPanel.tsx src/renderer/src/index.css
git commit -m "feat(progress): first-touch gates on hints + celebrate on first todo completion"
```

---

## Task 11: Todos-overlay empty-state copy

**Files:**
- Modify: `src/overlays/todos/index.html`

- [ ] **Step 1: Update the render() function**

Find the block in the `render()` function inside `src/overlays/todos/index.html`:

```js
if (!projectTitle && total === 0) {
  list.innerHTML = '<div class="empty-msg">KEIN AKTIVES FEATURE</div>';
  return;
}

if (total === 0) {
  list.innerHTML = '<div class="empty-msg">KEINE TASKS VORHANDEN</div>';
  return;
}
```

Replace the `total === 0` branch with the richer copy (the first branch stays unchanged):

```js
if (!projectTitle && total === 0) {
  list.innerHTML = '<div class="empty-msg">KEIN AKTIVES FEATURE</div>';
  return;
}

if (total === 0) {
  list.innerHTML = ''
    + '<div class="empty-msg" style="text-transform:none;font-size:14px;letter-spacing:1px;line-height:1.5;padding:18px 12px;">'
    + '<div style="font-family:var(--font-display);font-size:16px;letter-spacing:4px;color:var(--color-secondary);margin-bottom:10px;">NOCH KEINE SUB-TASKS</div>'
    + 'Füge welche in der App hinzu —<br/>sie erscheinen hier live.'
    + '</div>';
  return;
}
```

The first branch (no active item at all) keeps the terse "KEIN AKTIVES FEATURE" copy.

- [ ] **Step 2: Reload the overlay manually to confirm**

Start/keep `npm run dev` running. Open `http://localhost:4000/overlay/todos?token=<token>` in a browser (the token is visible in the server logs after startup). Verify that when an active item has no sub-todos, the new copy shows; when no active item, the old copy shows.

- [ ] **Step 3: Commit**

```bash
git add src/overlays/todos/index.html
git commit -m "feat(overlay-todos): improve empty-state copy when active item has no sub-todos"
```

---

## Task 12: End-to-end manual QA

No automated tests. Follow the manual paths below end-to-end and record any regressions.

- [ ] **Step 1: Typecheck + Lint final**

```bash
npm run typecheck
npm run lint
```

Expected: both clean.

- [ ] **Step 2: Fresh-DB paths**

Temporarily move `data/stream.db` aside (`mv data/stream.db data/stream.db.bak`). Restart `npm run dev`. Verify:

- Progress panel shows the new EmptyState card (icon 📋, title, description, primary "➕ Erstes Feature anlegen" button, secondary "Beispiele einfügen" button).
- Click "Beispiele einfügen" → 3 items appear (🎨 Intro, 🔧 Overlay-Set, 🎮 Nächste Session), each with sub-todos → success toast shows.
- Empty state disappears.
- Click "Beispiele einfügen" would now 409 — verify by seeing the button is gone (since items.length > 0).

Restore original DB: `mv data/stream.db.bak data/stream.db` (or keep the seeded DB).

- [ ] **Step 3: First-touch paths**

- Delete the two hint settings rows so the first-touches fire again:
  ```
  DELETE FROM settings WHERE key LIKE 'ux_hint_seen_progress.%';
  ```
  Use any SQLite client. Alternatively: fresh DB (Step 2).
- Activate an item with no sub-todos → toast `progress.subtodo_hint_toast` + autofocus on input + TryThisBadge pulse.
- Activate another empty item → no second toast (first-touch marked), badge still pulses on each item's input that is active-empty.
- Add the first sub-todo → badge pulse stops immediately.
- Check the first sub-todo → `celebrate('check')` animation on the checkbox + toast `celebrate.first_todo_done`.
- Check another sub-todo on a different item → no toast (first-touch marked).

- [ ] **Step 4: Visual paths**

- Card with 0 sub-todos: no progress bar visible.
- Card with 2/5 todos: `☑ 2/5` badge + blue progress bar at 40%.
- Card with 5/5 todos: `☑ 5/5` badge + green progress bar at 100% + strikethrough on title.
- Uncheck a todo → strikethrough disappears, bar back to blue/partial.

- [ ] **Step 5: Todos-overlay paths**

- Open `http://localhost:4000/overlay/todos?token=...` (token from server logs).
- Case A: no active item → "KEIN AKTIVES FEATURE" (unchanged).
- Case B: active item, no sub-todos → new copy "NOCH KEINE SUB-TASKS / Füge welche in der App hinzu …".
- Case C: active item with sub-todos → normal list of tasks (unchanged).

- [ ] **Step 6: errorAction toast path**

Artificially trigger: open DevTools in the renderer and run `window.__triggerErrorActionTest = () => { /* no-op */ };` — skip this, no existing site uses it yet. Alternatively verify by manually calling `toast.errorAction({...})` once via the React DevTools "props" panel or a quick temporary button. Skip if too fiddly; the feature is documented for later panels.

- [ ] **Step 7: Reduced-motion path**

In DevTools → Rendering → "Emulate CSS media feature prefers-reduced-motion" → "reduce". Trigger a first-todo-check → the green pulse should not run (instant color change is fine). TryThisBadge dot should not pulse either (static red dot is fine).

- [ ] **Step 8: Language switch**

- Switch language to EN in the Settings panel → all new strings visible in English (empty.kanban.*, try_this.*, celebrate.*, progress.seed_*).

- [ ] **Step 9: Final smoke test**

- Restart app fresh (but keeping DB) → typecheck + lint still clean → panel renders normally with seeded items → no regressions in existing Kanban, Clips, Stats, Settings panels.

- [ ] **Step 10: Commit QA-only fixes (if any)**

If QA surfaced small fixes (typos, style tweaks), commit each as a separate small commit:

```bash
git add <paths>
git commit -m "fix(ux): <specific fix from QA>"
```

Otherwise skip.

---

## Self-Review

- **Spec coverage**:
  - Principles + Copy Tone → embodied in i18n strings (Task 6) and design decisions throughout.
  - `EmptyState` → Task 3. `TryThisBadge` → Task 4. `ErrorToast` → Task 5. `celebrate` → Task 1. `useFirstTouch` → Task 2.
  - Application: Kanban empty-state → Task 8. Card checklist progress + strikethrough → Task 9. First-touch on activate + TryThisBadge + celebrate first todo → Task 10. Todos-overlay empty-state → Task 11.
  - Backend seed-examples endpoint → Task 7.
  - Settings & data flow: `ux_hint_seen_*` via useFirstTouch (Task 2) + existing `/settings/get`/`/set` endpoints.
  - i18n keys → Task 6.
  - Verification via typecheck + lint + manual QA → Task 12.
- **Placeholder scan**: No TBD/TODO/implement-later/similar-to-N entries.
- **Type consistency**: `EmptyStateCta`, `ToastAction`, `ErrorActionParams`, `useFirstTouch` return shape, `CelebrateKind`, `TryThisBadge` props — all declared once in Tasks 1–5 and consumed consistently in later tasks.
- **Open risks**:
  - The empty-state CTA focuses a `#kanban-empty-input` element rendered right below it. Implementation deviation risk: if the focus-target ID doesn't match, the CTA silently does nothing — verified in Task 8 Step 3 with the explicit ID wiring.
  - `prefers-reduced-motion` handling is inline in the CSS keyframes — no JS change needed in `celebrate.ts`.

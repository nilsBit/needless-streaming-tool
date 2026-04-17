# UX Polish: Toast Notifications, Error Handling, Loading States, Tooltips

**Date:** 2026-04-17
**Status:** Approved

## Goal

Systematically improve UX across all panels: add toast notifications for user feedback, check API return values for error handling, add consistent loading states, fix missing empty states, add tooltips, and standardize the copy-to-clipboard pattern.

## Changes

### 1. Toast Notification System (new)

**New files:**
- `src/renderer/src/i18n/ToastContext.tsx` — Context + Provider + `useToast()` hook
- `src/renderer/src/components/ToastContainer.tsx` — Renders toast stack

**Behavior:**
- `useToast()` returns `{ toast }` with methods: `toast.success(msg)`, `toast.error(msg)`, `toast.info(msg)`
- Toasts appear bottom-right, auto-dismiss after 4 seconds
- Types: `success` (green), `error` (red), `info` (blue)
- Max 3 visible, oldest dismissed first
- Slide-in/fade-out animation
- Messages are translation keys passed through `t()`

**Integration:**
- `ToastProvider` wraps the app in `main.tsx` INSIDE `LanguageProvider` (needs `t()` access)
- Provider order: `LanguageProvider > ThemeProvider > ToastProvider > App`
- `<ToastContainer />` rendered inside ToastProvider

### 2. Error Handling in All Panels

**Important:** `apiPost`, `apiPatch`, `apiDelete` from `useApi.ts` do NOT throw errors — they return `null` on failure. Use return-value checks, NOT try-catch.

**Pattern:**
```tsx
const addTodo = async () => {
  const result = await apiPost('/todos', { title });
  if (!result) {
    toast.error(t('error.action_failed'));
    return;
  }
  refetch();
};
```

For SettingsPanel and OverlaysPanel which already have try-catch blocks (for `apiFetch` which CAN throw): keep try-catch, add toast in catch block.

**Affected panels (15):** ChallengePanel, IssuesPanel, ClipsPanel, DesignsPanel, TodosPanel, ProgressPanel, MilestonesPanel, RaidsPanel, RewardsPanel, SongPanel, ChatPanel, StatsPanel, HotkeysPanel, OverlaysPanel, SettingsPanel

### 3. Loading States

- `useApi` hook already returns `loading` boolean — use it in all panels
- Initial load: show `{t('common.loading')}` text when `data === null && loading`
- Action buttons: `disabled` while API call in progress (local state)
- No spinners or skeleton screens

**Pattern:**
```tsx
const { data: todos, loading, refetch } = useApi<Todo[]>('/todos');

if (loading && !todos) {
  return <div className="panel"><p className="empty">{t('common.loading')}</p></div>;
}
```

### 4. Missing Empty States

- **IssuesPanel**: Add "No issues" message when `openIssues.length === 0 && fixedIssues.length === 0`
- **SongPanel**: Add "No song active" message when no song is set

### 5. Tooltips

Add `title` attributes (translated via `t()`) to:
- All delete buttons: `t('tooltip.delete')`
- All toggle/check buttons: contextual tooltip
- Copy buttons: `t('tooltip.copy')`
- Status dots in SettingsPanel: `t('tooltip.connected')` / `t('tooltip.not_connected')`
- Fix hardcoded German tooltip in MilestonesPanel

### 6. CopyButton Component (new)

**New file:** `src/renderer/src/components/CopyButton.tsx`

- Props: `text: string`, `label?: string`
- Shows `📋` by default, switches to `✅` for 2 seconds after click
- Uses `navigator.clipboard.writeText()`
- Replaces individual copy logic in SettingsPanel, OverlaysPanel, and onboarding components (OverlaysStep, StreamDeckStep)

### New Translation Keys (~20)

```
error.action_failed — "Aktion fehlgeschlagen" / "Action failed"
error.load_failed — "Laden fehlgeschlagen" / "Loading failed"
common.loading — "Laden..." / "Loading..."
issues.empty_list — "Keine Issues" / "No issues"
song.no_song — "Kein Song aktiv" / "No song active"
tooltip.delete — "Löschen" / "Delete"
tooltip.copy — "Kopieren" / "Copy"
tooltip.copied — "Kopiert!" / "Copied!"
tooltip.edit — "Bearbeiten" / "Edit"
tooltip.connected — "Verbunden" / "Connected"
tooltip.not_connected — "Nicht verbunden" / "Not connected"
tooltip.preview — "Vorschau" / "Preview"
tooltip.reset — "Zurücksetzen" / "Reset"
tooltip.close — "Schließen" / "Close"
milestones.check_tooltip — "Abhaken → Achievement" / "Check off → Achievement"
```

## Affected Files

| Category | Files |
|----------|-------|
| New | `ToastContext.tsx`, `ToastContainer.tsx`, `CopyButton.tsx` |
| App root | `main.tsx` (add ToastProvider inside LanguageProvider) |
| Translations | `translations.ts` (~20 new keys) |
| CSS | `index.css` (toast styles + animation) |
| All 15 panels | Return-value error checks + toast, loading states, tooltips |
| SettingsPanel | CopyButton integration, toast for backup |
| OverlaysPanel | CopyButton integration |
| Onboarding | OverlaysStep, StreamDeckStep (CopyButton integration) |

## What Does NOT Change

- API layer (`useApi`, `apiPost` etc.) stays as-is — no throwing, returns null on error
- WebSocket handling stays as-is
- ErrorBoundary stays as-is (catches React render errors)
- Panel layouts and visual design unchanged
- No new API endpoints needed

## Risk

- Low: purely additive UX improvements
- Toast system is self-contained, doesn't affect existing logic
- Error handling checks return values without changing API behavior
- Biggest risk: touching all 15 panels — careful not to break existing functionality

# Kanban Board: Visual Upgrade for Progress Tracker

**Date:** 2026-04-17
**Status:** Approved

## Goal

Replace the ProgressPanel list view with a 3-column Kanban board using native HTML Drag-and-Drop. Items can be dragged between columns to change status, and within columns to reorder. No DB or API changes needed.

## Architecture

Purely a UI change. The 3 columns map directly to existing `project_items` status values:
- **Backlog** = `pending`
- **Active** = `in_progress`
- **Done** = `done`

`sort_order` field (already exists) controls item order within each column. The existing PATCH API handles both `status` and `sort_order` changes. Timer linking from Phase 4 works unchanged since status values don't change.

## No DB or API Changes

Everything needed already exists:
- `project_items.status` — determines column placement
- `project_items.sort_order` — determines order within column
- `PATCH /api/progress/items/:id` — accepts `status`, `sort_order`, `current_timer_seconds`
- Timer-linking logic — triggers on status change automatically

## UI: ProgressPanel Rewrite

### Layout

3 columns side-by-side using flexbox:

```
┌──────────────┬──────────────┬──────────────┐
│  ⬜ Backlog   │ 🔨 Active    │ ✅ Done       │
│  (3)         │  (1)         │  (2)         │
├──────────────┼──────────────┼──────────────┤
│ Feature A    │ Feature D    │ Feature B    │
│ Feature C    │  ⏱ 45m       │ Feature E    │
│ Feature F    │              │  ⏱ 1h 23m    │
│              │              │              │
│ [+ Add]      │              │              │
└──────────────┴──────────────┴──────────────┘
```

**Column features:**
- Header with emoji, translated label, item count
- Scrollable item list
- Backlog column has "Add Item" input at bottom
- Active column shows live timer on the in-progress item
- Done column shows saved time_spent

**Project name + progress bar** stays above the Kanban columns.

### Drag-and-Drop (Native HTML Drag API)

**Drag start:**
- Items have `draggable="true"`
- `onDragStart` stores item ID via `e.dataTransfer.setData('text/plain', item.id)`

**Drop targets:**
- Each column is a drop zone with `onDragOver` (preventDefault to allow drop)
- `onDragEnter` / `onDragLeave` toggle a `drag-over` CSS class for visual feedback
- `onDrop` reads the item ID, determines the target column's status, sends PATCH request

**Status change on drop:**
```tsx
const handleDrop = async (targetStatus: string, e: React.DragEvent) => {
  const itemId = Number(e.dataTransfer.getData('text/plain'));
  await apiPatch(`/progress/items/${itemId}`, {
    status: targetStatus,
    current_timer_seconds: liveSeconds
  });
  refetch();
};
```

**Reorder within column:**
- When dropping on a specific item position within the same column, update `sort_order`
- Simple approach: on drop, set the item's `sort_order` to the target position

**Click fallback:**
- Clicking the status emoji still cycles status (same as current behavior)
- Works as accessibility fallback and for quick status changes

### Visual Feedback

- Dragged item gets `opacity: 0.5` via `.dragging` CSS class
- Target column gets highlighted border via `.drag-over` class
- Smooth transition on column highlight

## Affected Files

| Category | Files |
|----------|-------|
| UI | `src/renderer/src/panels/ProgressPanel.tsx` (rewrite layout to Kanban) |
| CSS | `src/renderer/src/index.css` (Kanban column styles, drag feedback) |
| i18n | `src/renderer/src/i18n/translations.ts` (~5 new keys) |

## What Does NOT Change

- `project_items` DB schema
- API endpoints (PATCH, POST, DELETE, GET, export)
- Timer-linking logic from Phase 4
- Progress overlay (stays as list view — separate from dashboard)
- Bot command `!progress`
- CSV export
- ChallengePanel linked-item indicator

## Translation Keys (~5)

```
kanban.backlog — "Backlog" / "Backlog"
kanban.in_progress — "Aktiv" / "Active"
kanban.done — "Erledigt" / "Done"
kanban.add_item — "+ Neues Item" / "+ New Item"
kanban.drop_here — "Hierher ziehen" / "Drop here"
```

## Risk

- Low: purely UI change, no backend modifications
- Main risk: drag-and-drop edge cases (dragging to same column, rapid drag operations)
- Mitigation: click-to-cycle fallback always works
- The panel must fit in the existing layout — columns need to work at the app's default width (1200px minus sidebar)

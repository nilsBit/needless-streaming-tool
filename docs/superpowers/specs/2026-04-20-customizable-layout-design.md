# Customizable Dashboard Layout

**Date:** 2026-04-20
**Status:** Approved

## Goal

Allow users to reorder panels via drag-and-drop, hide/show panels, and toggle panel width between half (1 column) and full (2 columns). Layout persisted per tab in localStorage.

## Architecture

New `useDashboardLayout` hook manages layout state (order, hidden, fullWidth) per tab, persisted in localStorage. App.tsx reads from this hook and applies the layout when rendering panels. Native HTML Drag API for reordering (same pattern as Kanban). No backend changes.

## Data Model

```ts
interface TabLayout {
  order: string[];      // Panel keys in desired order
  hidden: string[];     // Hidden panel keys
  fullWidth: string[];  // Panel keys with full width
}

interface DashboardLayout {
  [tabKey: string]: TabLayout;
}
```

Stored in localStorage key: `dashboard-layout`.

Default: current order from `TABS` constant, nothing hidden, nothing fullWidth (except `help` which is already full-width via CSS).

## Panel Header Controls

```
⠿ Drag | Panel Label                         ⬜ Width | 👁 Hide | ▼ Collapse
```

4 controls per panel:
- `⠿` — Drag handle (only this element is draggable, not the whole header)
- `⬜` / `⬛` — Toggle half/full width
- `👁` — Hide panel
- `▼` / `▶` — Collapse panel (existing)

## Features

### 1. Drag-and-Drop Reorder

- Native HTML Drag API
- Only the `⠿` drag handle initiates drag (not the whole panel)
- `onDragStart`: stores panel key in dataTransfer
- `onDragOver`: shows drop indicator (blue line between panels)
- `onDrop`: reorders the `order` array, saves to localStorage
- Visual feedback: dragged panel gets `opacity: 0.4`, drop target shows indicator line

### 2. Hide/Show Panels

- `👁` button in panel header → adds panel key to `hidden` array
- Panel disappears from grid
- Below the panel grid, a "Hidden panels" bar appears:
  ```
  Ausgeblendet: [Challenge] [Raids]
  ```
- Each hidden panel name is a clickable button → removes from `hidden`, panel reappears
- Bar only visible when at least one panel is hidden

### 3. Width Toggle

- `⬜` button toggles panel between half and full width
- Half width: default `grid-column: span 1`
- Full width: `grid-column: 1 / -1`
- Icon changes: `⬜` when half, `⬛` when full
- Persisted in `fullWidth` array

### 4. Persistence

- Layout saved to localStorage on every change (reorder, hide, show, width toggle)
- On app load, layout is read from localStorage
- If a panel exists in TABS but not in the saved layout (e.g. new panel added in update), it's appended at the end
- If a panel is in saved layout but no longer exists in TABS (removed panel), it's ignored
- "Reset Layout" button in each tab to restore defaults

## Custom Hook: useDashboardLayout

**New file:** `src/renderer/src/hooks/useDashboardLayout.ts`

```ts
interface TabLayout {
  order: string[];
  hidden: string[];
  fullWidth: string[];
}

function useDashboardLayout(tabKey: string, defaultPanels: string[]) {
  // Returns:
  return {
    order: string[];          // ordered, visible panel keys
    hidden: string[];         // hidden panel keys
    fullWidth: Set<string>;   // panels with full width
    reorder: (fromKey: string, toKey: string) => void;
    hide: (key: string) => void;
    show: (key: string) => void;
    toggleWidth: (key: string) => void;
    isFullWidth: (key: string) => boolean;
    reset: () => void;
  };
}
```

The hook:
- Reads from localStorage on init
- Merges with defaultPanels (handles added/removed panels)
- Writes to localStorage on every mutation
- Returns only visible panels in `order` (filtered by hidden)

## App.tsx Changes

- Import and use `useDashboardLayout` hook per active tab
- Render panels in hook's `order` (not TABS order)
- Apply `full-width` class based on hook's `fullWidth`
- Add drag handlers to panel wrappers
- Add width toggle and hide buttons to panel header
- Render hidden panels bar below grid

## Translation Keys (~6)

```
layout.hidden_panels — "Ausgeblendet" / "Hidden"
layout.reset — "Layout zurücksetzen" / "Reset layout"
layout.full_width — "Volle Breite" / "Full width"
layout.half_width — "Halbe Breite" / "Half width"
layout.hide — "Ausblenden" / "Hide"
layout.show — "Einblenden" / "Show"
```

## CSS Changes

```css
/* Drag feedback */
.panel-wrapper.dragging { opacity: 0.4; }
.panel-wrapper.drag-over-top { border-top: 2px solid #3498db; }
.panel-wrapper.drag-over-bottom { border-bottom: 2px solid #3498db; }

/* Full width */
.panel-wrapper.full-width { grid-column: 1 / -1; }

/* Panel header controls */
.panel-header-controls { display: flex; gap: 4px; margin-left: auto; }
.panel-header-btn { background: none; border: none; cursor: pointer; opacity: 0.5; font-size: 12px; }
.panel-header-btn:hover { opacity: 1; }
.drag-handle { cursor: grab; }
.drag-handle:active { cursor: grabbing; }

/* Hidden panels bar */
.hidden-bar { display: flex; gap: 6px; padding: 8px; flex-wrap: wrap; align-items: center; }
.hidden-bar-label { font-size: 12px; color: #888; }
.hidden-bar-btn { font-size: 12px; padding: 2px 8px; background: #1a1a1a; border: 1px solid #333; border-radius: 4px; cursor: pointer; color: #ccc; }
.hidden-bar-btn:hover { border-color: #888; }
```

## Affected Files

| Category | Files |
|----------|-------|
| New | `src/renderer/src/hooks/useDashboardLayout.ts` |
| UI | `src/renderer/src/App.tsx` (layout logic, drag handlers, header controls) |
| CSS | `src/renderer/src/index.css` (drag feedback, full-width, hidden bar, header controls) |
| i18n | `src/renderer/src/i18n/translations.ts` (~6 keys) |

## What Does NOT Change

- Panel components themselves
- Tab structure and tab navigation
- Backend / API
- Panel collapse behavior (stays, just moves to the right of the header)
- Existing `.panel-wrapper:has(.help-panel) { grid-column: 1 / -1; }` rule (help panel stays full by default)

## Risk

- Low: purely UI change, no backend
- Main complexity: drag-and-drop between panel wrappers in CSS grid — position calculation needs care
- localStorage corruption: hook validates saved layout against current TABS on every load

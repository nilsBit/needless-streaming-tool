# Layout Redesign — Main + Sidebar Dashboard

## Summary

Redesign the app layout to reduce clutter: rename Stream tab to Dashboard, introduce a Main + Sidebar panel layout with drag-and-drop customization, and move rarely used panels (Clip Moments, Stats) to Settings.

## Tab Structure

| Tab | Panels |
|-----|--------|
| Dashboard | Challenge, Glücksrad, Abstimmungen, Now Playing, Reward Stats, OBS Scenes |
| Projekt | Progress Tracker, Milestones |
| Settings | Settings, Overlays, Clip Moments, Stats |
| Hilfe | Hilfe & Dokumentation |

## Dashboard Layout: Main + Sidebar

The Dashboard tab uses a two-column layout: a wider main area (left) and a narrower sidebar (right).

**Initial assignment:**
- **Main (left, ~65% width):** Challenge, Glücksrad, Abstimmungen
- **Sidebar (right, ~35% width):** Now Playing, Reward Stats, OBS Scenes

**Drag & Drop:**
- Users can drag any panel from Main to Sidebar and vice versa
- Panels within each column can be reordered by dragging
- Uses the existing drag-and-drop infrastructure (`useDashboardLayout` hook)
- Layout persists in the existing storage mechanism (localStorage/DB via `useDashboardLayout`)

**Responsive:** When the window is narrow, sidebar stacks below main (single column fallback).

## Changes Required

### App.tsx

- Rename `stream` tab label from "Stream" to "Dashboard"
- Move `clips` (Clip Moments) and `stats` (Stats) panels from stream to settings tab
- Remove Hotkeys panel (already removed from import)
- Pass layout zone info (main vs sidebar) to the panel rendering logic

### useDashboardLayout.ts

- Extend the layout state to track which column each panel belongs to: `main` or `sidebar`
- Default assignment: Challenge, Glücksrad, Abstimmungen → main; Now Playing, Reward Stats, OBS Scenes → sidebar
- Support drag between columns (not just reorder within a list)
- Persist column assignment alongside panel order

### index.css

- Replace single `.panels` column with a two-column flex/grid layout
- Main column: `flex: 2`, Sidebar column: `flex: 1`
- Responsive: `@media (max-width: 900px)` → single column stack
- Drag-over indicators for both columns

### Panels not affected

- Projekt tab: unchanged (single column, 2 panels)
- Settings tab: unchanged layout, just gains Clip Moments + Stats
- Hilfe tab: unchanged

## Files to Modify

| File | Change |
|------|--------|
| `src/renderer/src/App.tsx` | Tab rename, panel reassignment |
| `src/renderer/src/hooks/useDashboardLayout.ts` | Two-column layout state + defaults |
| `src/renderer/src/index.css` | Main + Sidebar CSS layout |

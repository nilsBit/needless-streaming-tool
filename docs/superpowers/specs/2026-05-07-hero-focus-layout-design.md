# Hero Focus Layout — Dashboard Redesign

## Summary

Redesign the dashboard to use a Hero + Grid layout that provides clear visual hierarchy. One panel is prominently displayed as the "hero" (full-width, accent-bordered), remaining panels appear in a compact 2-column grid below — either open or collapsed. Stream profiles define smart defaults (hero panel, open/collapsed state), and users can override via a pin button on any panel.

## Problem

- 7 panels visible at once on the Dashboard tab with no visual hierarchy
- All panels have equal visual weight — no focal point
- Users returning after a break feel overwhelmed by feature density

## Design

### Hero + Grid Layout

The Dashboard tab replaces the current Main + Sidebar layout with:

1. **Hero Panel** — full-width at the top, ~60% of viewport height, orange accent border, "FOKUS" badge, 📌 pin icon
2. **Open Grid Panels** — 2-column grid below the hero, compact but content visible
3. **Collapsed Panels** — single-line rows below the grid, click to expand

### Visual Hierarchy

| Level | Appearance | Example |
|-------|-----------|---------|
| Hero | Full width, `border: 2px solid var(--accent)`, larger padding, FOKUS badge | Challenge |
| Open Grid | 2-col grid, normal panel style, compact height | Glücksrad, Now Playing |
| Collapsed | Single-line header only, dimmed text, ▶ icon | Abstimmungen, Clip Moments |

### Pin Interaction

- Every panel header gets a 📌 button
- Clicking pin on a non-hero panel promotes it to hero
- The previous hero demotes to the first position in the open grid
- Pin state persists in the layout object (overrides profile default)

### Tab Structure Simplification

Reduce from 5 tabs to 4:

| Tab | Panels |
|-----|--------|
| 🎮 Dashboard | Challenge, Glücksrad, Clip Moments, Abstimmungen, Now Playing, Reward Stats, OBS Scenes |
| 📋 Projekt | Progress Tracker, Milestones |
| ⚙️ Settings | Settings, Overlays, Stats |
| 📖 Hilfe | Hilfe & Dokumentation |

Stats tab is removed — its single panel moves into Settings.

### Stream Profile Configuration

Each profile defines four properties:

| Property | Description |
|----------|-------------|
| `hero` | Which panel is the hero (string, panel key) |
| `open` | Which panels start open in the grid (string[]) |
| `hidden` | Which panels are fully hidden / not shown at all (string[]) |
| `collapsed` | Derived: all visible panels minus hero minus open start collapsed |

**Hidden vs. Collapsed:** Hidden panels don't appear at all (same as today's behavior). Collapsed panels are visible as single-line rows that can be expanded with a click. These are two distinct concepts.

#### Profile Defaults

| Profile | Hero | Open in Grid | Hidden | Collapsed |
|---------|------|-------------|--------|-----------|
| Creative | challenge | song | issues, clips, rewardstats, obs | rest (designs) |
| Gaming | challenge | issues, song | designs, clips, rewardstats | rest (obs) |
| Coding | challenge | issues | designs, clips, rewardstats | rest (song, obs) |
| Chatting | designs | challenge, song | issues, clips, rewardstats, obs | rest (none) |
| All | challenge | all | none | none |

Note: These defaults align with the existing `PROFILE_VISIBLE` mapping. Panels that are currently hidden by a profile remain hidden. The new `collapsed` state only applies to panels that are visible but not hero or open.

#### Override Behavior

- Pinning a panel as hero → writes `hero` key to `TabLayout` in localStorage + server DB, overrides profile default
- Expanding/collapsing panels → writes `collapsed` array to `TabLayout`, overrides profile default
- Switching profile → clears `hero` and `collapsed` overrides from `TabLayout`, resets to profile defaults (user overrides lost)
- Reset button → same as switching profile (resets to current profile defaults)

## Technical Changes

### `src/renderer/src/hooks/useDashboardLayout.ts`

- Add `hero: string` field to `TabLayout` interface
- Add `collapsed: string[]` field to `TabLayout` interface (panels visible but minimized)
- Keep existing `hidden: string[]` field (panels not shown at all)
- Update `PROFILE_VISIBLE` to `PROFILE_LAYOUT` with `hero`, `open`, `hidden` per profile per tab
- Add `pinAsHero(key: string)` function that sets new hero and demotes old hero to first grid position
- Remove `sidebar` / `moveToSidebar` / `moveToMain` logic (replaced by hero/grid)
- Remove `fullWidth` / `toggleWidth` / `isFullWidth` logic (hero replaces full-width semantics)
- Keep `reorder`, `hide`, `show`, `reset` functions
- Replace React `useState` collapsed tracking in App.tsx with layout-driven `collapsed` array from this hook

### `src/renderer/src/App.tsx`

- Remove `stats` tab, move `StatsPanel` into `settings` tab panels
- Replace `hasSidebar` / Main+Sidebar rendering with Hero+Grid rendering
- Hero panel: rendered separately with `.hero-panel` class, full width
- Grid panels: rendered in `.panel-grid` (2-col CSS grid)
- Collapsed panels: rendered as `.panel-collapsed` single-line rows
- Add 📌 pin button to every panel header bar → calls `layout.pinAsHero(key)`
- Remove sidebar drag/drop column logic, keep panel reorder drag/drop within grid
- Remove `dragOverColumn` / `handleColumnDrop` state

### `src/renderer/src/index.css`

- Add `.hero-panel` styles: full width, `border: 2px solid var(--accent)`, larger padding
- Add `.hero-badge` styles: small orange pill with "FOKUS" text
- Add `.panel-grid`: `display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px`
- Add `.panel-collapsed`: compact single-line, dimmed, ▶ indicator
- Add `.pin-btn` styles for the 📌 button
- Remove `.dashboard-sidebar` and related sidebar styles
- Responsive: `@media (max-width: 900px)` → `.panel-grid` becomes single column

### Migration

No breaking changes. The `hero` and `collapsed` fields are added additively to the existing `TabLayout` interface. Existing persisted layouts without these fields fall back to profile defaults via nullish coalescing.

## Files to Modify

| File | Change |
|------|--------|
| `src/renderer/src/hooks/useDashboardLayout.ts` | Hero/collapsed state, profile configs, remove sidebar logic |
| `src/renderer/src/App.tsx` | Hero+Grid rendering, remove sidebar, remove Stats tab, pin button |
| `src/renderer/src/index.css` | Hero/grid/collapsed styles, remove sidebar styles |

## Out of Scope

- Drag & drop between hero and grid (pin button is sufficient for v1)
- Profile editor UI (profiles are code-defined presets)
- Animations/transitions for hero promotion
- Changes to Projekt, Settings, or Hilfe tab layouts

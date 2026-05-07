# Hero Focus Layout Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Dashboard's flat Main+Sidebar layout with a Hero + Grid layout that gives one panel visual prominence, shows secondary panels in a compact grid, and collapses the rest into single-line rows.

**Architecture:** The `useDashboardLayout` hook gains `hero` and `collapsed` fields and new profile presets (`PROFILE_LAYOUT`). `App.tsx` renders three zones: hero (full-width top), grid (2-col), collapsed (single-line rows). The Stats tab is removed and its panel moves into Settings. CSS replaces sidebar styles with hero/grid/collapsed styles.

**Tech Stack:** React, TypeScript, CSS (no new dependencies)

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/renderer/src/hooks/useDashboardLayout.ts` | Layout state: hero, open, collapsed, hidden. Profile presets. Pin/collapse/reorder logic. |
| `src/renderer/src/App.tsx` | Renders hero/grid/collapsed zones. Tab definitions. Pin button in panel headers. |
| `src/renderer/src/index.css` | Visual styles for hero, grid, collapsed panels. Remove sidebar styles. |
| `src/renderer/src/i18n/translations.ts` | New translation keys for pin/focus UI. Remove sidebar translation keys. |

---

### Task 1: Update `useDashboardLayout` hook — data model and profile presets

**Files:**
- Modify: `src/renderer/src/hooks/useDashboardLayout.ts`

- [ ] **Step 1: Update `TabLayout` interface**

Add `hero` and `collapsed` fields. Remove `sidebar` from the interface.

```typescript
interface TabLayout {
  order: string[];
  hidden: string[];
  hero: string;        // panel key pinned as hero
  collapsed: string[]; // panels visible but minimized to single line
}
```

- [ ] **Step 2: Replace `PROFILE_VISIBLE` and `DEFAULT_SIDEBAR` with `PROFILE_LAYOUT`**

Remove `DEFAULT_SIDEBAR` constant and `PROFILE_VISIBLE` constant. Replace with `PROFILE_LAYOUT`:

```typescript
interface ProfileLayout {
  hero: string;
  open: string[];
  hidden: string[];
}

const PROFILE_LAYOUT: Record<string, { dashboard: ProfileLayout; projekt: ProfileLayout }> = {
  creative: {
    dashboard: { hero: 'challenge', open: ['song'], hidden: ['issues', 'clips', 'rewardstats', 'obs'] },
    projekt: { hero: 'progress', open: ['milestones'], hidden: [] },
  },
  gaming: {
    dashboard: { hero: 'challenge', open: ['issues', 'song'], hidden: ['designs', 'clips', 'rewardstats'] },
    projekt: { hero: 'progress', open: [], hidden: ['milestones'] },
  },
  coding: {
    dashboard: { hero: 'challenge', open: ['issues'], hidden: ['designs', 'clips', 'rewardstats'] },
    projekt: { hero: 'progress', open: ['milestones'], hidden: [] },
  },
  chatting: {
    dashboard: { hero: 'designs', open: ['challenge', 'song'], hidden: ['issues', 'clips', 'rewardstats', 'obs'] },
    projekt: { hero: 'progress', open: [], hidden: ['milestones'] },
  },
  all: {
    dashboard: { hero: 'challenge', open: ALL_DASHBOARD_PANELS.filter(k => k !== 'challenge'), hidden: [] },
    projekt: { hero: 'progress', open: ['milestones'], hidden: [] },
  },
};
```

- [ ] **Step 3: Update `getTabLayout` to compute hero and collapsed from profile defaults**

When no saved layout exists, derive the initial state from `PROFILE_LAYOUT`. When a saved layout exists but has no `hero` field, fall back to profile defaults for `hero` and `collapsed`.

```typescript
const getTabLayout = useCallback((): TabLayout => {
  const saved = layout[tabKey];
  const profileKey = currentProfile || 'all';
  const tabProfile = tabKey === 'projekt'
    ? PROFILE_LAYOUT[profileKey]?.projekt
    : PROFILE_LAYOUT[profileKey]?.dashboard;
  const defaultHero = tabProfile?.hero || defaultPanelKeys[0];

  if (!saved) {
    const openSet = new Set(tabProfile?.open || []);
    const hiddenSet = new Set(tabProfile?.hidden || []);
    const collapsed = defaultPanelKeys.filter(k => k !== defaultHero && !openSet.has(k) && !hiddenSet.has(k));
    return {
      order: [...defaultPanelKeys],
      hidden: tabProfile?.hidden || [],
      hero: defaultHero,
      collapsed,
    };
  }

  // Merge: validate saved keys against current defaults
  const validKeys = new Set(defaultPanelKeys);
  const existingOrder = saved.order.filter(k => validKeys.has(k));
  const newKeys = defaultPanelKeys.filter(k => !existingOrder.includes(k));
  return {
    order: [...existingOrder, ...newKeys],
    hidden: saved.hidden.filter(k => validKeys.has(k)),
    hero: saved.hero && validKeys.has(saved.hero) ? saved.hero : defaultHero,
    collapsed: saved.collapsed?.filter(k => validKeys.has(k)) || [],
  };
}, [layout, tabKey, defaultPanelKeys, currentProfile]);
```

Note: `currentProfile` needs to be read from the API. Add a parameter to `useDashboardLayout` or read it from localStorage. The simplest approach: read the `stream_profile` setting from localStorage (it's already stored there by `applyProfilePreset`). Check the existing code in `SettingsPanel.tsx:65` — it reads `profileData?.value`.

For the hook, read it synchronously from localStorage:

```typescript
function getCurrentProfile(): string {
  try {
    const stored = localStorage.getItem('stream_profile');
    return stored || 'all';
  } catch {
    return 'all';
  }
}
```

**Note:** Existing users have `stream_profile` in the server DB but not localStorage. On first load after this change, `getCurrentProfile()` returns `'all'` until the user next switches profiles (which writes to localStorage via the updated `applyProfilePreset`). This is self-correcting and acceptable.

- [ ] **Step 4: Add `pinAsHero` function**

```typescript
const pinAsHero = useCallback((key: string) => {
  const current = getTabLayout();
  const oldHero = current.hero;
  // Demote old hero to first position in open grid (remove from collapsed)
  const newCollapsed = current.collapsed.filter(k => k !== key);
  // If old hero was not already in collapsed, it stays in the open grid (not collapsed)
  update({
    ...current,
    hero: key,
    collapsed: newCollapsed,
  });
}, [getTabLayout, update]);
```

- [ ] **Step 5: Add `toggleCollapsed` function**

This replaces the React `useState` collapsed tracking in `App.tsx`:

```typescript
const toggleCollapsed = useCallback((key: string) => {
  const current = getTabLayout();
  const isCollapsed = current.collapsed.includes(key);
  update({
    ...current,
    collapsed: isCollapsed
      ? current.collapsed.filter(k => k !== key)
      : [...current.collapsed, key],
  });
}, [getTabLayout, update]);
```

- [ ] **Step 6: Remove sidebar-related logic**

Remove these from the hook:
- `DEFAULT_SIDEBAR` constant
- `sidebar` field from `TabLayout` reads
- `sidebarSet`, `sidebarOrder` computed values
- `moveToSidebar` function
- `moveToMain` function
- `fullWidth` related: `toggleWidth`, `isFullWidth`, `fullWidth` from return

Update the return value:

```typescript
return {
  order: visibleOrder,
  hero: tabLayout.hero,
  openOrder,    // visible panels that are not hero and not collapsed
  collapsedOrder, // visible panels that are collapsed
  hidden: tabLayout.hidden,
  reorder,
  hide,
  show,
  pinAsHero,
  toggleCollapsed,
  reset,
};
```

Compute `openOrder` and `collapsedOrder`:

```typescript
const visibleOrder = tabLayout.order.filter(k => !tabLayout.hidden.includes(k));
const collapsedSet = new Set(tabLayout.collapsed);
const openOrder = visibleOrder.filter(k => k !== tabLayout.hero && !collapsedSet.has(k));
const collapsedOrder = visibleOrder.filter(k => k !== tabLayout.hero && collapsedSet.has(k));
```

- [ ] **Step 7: Update `applyProfilePreset` to use `PROFILE_LAYOUT`**

```typescript
export function applyProfilePreset(profile: string): void {
  const preset = PROFILE_LAYOUT[profile] || PROFILE_LAYOUT['all'];
  const layout: DashboardLayout = loadLayout();

  // Dashboard
  const dashProfile = preset.dashboard;
  const dashOpen = new Set(dashProfile.open);
  const dashHidden = new Set(dashProfile.hidden);
  const dashCollapsed = ALL_DASHBOARD_PANELS.filter(
    k => k !== dashProfile.hero && !dashOpen.has(k) && !dashHidden.has(k)
  );
  layout['dashboard'] = {
    order: layout['dashboard']?.order || [...ALL_DASHBOARD_PANELS],
    hidden: dashProfile.hidden,
    hero: dashProfile.hero,
    collapsed: dashCollapsed,
  };

  // Projekt
  const projProfile = preset.projekt;
  const projOpen = new Set(projProfile.open);
  const projHidden = new Set(projProfile.hidden);
  const projCollapsed = ALL_PROJECT_PANELS.filter(
    k => k !== projProfile.hero && !projOpen.has(k) && !projHidden.has(k)
  );
  layout['projekt'] = {
    order: layout['projekt']?.order || [...ALL_PROJECT_PANELS],
    hidden: projProfile.hidden,
    hero: projProfile.hero,
    collapsed: projCollapsed,
  };

  saveLayout(layout);
  localStorage.setItem('stream_profile', profile);
}
```

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/hooks/useDashboardLayout.ts
git commit -m "feat: update useDashboardLayout with hero/collapsed model and profile presets"
```

---

### Task 2: Update `App.tsx` — Hero + Grid rendering and tab simplification

**Files:**
- Modify: `src/renderer/src/App.tsx`

- [ ] **Step 1: Simplify tab structure (remove Stats tab)**

Replace the `TABS` constant. Move `StatsPanel` from stats tab into settings tab. Remove stats tab entirely:

```typescript
const TABS = {
  dashboard: {
    label: '🎮 Dashboard',
    panels: [
      { key: 'challenge', label: 'Challenge', component: ChallengePanel },
      { key: 'issues', label: 'Glücksrad', component: IssuesPanel },
      { key: 'clips', label: 'Clip Moments', component: ClipsPanel },
      { key: 'designs', label: 'Abstimmungen', component: DesignsPanel },
      { key: 'song', label: 'Now Playing', component: SongPanel },
      { key: 'rewardstats', label: 'Reward Stats', component: RewardStatsPanel },
      { key: 'obs', label: 'OBS Scenes', component: ObsPanel },
    ],
  },
  projekt: {
    label: '📋 Projekt',
    panels: [
      { key: 'progress', label: 'Progress Tracker', component: ProgressPanel },
      { key: 'milestones', label: 'Milestones', component: MilestonesPanel },
    ],
  },
  settings: {
    label: '⚙️ Settings',
    panels: [
      { key: 'settings', label: 'Settings', component: SettingsPanel },
      { key: 'overlays', label: 'Overlays', component: OverlaysPanel },
      { key: 'stats', label: 'Statistiken', component: StatsPanel },
    ],
  },
  help: {
    label: '📖 Hilfe',
    panels: [
      { key: 'help', label: 'Hilfe & Dokumentation', component: HelpPanel },
    ],
  },
} as const;
```

- [ ] **Step 2: Remove sidebar and column drag state**

Remove these state variables and handlers from `App.tsx`:
- `const [collapsed, setCollapsed] = useState<Set<string>>(new Set());` — replaced by layout hook
- `const [dragOverColumn, setDragOverColumn] = useState<'main' | 'sidebar' | null>(null);`
- `const hasSidebar = activeTab === 'dashboard';`
- `toggleCollapse` function
- `handleDrop` — simplify to remove column logic
- `handleColumnDrop` — remove entirely

Keep: `dragKey`, `dragOverKey`, `handleDragStart`, `handleDragEnd`, `handleDragOver`, `handleDragEnter`.

Simplify `handleDrop` to only reorder (no column moves):

```typescript
const handleDrop = (targetKey: string, e: React.DragEvent) => {
  e.preventDefault();
  const fromKey = e.dataTransfer.getData('text/plain');
  if (fromKey && fromKey !== targetKey) layout.reorder(fromKey, targetKey);
  setDragKey(null);
  setDragOverKey(null);
};
```

- [ ] **Step 3: Create `renderHeroPanel` function**

```typescript
const renderHeroPanel = () => {
  const p = panelMap.get(layout.hero);
  if (!p) return null;
  const Component = p.component;
  return (
    <div className="hero-panel" data-panel={layout.hero}>
      <div className="panel-header-bar">
        <span className="hero-badge">FOKUS</span>
        <span className="collapse-label">{p.label}</span>
        <div className="panel-header-controls">
          <button
            className="panel-header-btn"
            onClick={() => layout.hide(layout.hero)}
            title={t('layout.hide')}
          >
            👁
          </button>
        </div>
      </div>
      <ErrorBoundary
        fallback={p.label}
        errorTitle={t('error.title')}
        errorMessage={t('error.message')}
        retryLabel={t('error.retry')}
      >
        <Component />
      </ErrorBoundary>
    </div>
  );
};
```

- [ ] **Step 4: Create `renderGridPanel` function**

For open (non-collapsed, non-hero) panels in the 2-col grid:

```typescript
const renderGridPanel = (key: string) => {
  const p = panelMap.get(key);
  if (!p) return null;
  const Component = p.component;
  return (
    <div
      key={key}
      data-panel={key}
      className={`panel-wrapper ${dragKey === key ? 'dragging' : ''} ${dragOverKey === key ? 'drag-over' : ''}`}
      onDragOver={handleDragOver}
      onDragEnter={() => handleDragEnter(key)}
      onDrop={(e) => handleDrop(key, e)}
    >
      <div className="panel-header-bar">
        <span
          className="drag-handle"
          draggable
          onDragStart={(e) => handleDragStart(e, key)}
          onDragEnd={handleDragEnd}
        >
          ⠿
        </span>
        <button className="panel-collapse-btn" onClick={() => layout.toggleCollapsed(key)}>
          <span className="collapse-icon">▼</span>
          <span className="collapse-label">{p.label}</span>
        </button>
        <div className="panel-header-controls">
          <button
            className="pin-btn"
            onClick={() => layout.pinAsHero(key)}
            title={t('layout.pin_as_focus')}
          >
            📌
          </button>
          <button
            className="panel-header-btn"
            onClick={() => layout.hide(key)}
            title={t('layout.hide')}
          >
            👁
          </button>
        </div>
      </div>
      <ErrorBoundary
        fallback={p.label}
        errorTitle={t('error.title')}
        errorMessage={t('error.message')}
        retryLabel={t('error.retry')}
      >
        <Component />
      </ErrorBoundary>
    </div>
  );
};
```

- [ ] **Step 5: Create `renderCollapsedPanel` function**

For collapsed panels (single-line rows):

```typescript
const renderCollapsedPanel = (key: string) => {
  const p = panelMap.get(key);
  if (!p) return null;
  return (
    <div
      key={key}
      data-panel={key}
      className={`panel-wrapper collapsed ${dragKey === key ? 'dragging' : ''} ${dragOverKey === key ? 'drag-over' : ''}`}
      onDragOver={handleDragOver}
      onDragEnter={() => handleDragEnter(key)}
      onDrop={(e) => handleDrop(key, e)}
    >
      <div className="panel-header-bar">
        <span
          className="drag-handle"
          draggable
          onDragStart={(e) => handleDragStart(e, key)}
          onDragEnd={handleDragEnd}
        >
          ⠿
        </span>
        <button className="panel-collapse-btn" onClick={() => layout.toggleCollapsed(key)}>
          <span className="collapse-icon">▶</span>
          <span className="collapse-label">{p.label}</span>
        </button>
        <div className="panel-header-controls">
          <button
            className="pin-btn"
            onClick={() => layout.pinAsHero(key)}
            title={t('layout.pin_as_focus')}
          >
            📌
          </button>
          <button
            className="panel-header-btn"
            onClick={() => layout.hide(key)}
            title={t('layout.hide')}
          >
            👁
          </button>
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 6: Replace the main render with Hero + Grid + Collapsed layout**

Replace the entire `hasSidebar ? (...) : (...)` block and the non-dashboard rendering:

```tsx
{activeTab === 'dashboard' ? (
  <div className="dashboard-hero-layout">
    {renderHeroPanel()}
    {layout.openOrder.length > 0 && (
      <div className="panel-grid">
        {layout.openOrder.map(renderGridPanel)}
      </div>
    )}
    {layout.collapsedOrder.length > 0 && (
      <div className="panel-collapsed-list">
        {layout.collapsedOrder.map(renderCollapsedPanel)}
      </div>
    )}
  </div>
) : (
  <main className="panels single-column">
    {layout.order.map((key) => renderPanel(key, 'main'))}
  </main>
)}
```

Note: Keep the existing `renderPanel` function for non-dashboard tabs (Projekt, Settings, Hilfe). It still handles the simple panel rendering for those tabs. Remove the sidebar-specific logic from it (the `hasSidebar` check and `moveToSidebar`/`moveToMain` buttons).

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/App.tsx
git commit -m "feat: render hero + grid + collapsed layout, simplify tabs"
```

---

### Task 3: Update CSS — hero, grid, and collapsed styles

**Files:**
- Modify: `src/renderer/src/index.css`

- [ ] **Step 1: Replace dashboard sidebar styles with hero layout styles**

Remove the `.dashboard-layout`, `.dashboard-main`, `.dashboard-sidebar`, `.drag-over-column` styles (lines 112–146 of current file).

Add new styles in their place:

```css
/* Dashboard: Hero + Grid Layout */
.dashboard-hero-layout {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px;
  overflow: auto;
}

/* Hero Panel */
.hero-panel {
  border: 2px solid var(--accent);
  border-radius: 10px;
  background: var(--bg-panel);
}

.hero-panel .panel-header-bar {
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
}

.hero-panel .panel {
  border: none;
  border-radius: 0 0 8px 8px;
}

.hero-badge {
  background: #e67e2233;
  color: var(--accent);
  font-size: 11px;
  font-weight: 700;
  padding: 2px 10px;
  border-radius: 10px;
  letter-spacing: 0.5px;
}

/* Panel Grid (open panels) */
.panel-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

/* Collapsed panels list */
.panel-collapsed-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.panel-collapsed-list .panel-wrapper.collapsed .panel-collapse-btn {
  background: #151515;
  border-color: #2a2a2a;
  color: #666;
}

/* Pin button */
.pin-btn {
  background: none;
  border: none;
  cursor: pointer;
  opacity: 0.4;
  font-size: 12px;
  padding: 4px 6px;
  transition: opacity 0.2s;
}
.pin-btn:hover { opacity: 1; }
```

- [ ] **Step 2: Remove `.panel-wrapper.full-width` style**

Remove this line (around line 2857):
```css
.panel-wrapper.full-width { grid-column: 1 / -1; }
```

- [ ] **Step 3: Update responsive breakpoint**

Update the `@media (max-width: 900px)` rule to target the new layout:

```css
@media (max-width: 900px) {
  .dashboard-hero-layout {
    padding: 12px;
    gap: 8px;
  }
  .panel-grid {
    grid-template-columns: 1fr;
  }
}
```

Remove the old `.dashboard-layout` responsive rule.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/index.css
git commit -m "feat: add hero/grid/collapsed CSS, remove sidebar styles"
```

---

### Task 4: Update translations

**Files:**
- Modify: `src/renderer/src/i18n/translations.ts`

- [ ] **Step 1: Add new translation keys and remove obsolete ones**

Add:
```typescript
'layout.pin_as_focus': { de: 'Als Fokus setzen', en: 'Set as focus' },
'layout.focus': { de: 'Fokus', en: 'Focus' },
```

Remove:
```typescript
'layout.move_to_main': { de: 'Nach links verschieben', en: 'Move to main' },
'layout.move_to_sidebar': { de: 'Nach rechts verschieben', en: 'Move to sidebar' },
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/i18n/translations.ts
git commit -m "feat: add focus layout translations, remove sidebar translations"
```

---

### Task 5: Verify and fix

- [ ] **Step 1: Run typecheck**

```bash
npm run typecheck
```

Expected: No errors. If there are errors, fix them. Common issues:
- References to removed `sidebarOrder`, `moveToSidebar`, `moveToMain`, `fullWidth`, `toggleWidth`, `isFullWidth` — grep for these in `src/renderer/` and remove any remaining references
- `TabLayout` shape mismatches in `loadLayout` / `saveLayout` — ensure `hero` and `collapsed` are handled with fallbacks

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

Fix any lint errors.

- [ ] **Step 3: Verify `applyProfilePreset` consumers**

Check that `SettingsPanel.tsx` and `onboarding/ProfileStep.tsx` still work with the updated `applyProfilePreset`. These files import `applyProfilePreset`, `PROFILE_KEYS`, and `ProfileKey` — all of which remain exported with the same signatures. The `window.location.reload()` in SettingsPanel will re-read the new layout from localStorage.

- [ ] **Step 4: Commit any fixes**

```bash
git add -u
git commit -m "fix: resolve typecheck and lint issues from hero layout migration"
```

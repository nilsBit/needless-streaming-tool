import { useState, useCallback, useEffect } from 'react';
import { apiGet, apiPost } from './useApi';

interface TabLayout {
  order: string[];
  hidden: string[];
  hero: string;        // panel key pinned as hero
  collapsed: string[]; // panels visible but minimized to single line
}

interface DashboardLayout {
  [tabKey: string]: TabLayout;
}

const STORAGE_KEY = 'dashboard-layout';

function getCurrentProfile(): string {
  try {
    const stored = localStorage.getItem('stream_profile');
    return stored || 'all';
  } catch {
    return 'all';
  }
}

function loadLayout(): DashboardLayout {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return {};
    const layout = JSON.parse(stored) as DashboardLayout;
    // Migrate old 'stream' key to 'dashboard'
    if (layout['stream'] && !layout['dashboard']) {
      layout['dashboard'] = layout['stream'];
      delete layout['stream'];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    }
    return layout;
  } catch {
    return {};
  }
}

function saveLayout(layout: DashboardLayout): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  apiPost('/settings/set', { key: 'ui.dashboard_layout', value: JSON.stringify(layout) });
}

// --- Stream Profile Presets ---
const ALL_DASHBOARD_PANELS = ['challenge', 'issues', 'clips', 'designs', 'song', 'rewardstats', 'obs'];
const ALL_PROJECT_PANELS = ['progress', 'milestones'];

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

export const PROFILE_KEYS = ['creative', 'gaming', 'coding', 'chatting', 'all'] as const;
export type ProfileKey = typeof PROFILE_KEYS[number];

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

export function useDashboardLayout(tabKey: string, defaultPanelKeys: string[]) {
  const [layout, setLayout] = useState<DashboardLayout>(loadLayout);
  const currentProfile = getCurrentProfile();

  useEffect(() => {
    apiGet<{ value: string | null }>('/settings/get/ui.dashboard_layout').then((res) => {
      if (res?.value) {
        try {
          const dbLayout = JSON.parse(res.value) as DashboardLayout;
          // Migrate old 'stream' key to 'dashboard'
          if (dbLayout['stream'] && !dbLayout['dashboard']) {
            dbLayout['dashboard'] = dbLayout['stream'];
            delete dbLayout['stream'];
          }
          setLayout(dbLayout);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(dbLayout));
        } catch { /* ignore parse errors */ }
      } else {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          apiPost('/settings/set', { key: 'ui.dashboard_layout', value: stored });
        }
      }
    });
  }, []);

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

  const tabLayout = getTabLayout();

  const update = useCallback((newTabLayout: TabLayout) => {
    setLayout(prev => {
      const next = { ...prev, [tabKey]: newTabLayout };
      saveLayout(next);
      return next;
    });
  }, [tabKey]);

  const visibleOrder = tabLayout.order.filter(k => !tabLayout.hidden.includes(k));
  const collapsedSet = new Set(tabLayout.collapsed);
  const openOrder = visibleOrder.filter(k => k !== tabLayout.hero && !collapsedSet.has(k));
  const collapsedOrder = visibleOrder.filter(k => k !== tabLayout.hero && collapsedSet.has(k));

  const reorder = useCallback((fromKey: string, toKey: string) => {
    if (fromKey === toKey) return;
    const current = getTabLayout();
    const newOrder = [...current.order];
    const fromIdx = newOrder.indexOf(fromKey);
    const toIdx = newOrder.indexOf(toKey);
    if (fromIdx === -1 || toIdx === -1) return;
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, fromKey);
    update({ ...current, order: newOrder });
  }, [getTabLayout, update]);

  const hide = useCallback((key: string) => {
    const current = getTabLayout();
    if (current.hidden.includes(key)) return;
    update({ ...current, hidden: [...current.hidden, key] });
  }, [getTabLayout, update]);

  const show = useCallback((key: string) => {
    const current = getTabLayout();
    update({ ...current, hidden: current.hidden.filter(k => k !== key) });
  }, [getTabLayout, update]);

  const pinAsHero = useCallback((key: string) => {
    const current = getTabLayout();
    const newCollapsed = current.collapsed.filter(k => k !== key);
    const newHidden = current.hidden.filter(k => k !== key); // unhide if hidden
    update({
      ...current,
      hero: key,
      collapsed: newCollapsed,
      hidden: newHidden,
    });
  }, [getTabLayout, update]);

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

  const reset = useCallback(() => {
    const profileKey = currentProfile || 'all';
    const tabProfile = tabKey === 'projekt'
      ? PROFILE_LAYOUT[profileKey]?.projekt
      : PROFILE_LAYOUT[profileKey]?.dashboard;
    const defaultHero = tabProfile?.hero || defaultPanelKeys[0];
    const openSet = new Set(tabProfile?.open || []);
    const hiddenSet = new Set(tabProfile?.hidden || []);
    const collapsed = defaultPanelKeys.filter(k => k !== defaultHero && !openSet.has(k) && !hiddenSet.has(k));
    update({
      order: [...defaultPanelKeys],
      hidden: tabProfile?.hidden || [],
      hero: defaultHero,
      collapsed,
    });
  }, [defaultPanelKeys, tabKey, currentProfile, update]);

  return {
    order: visibleOrder,
    hero: tabLayout.hero,
    openOrder,
    collapsedOrder,
    hidden: tabLayout.hidden,
    reorder,
    hide,
    show,
    pinAsHero,
    toggleCollapsed,
    reset,
  };
}

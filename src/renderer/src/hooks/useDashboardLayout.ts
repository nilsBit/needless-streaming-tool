import { useState, useCallback } from 'react';

interface TabLayout {
  order: string[];
  hidden: string[];
  fullWidth: string[];
}

interface DashboardLayout {
  [tabKey: string]: TabLayout;
}

const STORAGE_KEY = 'dashboard-layout';

function loadLayout(): DashboardLayout {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function saveLayout(layout: DashboardLayout): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
}

export function useDashboardLayout(tabKey: string, defaultPanelKeys: string[]) {
  const [layout, setLayout] = useState<DashboardLayout>(loadLayout);

  const getTabLayout = useCallback((): TabLayout => {
    const saved = layout[tabKey];
    if (!saved) {
      return { order: [...defaultPanelKeys], hidden: [], fullWidth: [] };
    }
    // Merge: add new panels not in saved order, remove panels no longer in defaults
    const validKeys = new Set(defaultPanelKeys);
    const existingOrder = saved.order.filter(k => validKeys.has(k));
    const newKeys = defaultPanelKeys.filter(k => !existingOrder.includes(k));
    return {
      order: [...existingOrder, ...newKeys],
      hidden: saved.hidden.filter(k => validKeys.has(k)),
      fullWidth: saved.fullWidth.filter(k => validKeys.has(k)),
    };
  }, [layout, tabKey, defaultPanelKeys]);

  const tabLayout = getTabLayout();

  const update = useCallback((newTabLayout: TabLayout) => {
    setLayout(prev => {
      const next = { ...prev, [tabKey]: newTabLayout };
      saveLayout(next);
      return next;
    });
  }, [tabKey]);

  const visibleOrder = tabLayout.order.filter(k => !tabLayout.hidden.includes(k));

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

  const toggleWidth = useCallback((key: string) => {
    const current = getTabLayout();
    const isFullWidth = current.fullWidth.includes(key);
    update({
      ...current,
      fullWidth: isFullWidth
        ? current.fullWidth.filter(k => k !== key)
        : [...current.fullWidth, key],
    });
  }, [getTabLayout, update]);

  const isFullWidth = useCallback((key: string) => {
    return tabLayout.fullWidth.includes(key);
  }, [tabLayout]);

  const reset = useCallback(() => {
    update({ order: [...defaultPanelKeys], hidden: [], fullWidth: [] });
  }, [defaultPanelKeys, update]);

  return {
    order: visibleOrder,
    hidden: tabLayout.hidden,
    fullWidth: new Set(tabLayout.fullWidth),
    reorder,
    hide,
    show,
    toggleWidth,
    isFullWidth,
    reset,
  };
}

// --- Stream Profile Presets ---
const ALL_STREAM_PANELS = ['challenge', 'issues', 'clips', 'designs', 'song'];
const ALL_PROJECT_PANELS = ['progress', 'milestones'];

const PROFILE_VISIBLE: Record<string, { stream: string[]; projekt: string[] }> = {
  creative: { stream: ['challenge', 'clips', 'song'], projekt: ['progress', 'milestones'] },
  gaming:   { stream: ['challenge', 'clips', 'issues', 'song'], projekt: [] },
  coding:   { stream: ['challenge', 'clips', 'issues'], projekt: ['progress', 'milestones'] },
  chatting: { stream: ['challenge', 'clips', 'designs', 'song'], projekt: [] },
  all:      { stream: ALL_STREAM_PANELS, projekt: ALL_PROJECT_PANELS },
};

export const PROFILE_KEYS = ['creative', 'gaming', 'coding', 'chatting', 'all'] as const;
export type ProfileKey = typeof PROFILE_KEYS[number];

export function applyProfilePreset(profile: string): void {
  const preset = PROFILE_VISIBLE[profile] || PROFILE_VISIBLE['all'];
  const layout: DashboardLayout = loadLayout();

  // Set hidden arrays for stream and projekt tabs
  const streamHidden = ALL_STREAM_PANELS.filter(k => !preset.stream.includes(k));
  const projektHidden = ALL_PROJECT_PANELS.filter(k => !preset.projekt.includes(k));

  layout['stream'] = {
    order: layout['stream']?.order || [...ALL_STREAM_PANELS],
    hidden: streamHidden,
    fullWidth: layout['stream']?.fullWidth || [],
  };
  layout['projekt'] = {
    order: layout['projekt']?.order || [...ALL_PROJECT_PANELS],
    hidden: projektHidden,
    fullWidth: layout['projekt']?.fullWidth || [],
  };

  saveLayout(layout);
}

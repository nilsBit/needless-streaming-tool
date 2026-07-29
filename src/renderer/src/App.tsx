import React, { useState, useEffect, useMemo } from 'react';
import ErrorBoundary from './components/ErrorBoundary';
import { useToast } from './contexts/ToastContext';
import { useDashboardLayout } from './hooks/useDashboardLayout';
import ChallengePanel from './panels/ChallengePanel';
import IssuesPanel from './panels/IssuesPanel';
import ProgressPanel from './panels/ProgressPanel';
import DesignsPanel from './panels/DesignsPanel';
import ClipsPanel from './panels/ClipsPanel';
import MilestonesPanel from './panels/MilestonesPanel';
import SettingsPanel from './panels/SettingsPanel';
import OverlaysPanel from './panels/OverlaysPanel';
import HelpPanel from './panels/HelpPanel';
import SongPanel from './panels/SongPanel';
import StatsPanel from './panels/StatsPanel';
import RewardStatsPanel from './panels/RewardStatsPanel';
import ObsPanel from './panels/ObsPanel';
import logoSvg from './assets/logo.svg';

interface UpdateInfo { version: string; url: string }

type Area = 'live' | 'produktion' | 'shared';

const AREAS = {
  live: { icon: '🔴', label: 'Live' },
  produktion: { icon: '🎬', label: 'Produktion' },
} as const;
type AreaKey = keyof typeof AREAS;

const TABS = {
  live: {
    area: 'live',
    icon: '🔴',
    label: 'Live',
    panels: [
      { key: 'challenge', label: 'Challenge', component: ChallengePanel },
      { key: 'issues', label: 'Glücksrad', component: IssuesPanel },
      { key: 'designs', label: 'Abstimmungen', component: DesignsPanel },
      { key: 'rewardstats', label: 'Reward Stats', component: RewardStatsPanel },
      { key: 'song', label: 'Now Playing', component: SongPanel },
      { key: 'obs', label: 'OBS Scenes', component: ObsPanel },
    ],
  },
  produktion: {
    area: 'produktion',
    icon: '🎬',
    label: 'Produktion',
    panels: [
      { key: 'clips', label: 'Clip Moments', component: ClipsPanel },
    ],
  },
  projekt: {
    area: 'produktion',
    icon: '📋',
    label: 'Projekt',
    panels: [
      { key: 'progress', label: 'Progress Tracker', component: ProgressPanel },
      { key: 'stats', label: 'Statistiken', component: StatsPanel },
    ],
  },
  settings: {
    area: 'shared',
    icon: '⚙️',
    label: 'Settings',
    panels: [
      { key: 'settings', label: 'Settings', component: SettingsPanel },
      { key: 'overlays', label: 'Overlays', component: OverlaysPanel },
      { key: 'milestones', label: 'Milestones', component: MilestonesPanel },
    ],
  },
  help: {
    area: 'shared',
    icon: '📖',
    label: 'Hilfe',
    panels: [
      { key: 'help', label: 'Hilfe & Dokumentation', component: HelpPanel },
    ],
  },
} as const satisfies Record<string, { area: Area; icon: string; label: string; panels: ReadonlyArray<{ key: string; label: string; component: React.ComponentType }> }>;

const AREA_STORAGE_KEY = 'stream_area';

function loadActiveArea(): AreaKey {
  try {
    const stored = localStorage.getItem(AREA_STORAGE_KEY);
    if (stored === 'live' || stored === 'produktion') return stored;
  } catch { /* ignore */ }
  return 'live';
}

function firstTabInArea(area: AreaKey): TabKey {
  const found = (Object.keys(TABS) as TabKey[]).find((k) => TABS[k].area === area);
  return found ?? 'live';
}

type TabKey = keyof typeof TABS;

export default function App() {
  const { toast } = useToast();
  const [activeArea, setActiveArea] = useState<AreaKey>(loadActiveArea);
  const [activeTab, setActiveTab] = useState<TabKey>(() => firstTabInArea(loadActiveArea()));

  // Persist area + keep activeTab valid within current area.
  useEffect(() => {
    try { localStorage.setItem(AREA_STORAGE_KEY, activeArea); } catch { /* ignore */ }
    const currentArea = TABS[activeTab].area;
    if (currentArea !== 'shared' && currentArea !== activeArea) {
      setActiveTab(firstTabInArea(activeArea));
    }
  }, [activeArea, activeTab]);

  const visibleTabKeys = useMemo(
    () => (Object.keys(TABS) as TabKey[]).filter((k) => {
      const a = TABS[k].area;
      return a === activeArea || a === 'shared';
    }),
    [activeArea]
  );

  // Get default panel keys for active tab
  const defaultPanelKeys = useMemo(() =>
    TABS[activeTab].panels.map(p => p.key),
    [activeTab]
  );
  const layout = useDashboardLayout(activeTab, defaultPanelKeys);

  // Drag state
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onUpdateAvailable) return;
    const handler = (data: UpdateInfo) => {
      toast.errorAction({
        message: `Neues Update verfügbar: v${data.version}`,
        action: {
          label: 'Herunterladen',
          onClick: () => window.open(data.url, '_blank'),
        },
      });
    };
    api.onUpdateAvailable(handler);
  }, []);

  const tab = TABS[activeTab];

  const panelMap = useMemo(() => {
    const map = new Map<string, { key: string; label: string; component: React.ComponentType }>();
    for (const p of tab.panels) {
      map.set(p.key, p);
    }
    return map;
  }, [tab]);

  const handleDragStart = (e: React.DragEvent, key: string) => {
    e.dataTransfer.setData('text/plain', key);
    e.dataTransfer.effectAllowed = 'move';
    setDragKey(key);
  };

  const handleDragEnd = () => {
    setDragKey(null);
    setDragOverKey(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnter = (key: string) => {
    if (dragKey && dragKey !== key) setDragOverKey(key);
  };

  const handleDrop = (targetKey: string, e: React.DragEvent) => {
    e.preventDefault();
    const fromKey = e.dataTransfer.getData('text/plain');
    if (fromKey && fromKey !== targetKey) layout.reorder(fromKey, targetKey);
    setDragKey(null);
    setDragOverKey(null);
  };

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
              title="Ausblenden"
            >
              👁
            </button>
          </div>
        </div>
        <ErrorBoundary
          fallback={p.label}
          errorTitle="Fehler"
          errorMessage="Etwas ist schiefgelaufen."
          retryLabel="Nochmal versuchen"
        >
          <Component />
        </ErrorBoundary>
      </div>
    );
  };

  const renderDashboardPanel = (key: string, isCollapsed: boolean) => {
    const p = panelMap.get(key);
    if (!p) return null;
    const Component = p.component;
    return (
      <div
        key={key}
        data-panel={key}
        className={`panel-wrapper ${isCollapsed ? 'collapsed' : ''} ${dragKey === key ? 'dragging' : ''} ${dragOverKey === key ? 'drag-over' : ''}`}
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
            <span className="collapse-icon">{isCollapsed ? '▶' : '▼'}</span>
            <span className="collapse-label">{p.label}</span>
          </button>
          <div className="panel-header-controls">
            <button
              className="pin-btn"
              onClick={() => layout.pinAsHero(key)}
              title="Als Fokus setzen"
            >
              📌
            </button>
            <button
              className="panel-header-btn"
              onClick={() => layout.hide(key)}
              title="Ausblenden"
            >
              👁
            </button>
          </div>
        </div>
        {!isCollapsed && (
          <ErrorBoundary
            fallback={p.label}
            errorTitle="Fehler"
            errorMessage="Etwas ist schiefgelaufen."
            retryLabel="Nochmal versuchen"
          >
            <Component />
          </ErrorBoundary>
        )}
      </div>
    );
  };

  const renderPanel = (key: string) => {
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
          <span className="collapse-label">{p.label}</span>
          <div className="panel-header-controls">
            <button
              className="panel-header-btn"
              onClick={() => layout.hide(key)}
              title="Ausblenden"
            >
              👁
            </button>
          </div>
        </div>
        <ErrorBoundary
          fallback={p.label}
          errorTitle="Fehler"
          errorMessage="Etwas ist schiefgelaufen."
          retryLabel="Nochmal versuchen"
        >
          <Component />
        </ErrorBoundary>
      </div>
    );
  };

  return (
    <div className="app">
      <header className="app-header">
        <img src={logoSvg} alt="NST" className="app-logo" />
        <nav className="area-nav">
          {(Object.entries(AREAS) as Array<[AreaKey, typeof AREAS[AreaKey]]>).map(([key, areaDef]) => (
            <button
              key={key}
              className={`area-btn ${activeArea === key ? 'active' : ''}`}
              onClick={() => setActiveArea(key)}
            >
              {areaDef.icon} {areaDef.label}
            </button>
          ))}
        </nav>
        <nav className="tab-nav">
          {visibleTabKeys.map((key) => {
            const tabDef = TABS[key];
            return (
              <button
                key={key}
                className={`tab-btn ${activeTab === key ? 'active' : ''}`}
                onClick={() => setActiveTab(key)}
              >
                {tabDef.icon} {tabDef.label}
              </button>
            );
          })}
        </nav>
      </header>

      {(activeTab === 'live' || activeTab === 'produktion') ? (
        <div className="dashboard-hero-layout">
          {renderHeroPanel()}
          {layout.openOrder.length > 0 && (
            <div className="panel-grid">
              {layout.openOrder.map((key) => renderDashboardPanel(key, false))}
            </div>
          )}
          {layout.collapsedOrder.length > 0 && (
            <div className="panel-collapsed-list">
              {layout.collapsedOrder.map((key) => renderDashboardPanel(key, true))}
            </div>
          )}
        </div>
      ) : (
        <main className="panels single-column">
          {layout.order.map((key) => renderPanel(key))}
        </main>
      )}

      {/* Hidden panels bar */}
      {layout.hidden.length > 0 && (
        <div className="hidden-bar">
          <span className="hidden-bar-label">Ausgeblendet:</span>
          {layout.hidden.map((key) => {
            const p = panelMap.get(key);
            return p ? (
              <button key={key} className="hidden-bar-btn" onClick={() => layout.show(key)}>
                {p.label}
              </button>
            ) : null;
          })}
          <button className="hidden-bar-btn" onClick={layout.reset} title="Layout zurücksetzen">
            ↩️ Layout zurücksetzen
          </button>
        </div>
      )}
    </div>
  );
}

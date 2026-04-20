import React, { useState, useEffect, useMemo } from 'react';
import ErrorBoundary from './components/ErrorBoundary';
import OnboardingWizard from './components/OnboardingWizard';
import { apiFetch, getApiToken } from './hooks/useApi';
import { useDashboardLayout } from './hooks/useDashboardLayout';
import { useTranslation } from './i18n/LanguageContext';
import ChallengePanel from './panels/ChallengePanel';
import IssuesPanel from './panels/IssuesPanel';
import ProgressPanel from './panels/ProgressPanel';
import DesignsPanel from './panels/DesignsPanel';
import ClipsPanel from './panels/ClipsPanel';
import MilestonesPanel from './panels/MilestonesPanel';
import TodosPanel from './panels/TodosPanel';
import SettingsPanel from './panels/SettingsPanel';
import OverlaysPanel from './panels/OverlaysPanel';
import HelpPanel from './panels/HelpPanel';
import SongPanel from './panels/SongPanel';
import RaidsPanel from './panels/RaidsPanel';
import StatsPanel from './panels/StatsPanel';
import HotkeysPanel from './panels/HotkeysPanel';

const TABS = {
  stream: {
    label: '🎮 Stream',
    panels: [
      { key: 'challenge', label: 'Challenge', component: ChallengePanel },
      { key: 'issues', label: 'Glücksrad', component: IssuesPanel },
      { key: 'clips', label: 'Clip Moments', component: ClipsPanel },
      { key: 'designs', label: 'Chat Designs', component: DesignsPanel },
      { key: 'song', label: 'Now Playing', component: SongPanel },
      { key: 'raids', label: 'Raids', component: RaidsPanel },
    ],
  },
  projekt: {
    label: '📋 Projekt',
    panels: [
      { key: 'progress', label: 'Progress Tracker', component: ProgressPanel },
      { key: 'milestones', label: 'Milestones', component: MilestonesPanel },
      { key: 'todos', label: 'Todos', component: TodosPanel },
    ],
  },
  stats: {
    label: '📊 Stats',
    panels: [
      { key: 'stats', label: 'Statistiken', component: StatsPanel },
    ],
  },
  settings: {
    label: '⚙️ Settings',
    panels: [
      { key: 'settings', label: 'Settings', component: SettingsPanel },
      { key: 'overlays', label: 'Overlays', component: OverlaysPanel },
      { key: 'hotkeys', label: 'Hotkeys', component: HotkeysPanel },
    ],
  },
  help: {
    label: '📖 Hilfe',
    panels: [
      { key: 'help', label: 'Hilfe & Dokumentation', component: HelpPanel },
    ],
  },
} as const;

type TabKey = keyof typeof TABS;

export default function App() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabKey>('stream');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);
  const [singleColumn, setSingleColumn] = useState(() => localStorage.getItem('dashboard-single-column') === 'true');

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
    let retries = 0;
    function checkOnboarding() {
      const token = getApiToken();
      if (!token) {
        if (retries++ < 20) {
          setTimeout(checkOnboarding, 500);
        } else {
          setShowOnboarding(false);
        }
        return;
      }
      apiFetch('/settings/onboarding')
        .then((r) => r.json())
        .then((data) => setShowOnboarding(!data.completed))
        .catch(() => setShowOnboarding(false));
    }
    checkOnboarding();
  }, []);

  const toggleCollapse = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

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
    if (fromKey && fromKey !== targetKey) {
      layout.reorder(fromKey, targetKey);
    }
    setDragKey(null);
    setDragOverKey(null);
  };

  if (showOnboarding === null) return null; // Loading
  if (showOnboarding) return <OnboardingWizard onComplete={() => setShowOnboarding(false)} />;

  return (
    <div className="app">
      <header className="app-header">
        <h1>🔬 The Lab</h1>
        <nav className="tab-nav">
          {(Object.entries(TABS) as Array<[TabKey, typeof TABS[TabKey]]>).map(([key, t]) => (
            <button
              key={key}
              className={`tab-btn ${activeTab === key ? 'active' : ''}`}
              onClick={() => setActiveTab(key)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <button
          className={`column-toggle-btn ${singleColumn ? 'single' : ''}`}
          onClick={() => {
            const next = !singleColumn;
            setSingleColumn(next);
            localStorage.setItem('dashboard-single-column', String(next));
          }}
          title={singleColumn ? t('layout.half_width') : t('layout.full_width')}
        >
          <span className="column-toggle-icon">
            <span className="col-block" />
            {!singleColumn && <span className="col-block" />}
          </span>
          <span className="column-toggle-label">{singleColumn ? '1' : '2'}</span>
        </button>
      </header>
      <main className={`panels ${singleColumn ? 'single-column' : ''}`}>
        {layout.order.map((key) => {
          const p = panelMap.get(key);
          if (!p) return null;
          const isCollapsed = collapsed.has(key);
          const Component = p.component;
          return (
            <div
              key={key}
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
                <button className="panel-collapse-btn" onClick={() => toggleCollapse(key)}>
                  <span className="collapse-icon">{isCollapsed ? '▶' : '▼'}</span>
                  <span className="collapse-label">{p.label}</span>
                </button>
                <div className="panel-header-controls">
                  <button
                    className="panel-header-btn"
                    onClick={() => layout.hide(key)}
                    title={t('layout.hide')}
                  >
                    👁
                  </button>
                </div>
              </div>
              {!isCollapsed && (
                <ErrorBoundary
                  fallback={p.label}
                  errorTitle={t('error.title')}
                  errorMessage={t('error.message')}
                  retryLabel={t('error.retry')}
                >
                  <Component />
                </ErrorBoundary>
              )}
            </div>
          );
        })}
      </main>

      {/* Hidden panels bar */}
      {layout.hidden.length > 0 && (
        <div className="hidden-bar">
          <span className="hidden-bar-label">{t('layout.hidden_panels')}:</span>
          {layout.hidden.map((key) => {
            const p = panelMap.get(key);
            return p ? (
              <button key={key} className="hidden-bar-btn" onClick={() => layout.show(key)}>
                {p.label}
              </button>
            ) : null;
          })}
          <button className="hidden-bar-btn" onClick={layout.reset} title={t('layout.reset')}>
            ↩️ {t('layout.reset')}
          </button>
        </div>
      )}
    </div>
  );
}

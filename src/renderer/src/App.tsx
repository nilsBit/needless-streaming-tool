import React, { useState, useEffect } from 'react';
import ErrorBoundary from './components/ErrorBoundary';
import OnboardingWizard from './components/OnboardingWizard';
import { apiFetch, getApiToken } from './hooks/useApi';
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
      </header>
      <main className="panels">
        {tab.panels.map((p) => {
          const isCollapsed = collapsed.has(p.key);
          const Component = p.component;
          return (
            <div key={p.key} className={`panel-wrapper ${isCollapsed ? 'collapsed' : ''}`}>
              <button className="panel-collapse-btn" onClick={() => toggleCollapse(p.key)}>
                <span className="collapse-icon">{isCollapsed ? '▶' : '▼'}</span>
                <span className="collapse-label">{p.label}</span>
              </button>
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
    </div>
  );
}

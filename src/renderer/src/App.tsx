import React, { useState, useEffect } from 'react';
import ErrorBoundary from './components/ErrorBoundary';
import OnboardingWizard from './components/OnboardingWizard';
import { getApiToken } from './hooks/useApi';
import ExperimentPanel from './panels/ExperimentPanel';
import BugsPanel from './panels/BugsPanel';
import ProgressPanel from './panels/ProgressPanel';
import DesignsPanel from './panels/DesignsPanel';
import ClipsPanel from './panels/ClipsPanel';
import MilestonesPanel from './panels/MilestonesPanel';
import TodosPanel from './panels/TodosPanel';
import SettingsPanel from './panels/SettingsPanel';
import OverlaysPanel from './panels/OverlaysPanel';
import HelpPanel from './panels/HelpPanel';

const TABS = {
  stream: {
    label: '🎮 Stream',
    panels: [
      { key: 'experiment', label: 'Experiment', component: ExperimentPanel },
      { key: 'bugs', label: 'Bug-Roulette', component: BugsPanel },
      { key: 'clips', label: 'Clip Moments', component: ClipsPanel },
      { key: 'designs', label: 'Chat Designs', component: DesignsPanel },
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
  settings: {
    label: '⚙️ Settings',
    panels: [
      { key: 'settings', label: 'Settings', component: SettingsPanel },
      { key: 'overlays', label: 'Overlays', component: OverlaysPanel },
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
  const [activeTab, setActiveTab] = useState<TabKey>('stream');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    function checkOnboarding() {
      const token = getApiToken();
      if (!token) {
        // Token not yet in URL hash, retry
        setTimeout(checkOnboarding, 500);
        return;
      }
      fetch('http://localhost:4000/api/settings/onboarding', {
        headers: { 'Authorization': `Bearer ${token}` },
      })
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
                <ErrorBoundary fallback={p.label}>
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

import React, { useState } from 'react';
import ErrorBoundary from './components/ErrorBoundary';
import ExperimentPanel from './panels/ExperimentPanel';
import BugsPanel from './panels/BugsPanel';
import ProgressPanel from './panels/ProgressPanel';
import DesignsPanel from './panels/DesignsPanel';
import ClipsPanel from './panels/ClipsPanel';
import MilestonesPanel from './panels/MilestonesPanel';
import TodosPanel from './panels/TodosPanel';
import SettingsPanel from './panels/SettingsPanel';

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
    ],
  },
} as const;

type TabKey = keyof typeof TABS;

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('stream');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleCollapse = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const tab = TABS[activeTab];

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

import React from 'react';
import ErrorBoundary from './components/ErrorBoundary';
import ExperimentPanel from './panels/ExperimentPanel';
import BugsPanel from './panels/BugsPanel';
import RaidsPanel from './panels/RaidsPanel';
import DesignsPanel from './panels/DesignsPanel';
import RewardsPanel from './panels/RewardsPanel';
import SettingsPanel from './panels/SettingsPanel';

export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>🔬 The Lab</h1>
        <span className="status">Stream Toolkit</span>
      </header>
      <main className="panels">
        <ErrorBoundary fallback="Experiment">
          <ExperimentPanel />
        </ErrorBoundary>
        <ErrorBoundary fallback="Bug-Roulette">
          <BugsPanel />
        </ErrorBoundary>
        <ErrorBoundary fallback="Raid-Boss Queue">
          <RaidsPanel />
        </ErrorBoundary>
        <ErrorBoundary fallback="Chat Designs">
          <DesignsPanel />
        </ErrorBoundary>
        <ErrorBoundary fallback="Rewards">
          <RewardsPanel />
        </ErrorBoundary>
        <ErrorBoundary fallback="Settings">
          <SettingsPanel />
        </ErrorBoundary>
      </main>
    </div>
  );
}

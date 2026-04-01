import React from 'react';
import ErrorBoundary from './components/ErrorBoundary';
import ExperimentPanel from './panels/ExperimentPanel';
import BugsPanel from './panels/BugsPanel';
import ProgressPanel from './panels/ProgressPanel';
import DesignsPanel from './panels/DesignsPanel';
import ClipsPanel from './panels/ClipsPanel';
import MilestonesPanel from './panels/MilestonesPanel';
import TodosPanel from './panels/TodosPanel';
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
        <ErrorBoundary fallback="Progress Tracker">
          <ProgressPanel />
        </ErrorBoundary>
        <ErrorBoundary fallback="Chat Designs">
          <DesignsPanel />
        </ErrorBoundary>
        <ErrorBoundary fallback="Clip Moments">
          <ClipsPanel />
        </ErrorBoundary>
        <ErrorBoundary fallback="Milestones">
          <MilestonesPanel />
        </ErrorBoundary>
        <ErrorBoundary fallback="Todos">
          <TodosPanel />
        </ErrorBoundary>
        <ErrorBoundary fallback="Settings">
          <SettingsPanel />
        </ErrorBoundary>
      </main>
    </div>
  );
}

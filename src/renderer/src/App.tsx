import React from 'react';
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
        <ExperimentPanel />
        <BugsPanel />
        <RaidsPanel />
        <DesignsPanel />
        <RewardsPanel />
        <SettingsPanel />
      </main>
    </div>
  );
}

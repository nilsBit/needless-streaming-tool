import React from 'react';

export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>🔬 The Lab</h1>
        <span className="status">Stream Toolkit</span>
      </header>
      <main className="panels">
        <div className="panel">Experiment Control</div>
        <div className="panel">Bug-Roulette</div>
        <div className="panel">Raid-Boss Queue</div>
        <div className="panel">Chat Designs</div>
        <div className="panel">Rewards Log</div>
        <div className="panel">Settings</div>
      </main>
    </div>
  );
}

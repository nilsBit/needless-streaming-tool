import React from 'react';

export default function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="onboarding-step welcome-step">
      <div className="welcome-icon">🔬</div>
      <h1>Willkommen im Lab!</h1>
      <p className="welcome-text">
        Dein Stream Toolkit für GameDev Streaming. Hier steuerst du alles
        — Overlays, Experiments, Bugs, Clips, Milestones und mehr.
      </p>
      <p className="welcome-sub">
        Lass uns in ein paar Schritten alles einrichten.
      </p>
      <button className="btn-primary" onClick={onNext}>Setup starten</button>
    </div>
  );
}

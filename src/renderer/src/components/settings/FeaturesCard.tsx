import React from 'react';
import { useFeatures } from '../../contexts/FeaturesContext';
import { FEATURES, PERSONAL_FEATURES } from '../../../../shared/features';

// Einstellungen → Programm: what the stream can do, as chips, and the way back
// into the setup. Off is hidden, never gone.
export default function FeaturesCard() {
  const { features, worldbuilder, openSetup } = useFeatures();
  const available = FEATURES.filter((f) => worldbuilder || !PERSONAL_FEATURES.includes(f.key));
  const on = available.filter((f) => features.has(f.key));
  return (
    <div className="s-card" data-card="features">
      <div className="s-card-header">
        <div className="s-card-info">
          <div>
            <div className="s-card-title">Was dein Stream kann</div>
            <div className="s-card-status" style={{ color: '#888' }}>
              {on.length} von {available.length} Funktionen sind an. Die App zeigt nur die – Karten auf „Im Stream“, Overlays in der Liste, Befehle im Chat. Ausgeschaltetes ist nicht weg, nur ausgeblendet.
            </div>
          </div>
        </div>
        <button type="button" className="s-card-action primary" onClick={openSetup}>Ändern</button>
      </div>
      <div className="s-card-body" style={{ paddingTop: 0 }}>
        <div className="chip-row">
          {on.map((f) => <span key={f.key} className="chip chip-on">{f.label}</span>)}
          {on.length === 0 && <span className="dialog-hint">Nichts ist an.</span>}
        </div>
        <p className="dialog-hint" style={{ margin: '10px 0 0' }}>„Ändern“ öffnet die Einrichtung mit allen vier Schritten – Auswahl, Verbinden, OBS, Fertig – mit dem, was schon steht.</p>
      </div>
    </div>
  );
}

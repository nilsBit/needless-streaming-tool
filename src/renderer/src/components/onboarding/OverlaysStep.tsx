import React, { useState } from 'react';
import { useApi } from '../../hooks/useApi';

interface OverlayInfo {
  name: string;
  url: string;
}

export default function OverlaysStep() {
  const { data: overlays } = useApi<OverlayInfo[]>('/overlays/builtin');
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const copy = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  return (
    <div className="onboarding-step">
      <h2>Overlays</h2>
      <p className="step-desc">Overlays sind die Anzeigen die deine Zuschauer im Stream sehen — Todos, Progress, Alerts und mehr. So fügst du sie in OBS ein:</p>

      <div className="onboarding-steps-list">
        <div className="setup-instruction">
          <span className="instruction-number">1</span>
          <span>In OBS: Klicke bei <strong>Quellen</strong> auf <strong>"+"</strong> → wähle <strong>"Browser"</strong></span>
        </div>
        <div className="setup-instruction">
          <span className="instruction-number">2</span>
          <span>Gib einen Namen ein (z.B. "Todos Overlay") und klicke <strong>"OK"</strong></span>
        </div>
        <div className="setup-instruction">
          <span className="instruction-number">3</span>
          <span>Kopiere eine URL von unten und füge sie im Feld <strong>"URL"</strong> ein</span>
        </div>
        <div className="setup-instruction">
          <span className="instruction-number">4</span>
          <span>Passe <strong>Breite</strong> (z.B. 400) und <strong>Höhe</strong> (z.B. 600) an und klicke <strong>"OK"</strong></span>
        </div>
      </div>

      <p className="step-desc" style={{ marginTop: '12px' }}>Verfügbare Overlays — klicke auf "URL kopieren" und füge sie in OBS ein:</p>

      <div className="overlay-list-onboarding">
        {overlays?.map((o) => (
          <div key={o.name} className="overlay-item-onboarding">
            <span>{o.name}</span>
            <button onClick={() => copy(o.url)}>
              {copiedUrl === o.url ? 'Kopiert!' : 'URL kopieren'}
            </button>
          </div>
        ))}
      </div>

      <p className="step-hint">Du musst nicht alle Overlays jetzt einrichten — du kannst das jederzeit später unter Settings → Overlays machen.</p>
    </div>
  );
}

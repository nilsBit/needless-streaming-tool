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
      <p className="step-desc">
        Fuege diese URLs als <strong>Browser Source</strong> in OBS hinzu.
        Breite/Hoehe je nach Overlay anpassen.
      </p>

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

      <p className="step-hint">Du kannst spaeter unter Settings → Overlays auch eigene Overlays hochladen.</p>
    </div>
  );
}

import React, { useState } from 'react';
import { useApi } from '../../hooks/useApi';

export default function StreamDeckStep() {
  const { data: tokenInfo } = useApi<{ token: string | null }>('/settings/api-token');
  const [copied, setCopied] = useState(false);

  const copy = () => {
    if (tokenInfo?.token) {
      navigator.clipboard.writeText(tokenInfo.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="onboarding-step">
      <h2>Stream Deck (optional)</h2>
      <p className="step-desc">
        Mit dem Stream Deck Plugin kannst du Buttons fuer Szenen-Wechsel,
        Clips, Bugs, Experiments und mehr direkt auf dein Deck legen.
      </p>

      <div className="onboarding-steps-list">
        <div className="setup-instruction">
          <span className="instruction-number">1</span>
          <span>Installiere das <strong>"The Lab Toolkit"</strong> Plugin im Stream Deck Store oder aus der .streamDeckPlugin Datei</span>
        </div>
        <div className="setup-instruction">
          <span className="instruction-number">2</span>
          <span>Ziehe einen beliebigen <strong>"The Lab"</strong> Button auf dein Deck</span>
        </div>
        <div className="setup-instruction">
          <span className="instruction-number">3</span>
          <span>Klicke auf den Button — unten erscheint der <strong>Property Inspector</strong></span>
        </div>
        <div className="setup-instruction">
          <span className="instruction-number">4</span>
          <span>Kopiere den Token unten und fuege ihn dort im Feld <strong>"API Token"</strong> ein — das musst du nur <strong>einmal</strong> machen, es gilt dann fuer alle Buttons</span>
        </div>
      </div>

      <p className="step-desc" style={{ marginTop: '12px' }}>Dein API Token:</p>

      {tokenInfo?.token && (
        <div className="token-display-onboarding">
          <code>{tokenInfo.token.substring(0, 16)}...{tokenInfo.token.substring(tokenInfo.token.length - 8)}</code>
          <button onClick={copy}>{copied ? 'Kopiert!' : 'Kopieren'}</button>
        </div>
      )}

      <p className="step-hint">
        Kein Stream Deck? Kein Problem — du kannst alles auch direkt in der App steuern.
      </p>
    </div>
  );
}

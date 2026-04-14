import React, { useState } from 'react';
import { useApi, apiPost, getApiToken } from '../../hooks/useApi';

export default function StreamDeckStep() {
  const { data: fixedTokenData } = useApi<{ token: string | null }>('/settings/api-token');
  const sessionToken = getApiToken();
  const token = fixedTokenData?.token || sessionToken || null;

  const [copied, setCopied] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(false);

  const copy = () => {
    if (token) {
      navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const installPlugin = async () => {
    setInstalling(true);
    try {
      await apiPost('/settings/streamdeck/install', {});
      setInstalled(true);
    } catch {}
    setInstalling(false);
  };

  return (
    <div className="onboarding-step">
      <h2>Stream Deck (optional)</h2>
      <p className="step-desc">
        Mit dem Stream Deck Plugin kannst du Buttons für Szenen-Wechsel,
        Clips, Bugs, Challenges und mehr direkt auf dein Deck legen.
      </p>

      <div className="onboarding-steps-list">
        <div className="setup-instruction">
          <span className="instruction-number">1</span>
          <div style={{ flex: 1 }}>
            <span>Plugin installieren:</span>
            <button
              className="btn-install-inline"
              onClick={installPlugin}
              disabled={installing || installed}
            >
              {installed ? 'Installiert!' : installing ? 'Wird installiert...' : 'Plugin jetzt installieren'}
            </button>
          </div>
        </div>
        <div className="setup-instruction">
          <span className="instruction-number">2</span>
          <span>Ziehe einen <strong>"The Lab"</strong> Button auf dein Deck</span>
        </div>
        <div className="setup-instruction">
          <span className="instruction-number">3</span>
          <div style={{ flex: 1 }}>
            <span>Kopiere den Token und füge ihn im Button-Settings unter <strong>"API Token"</strong> ein (einmalig):</span>
            {token ? (
              <div className="token-display-onboarding" style={{ marginTop: '8px' }}>
                <code>{token.substring(0, 16)}...{token.substring(token.length - 8)}</code>
                <button onClick={copy}>{copied ? 'Kopiert!' : 'Kopieren'}</button>
              </div>
            ) : (
              <p className="step-hint" style={{ marginTop: '8px' }}>Token wird geladen...</p>
            )}
          </div>
        </div>
      </div>

      <p className="step-hint">
        Kein Stream Deck? Kein Problem — du kannst alles auch direkt in der App steuern.
      </p>
    </div>
  );
}

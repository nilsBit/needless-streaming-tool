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
        Installiere das <strong>"The Lab Toolkit"</strong> Stream Deck Plugin
        und trage diesen API Token in den Plugin-Settings ein:
      </p>

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

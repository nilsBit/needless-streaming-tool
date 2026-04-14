import React, { useState, useEffect } from 'react';
import { useApi, apiFetch } from '../../hooks/useApi';
import { BotStatus } from '../../../../shared/types';

interface ClientIdResponse {
  configured: boolean;
  client_id_preview: string | null;
}

export default function TwitchStep() {
  const { data: botStatus, refetch: refetchBot } = useApi<BotStatus>('/settings/bot-status');
  const { data: clientIdInfo, refetch: refetchClientId } = useApi<ClientIdResponse>('/auth/twitch/client-id');
  const [clientId, setClientId] = useState('');

  useEffect(() => {
    if (botStatus?.connected) return;
    const interval = setInterval(refetchBot, 2000);
    return () => clearInterval(interval);
  }, [refetchBot, botStatus?.connected]);

  const saveClientId = async () => {
    if (!clientId.trim()) return;
    await apiFetch('/auth/twitch/client-id', {
      method: 'POST',
      body: JSON.stringify({ client_id: clientId.trim() }),
    });
    setClientId('');
    refetchClientId();
  };

  const connectTwitch = async () => {
    await apiFetch('/auth/twitch/open', { method: 'POST' });
  };

  return (
    <div className="onboarding-step">
      <h2>Twitch verbinden</h2>
      <p className="step-desc">Damit der Bot in deinem Chat funktioniert, brauchst du eine Twitch-App. Das klingt kompliziert, dauert aber nur 2 Minuten.</p>

      <div className="onboarding-status">
        <span className="status-dot" style={{ background: botStatus?.connected ? '#2ecc71' : '#e74c3c' }} />
        <span>{botStatus?.connected ? `Verbunden mit #${botStatus.channel}` : 'Nicht verbunden'}</span>
      </div>

      {!clientIdInfo?.configured ? (
        <>
          <div className="onboarding-steps-list">
            <div className="setup-instruction">
              <span className="instruction-number">1</span>
              <span>Oeffne <strong>dev.twitch.tv</strong> in deinem Browser und logge dich mit deinem Twitch-Account ein</span>
            </div>
            <div className="setup-instruction">
              <span className="instruction-number">2</span>
              <span>Klicke oben rechts auf <strong>"Your Console"</strong>, dann links auf <strong>"Applications"</strong></span>
            </div>
            <div className="setup-instruction">
              <span className="instruction-number">3</span>
              <span>Klicke auf <strong>"Register Your Application"</strong> und fuege folgende Daten ein:</span>
            </div>
          </div>

          <div className="onboarding-info-box">
            <div className="info-row"><span className="info-label">Name:</span><span>Stream Toolkit (oder beliebig)</span></div>
            <div className="info-row"><span className="info-label">OAuth Redirect URL:</span><span className="info-mono">http://localhost:4000/auth/twitch/callback</span></div>
            <div className="info-row"><span className="info-label">Category:</span><span>Chat Bot</span></div>
          </div>

          <div className="onboarding-steps-list">
            <div className="setup-instruction">
              <span className="instruction-number">4</span>
              <span>Klicke auf <strong>"Create"</strong>, dann auf <strong>"Manage"</strong> bei deiner neuen App</span>
            </div>
            <div className="setup-instruction">
              <span className="instruction-number">5</span>
              <span>Kopiere die <strong>"Client ID"</strong> und fuege sie hier ein:</span>
            </div>
          </div>

          <div className="input-row">
            <input
              type="text"
              placeholder="Client-ID hier einfuegen..."
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveClientId()}
            />
            <button onClick={saveClientId}>Speichern</button>
          </div>
        </>
      ) : (
        <>
          <div className="onboarding-check">Client-ID gespeichert: {clientIdInfo.client_id_preview}</div>
          {!botStatus?.connected && (
            <>
              <p className="step-desc">Klicke jetzt auf den Button — es oeffnet sich ein Twitch-Login in deinem Browser. Erlaube den Zugriff und du wirst automatisch verbunden.</p>
              <button className="btn-primary" onClick={connectTwitch}>
                Mit Twitch verbinden
              </button>
            </>
          )}
          {botStatus?.connected && (
            <div className="onboarding-check">Twitch ist verbunden! Der Bot ist live in deinem Chat.</div>
          )}
        </>
      )}
    </div>
  );
}

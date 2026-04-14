import React, { useState, useEffect } from 'react';
import { useApi, apiPost, getApiToken } from '../../hooks/useApi';
import { BotStatus } from '../../../../shared/types';

function authFetch(url: string, options: RequestInit = {}) {
  const token = getApiToken();
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
}

interface ClientIdResponse {
  configured: boolean;
  client_id_preview: string | null;
}

export default function TwitchStep() {
  const { data: botStatus, refetch: refetchBot } = useApi<BotStatus>('/settings/bot-status');
  const { data: clientIdInfo, refetch: refetchClientId } = useApi<ClientIdResponse>('/auth/twitch/client-id');
  const [clientId, setClientId] = useState('');

  useEffect(() => {
    const interval = setInterval(refetchBot, 2000);
    return () => clearInterval(interval);
  }, [refetchBot]);

  const saveClientId = async () => {
    if (!clientId.trim()) return;
    await authFetch('http://localhost:4000/api/auth/twitch/client-id', {
      method: 'POST',
      body: JSON.stringify({ client_id: clientId.trim() }),
    });
    setClientId('');
    refetchClientId();
  };

  const connectTwitch = async () => {
    await authFetch('http://localhost:4000/api/auth/twitch/open', { method: 'POST' });
  };

  return (
    <div className="onboarding-step">
      <h2>Twitch verbinden</h2>
      <p className="step-desc">Verbinde deinen Twitch-Account damit der Bot im Chat funktioniert.</p>

      <div className="onboarding-status">
        <span className="status-dot" style={{ background: botStatus?.connected ? '#2ecc71' : '#e74c3c' }} />
        <span>{botStatus?.connected ? `Verbunden mit #${botStatus.channel}` : 'Nicht verbunden'}</span>
      </div>

      {!clientIdInfo?.configured ? (
        <div className="onboarding-field">
          <label>1. Erstelle eine App auf dev.twitch.tv und trage die Client-ID ein:</label>
          <div className="input-row">
            <input
              type="text"
              placeholder="Twitch Client-ID..."
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveClientId()}
            />
            <button onClick={saveClientId}>Speichern</button>
          </div>
        </div>
      ) : (
        <>
          <div className="onboarding-field">
            <label>Client-ID: {clientIdInfo.client_id_preview}</label>
          </div>
          {!botStatus?.connected && (
            <button className="btn-primary" onClick={connectTwitch}>
              Mit Twitch verbinden
            </button>
          )}
        </>
      )}
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { useApi, apiPost } from '../hooks/useApi';
import { TwitchConfigResponse, BotStatus } from '../../../shared/types';

interface ClientIdResponse {
  configured: boolean;
  client_id_preview: string | null;
}

export default function SettingsPanel() {
  const { data: config, refetch: refetchConfig } = useApi<TwitchConfigResponse>('/settings/twitch');
  const { data: botStatus, refetch: refetchBot } = useApi<BotStatus>('/settings/bot-status');
  const { data: clientIdInfo, refetch: refetchClientId } = useApi<ClientIdResponse>('/auth/twitch/client-id');

  const [clientId, setClientId] = useState('');

  const saveClientId = async () => {
    if (!clientId.trim()) return;
    await apiPost('/auth/twitch/client-id', { client_id: clientId.trim() });
    setClientId('');
    refetchClientId();
  };

  const connectTwitch = async () => {
    const res = await fetch('http://localhost:4000/auth/twitch/url');
    const data = await res.json();
    if (data.url) {
      window.open(data.url, '_blank', 'width=500,height=700');
    }
  };

  const disconnectBot = async () => {
    await apiPost('/settings/bot/disconnect', {});
    refetchBot();
  };

  // Poll bot status every 3s (to detect connection after OAuth callback)
  useEffect(() => {
    const interval = setInterval(() => {
      refetchBot();
      refetchConfig();
    }, 3000);
    return () => clearInterval(interval);
  }, [refetchBot, refetchConfig]);

  return (
    <div className="panel settings-panel">
      <h2>⚙️ Settings</h2>
      <p className="panel-desc">Twitch-Verbindung konfigurieren und Bot steuern.</p>

      <div className="settings-section">
        <h3>Twitch Verbindung</h3>

        <div className="bot-status">
          <span className="status-dot" style={{ background: botStatus?.connected ? '#2ecc71' : '#e74c3c' }} />
          <span>{botStatus?.connected ? `Verbunden mit #${botStatus.channel}` : 'Nicht verbunden'}</span>
        </div>

        {!clientIdInfo?.configured ? (
          <div className="setup-step">
            <p className="setup-info">Schritt 1: Erstelle eine App auf dev.twitch.tv und trage die Client-ID ein.</p>
            <div className="client-id-input">
              <input
                type="text"
                placeholder="Twitch Client-ID..."
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveClientId()}
              />
              <button onClick={saveClientId}>💾</button>
            </div>
          </div>
        ) : (
          <div className="setup-step">
            <p className="setup-info">Client-ID: {clientIdInfo.client_id_preview}</p>
          </div>
        )}

        <div className="bot-controls">
          {botStatus?.connected ? (
            <button className="btn-disconnect" onClick={disconnectBot}>🔌 Trennen</button>
          ) : (
            <button
              className="btn-connect"
              onClick={connectTwitch}
              disabled={!clientIdInfo?.configured}
            >
              🔗 Mit Twitch verbinden
            </button>
          )}
        </div>

        {clientIdInfo?.configured && (
          <div className="reset-section">
            <button className="btn-reset-small" onClick={() => {
              setClientId('');
              apiPost('/auth/twitch/client-id', { client_id: '' });
              refetchClientId();
            }}>Client-ID ändern</button>
          </div>
        )}
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { useApi, apiPost } from '../hooks/useApi';
import { TwitchConfigResponse, BotStatus } from '../../../shared/types';

export default function SettingsPanel() {
  const { data: config, refetch: refetchConfig } = useApi<TwitchConfigResponse>('/settings/twitch');
  const { data: botStatus, refetch: refetchBot } = useApi<BotStatus>('/settings/bot-status');

  const [channel, setChannel] = useState('');
  const [username, setUsername] = useState('');
  const [token, setToken] = useState('');

  useEffect(() => {
    if (config?.configured) {
      setChannel(config.channel || '');
      setUsername(config.username || '');
    }
  }, [config]);

  const saveConfig = async () => {
    if (!channel || !username || !token) return;
    await apiPost('/settings/twitch', {
      channel,
      username,
      oauth_token: token.startsWith('oauth:') ? token : `oauth:${token}`,
    });
    setToken('');
    refetchConfig();
  };

  const connectBot = async () => {
    await apiPost('/settings/bot/connect', {});
    refetchBot();
  };

  const disconnectBot = async () => {
    await apiPost('/settings/bot/disconnect', {});
    refetchBot();
  };

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

        <div className="settings-form">
          <label>
            Channel
            <input type="text" value={channel} onChange={(e) => setChannel(e.target.value)} placeholder="dein_channel" />
          </label>
          <label>
            Bot Username
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="dein_bot_name" />
          </label>
          <label>
            OAuth Token
            <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder={config?.has_token ? '••••••• (gespeichert)' : 'oauth:xxx...'} />
          </label>
          <button onClick={saveConfig}>💾 Speichern</button>
        </div>

        <div className="bot-controls">
          {botStatus?.connected ? (
            <button className="btn-disconnect" onClick={disconnectBot}>🔌 Trennen</button>
          ) : (
            <button className="btn-connect" onClick={connectBot}>🔗 Verbinden</button>
          )}
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { useApi, apiPost, apiFetch, getApiToken } from '../hooks/useApi';
import { TwitchConfigResponse, BotStatus } from '../../../shared/types';

interface ClientIdResponse {
  configured: boolean;
  client_id_preview: string | null;
}

export default function SettingsPanel() {
  const { data: config, refetch: refetchConfig } = useApi<TwitchConfigResponse>('/settings/twitch');
  const { data: botStatus, refetch: refetchBot } = useApi<BotStatus>('/settings/bot-status');
  const { data: clientIdInfo, refetch: refetchClientId } = useApi<ClientIdResponse>('/auth/twitch/client-id');
  const { data: tokenInfo } = useApi<{ token: string | null }>('/settings/api-token');
  const { data: notionInfo, refetch: refetchNotion } = useApi<{ configured: boolean; preview: string | null }>('/settings/notion');
  const { data: notionDbInfo, refetch: refetchNotionDb } = useApi<{ configured: boolean; database_id: string | null }>('/settings/notion/database');
  const { data: obsConfig, refetch: refetchObs } = useApi<{ configured: boolean; host?: string; port?: number; has_password?: boolean }>('/obs/config');
  const { data: obsStatus, refetch: refetchObsStatus } = useApi<{ connected: boolean }>('/obs/status');

  const [tokenCopied, setTokenCopied] = useState(false);
  const [notionToken, setNotionToken] = useState('');
  const [notionDbId, setNotionDbId] = useState('');
  const [obsHost, setObsHost] = useState('localhost');
  const [obsPort, setObsPort] = useState('4455');
  const [obsPassword, setObsPassword] = useState('');

  const copyToken = () => {
    if (tokenInfo?.token) {
      navigator.clipboard.writeText(tokenInfo.token);
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 2000);
    }
  };

  const [clientId, setClientId] = useState('');

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
    try {
      const res = await apiFetch('/auth/twitch/open', { method: 'POST' });
      const data = await res.json();
      if (!data.success) {
        console.error('[Settings] Failed to open Twitch auth:', data.error);
      }
    } catch (err) {
      console.error('[Settings] Failed to connect:', err);
    }
  };

  const disconnectBot = async () => {
    await apiPost('/settings/bot/disconnect', {});
    refetchBot();
  };

  useEffect(() => {
    const interval = setInterval(() => {
      refetchBot();
      refetchConfig();
      refetchObsStatus();
    }, 3000);
    return () => clearInterval(interval);
  }, [refetchBot, refetchConfig, refetchObsStatus]);

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
            <button className="btn-reset-small" onClick={async () => {
              setClientId('');
              await apiFetch('/auth/twitch/client-id', {
                method: 'POST',
                body: JSON.stringify({ client_id: '' }),
              });
              refetchClientId();
            }}>Client-ID ändern</button>
          </div>
        )}
      </div>

      <div className="settings-section">
        <h3>Notion Integration</h3>
        <p className="setup-info">Clips werden automatisch in Notion gesynct. Erstelle eine Integration auf notion.so/my-integrations und teile die Clips-DB mit der Integration.</p>

        {!notionInfo?.configured ? (
          <div className="client-id-input">
            <input
              type="text"
              placeholder="Notion Internal Integration Token (ntn_...)"
              value={notionToken}
              onChange={(e) => setNotionToken(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (async () => {
                await apiPost('/settings/notion', { token: notionToken.trim() });
                setNotionToken('');
                refetchNotion();
              })()}
            />
            <button onClick={async () => {
              await apiPost('/settings/notion', { token: notionToken.trim() });
              setNotionToken('');
              refetchNotion();
            }}>💾</button>
          </div>
        ) : (
          <div className="setup-step">
            <p className="setup-info">Token: {notionInfo.preview}</p>
            <button className="btn-reset-small" onClick={async () => {
              await apiPost('/settings/notion', { token: '' });
              refetchNotion();
            }}>Token ändern</button>
          </div>
        )}

        <p className="setup-info" style={{ marginTop: '12px' }}>Clips-Datenbank ID — die Notion-Datenbank in die Clips gesynct werden.</p>
        {!notionDbInfo?.configured ? (
          <div className="client-id-input">
            <input
              type="text"
              placeholder="Notion Database ID oder URL..."
              value={notionDbId}
              onChange={(e) => setNotionDbId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (async () => {
                await apiPost('/settings/notion/database', { database_id: notionDbId.trim() });
                setNotionDbId('');
                refetchNotionDb();
              })()}
            />
            <button onClick={async () => {
              await apiPost('/settings/notion/database', { database_id: notionDbId.trim() });
              setNotionDbId('');
              refetchNotionDb();
            }}>💾</button>
          </div>
        ) : (
          <div className="setup-step">
            <p className="setup-info">Database: {notionDbInfo.database_id?.substring(0, 8)}...{notionDbInfo.database_id?.substring(24)}</p>
            <button className="btn-reset-small" onClick={async () => {
              await apiPost('/settings/notion/database', { database_id: '' });
              refetchNotionDb();
            }}>Database ändern</button>
          </div>
        )}
      </div>

      <div className="settings-section">
        <h3>OBS Verbindung</h3>
        <p className="setup-info">OBS Studio WebSocket-Verbindung. Aktiviere in OBS unter Tools → WebSocket Server Settings.</p>

        <div className="bot-status">
          <span className="status-dot" style={{ background: obsStatus?.connected ? '#2ecc71' : '#e74c3c' }} />
          <span>{obsStatus?.connected ? 'Verbunden mit OBS' : 'Nicht verbunden'}</span>
        </div>

        {!obsConfig?.configured ? (
          <div className="obs-config-form">
            <div className="client-id-input">
              <input
                type="text"
                placeholder="Host (localhost)"
                value={obsHost}
                onChange={(e) => setObsHost(e.target.value)}
                style={{ flex: 2 }}
              />
              <input
                type="text"
                placeholder="Port (4455)"
                value={obsPort}
                onChange={(e) => setObsPort(e.target.value)}
                style={{ flex: 1 }}
              />
            </div>
            <div className="client-id-input" style={{ marginTop: '4px' }}>
              <input
                type="password"
                placeholder="Passwort (optional)"
                value={obsPassword}
                onChange={(e) => setObsPassword(e.target.value)}
              />
              <button onClick={async () => {
                await apiPost('/obs/config', {
                  host: obsHost.trim() || 'localhost',
                  port: parseInt(obsPort) || 4455,
                  password: obsPassword,
                });
                setObsPassword('');
                refetchObs();
              }}>💾</button>
            </div>
          </div>
        ) : (
          <div className="setup-step">
            <p className="setup-info">Config: {obsConfig.host}:{obsConfig.port} {obsConfig.has_password ? '(mit Passwort)' : '(ohne Passwort)'}</p>
          </div>
        )}

        <div className="bot-controls">
          {obsStatus?.connected ? (
            <button className="btn-disconnect" onClick={async () => {
              await apiPost('/obs/disconnect', {});
              refetchObsStatus();
            }}>🔌 OBS trennen</button>
          ) : (
            <button
              className="btn-connect"
              onClick={async () => {
                await apiPost('/obs/connect', {});
                refetchObsStatus();
              }}
              disabled={!obsConfig?.configured}
            >
              🔗 Mit OBS verbinden
            </button>
          )}
        </div>

        {obsConfig?.configured && (
          <div className="reset-section">
            <button className="btn-reset-small" onClick={async () => {
              await apiPost('/obs/config', { host: '', port: 0, password: '' });
              setObsHost('localhost');
              setObsPort('4455');
              refetchObs();
            }}>Config ändern</button>
          </div>
        )}
      </div>

      <div className="settings-section">
        <h3>Stream Deck API Token</h3>
        <p className="setup-info">Diesen Token im Stream Deck HTTP-Plugin als Bearer Token verwenden. Bleibt gleich nach Neustart.</p>
        {tokenInfo?.token ? (
          <div className="api-token-display">
            <code className="token-value">{tokenInfo.token.substring(0, 12)}...{tokenInfo.token.substring(tokenInfo.token.length - 8)}</code>
            <button onClick={copyToken}>{tokenCopied ? '✅ Kopiert' : '📋 Kopieren'}</button>
          </div>
        ) : (
          <p className="empty">Token wird geladen...</p>
        )}
        <div className="api-endpoints">
          <p className="setup-info" style={{ marginTop: '8px' }}>Base URL: <code>http://localhost:4000/api</code></p>
          <p className="setup-info">Header: <code>Authorization: Bearer &lt;token&gt;</code></p>
        </div>
      </div>

      <div className="settings-section">
        <h3>Setup-Wizard</h3>
        <p className="setup-info">Starte den Einrichtungs-Assistenten erneut.</p>
        <button className="btn-connect" onClick={async () => {
          await apiPost('/settings/onboarding', { completed: false });
          window.location.reload();
        }}>Setup-Wizard erneut starten</button>
      </div>
    </div>
  );
}

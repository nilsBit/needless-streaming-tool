import React, { useState, useEffect, useRef } from 'react';
import { useApi, apiPost, apiFetch, getApiToken } from '../hooks/useApi';
import { TwitchConfigResponse, BotStatus } from '../../../shared/types';
import { useTranslation } from '../i18n/LanguageContext';
import { useTheme } from '../i18n/ThemeContext';

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
  const { t, lang, setLang } = useTranslation();
  const { theme, setTheme } = useTheme();
  const { data: autostartInfo, refetch: refetchAutostart } = useApi<{ enabled: boolean }>('/settings/autostart');
  const [backupStatus, setBackupStatus] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const exportBackup = async () => {
    try {
      const res = await apiFetch('/backup/export');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'stream-toolkit-backup.json';
      a.click();
      URL.revokeObjectURL(url);
      setBackupStatus(t('settings.backup_exported'));
      setTimeout(() => setBackupStatus(''), 3000);
    } catch (err) {
      console.error('[Settings] Export failed:', err);
      setBackupStatus(t('settings.export_failed'));
    }
  };

  const importBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const res = await apiFetch('/backup/import', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      if (res.ok) {
        setBackupStatus(t('settings.backup_imported'));
      } else {
        setBackupStatus(t('settings.import_failed'));
      }
    } catch (err) {
      console.error('[Settings] Import failed:', err);
      setBackupStatus(t('settings.import_failed'));
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
    setTimeout(() => setBackupStatus(''), 3000);
  };

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
      <p className="panel-desc">{t('settings.desc')}</p>

      <div className="settings-section">
        <h3>{t('settings.twitch')}</h3>

        <div className="bot-status">
          <span className="status-dot" style={{ background: botStatus?.connected ? '#2ecc71' : '#e74c3c' }} />
          <span>{botStatus?.connected ? `${t('settings.connected_to')} #${botStatus.channel}` : t('settings.not_connected')}</span>
        </div>

        {!clientIdInfo?.configured ? (
          <div className="setup-step">
            <p className="setup-info">{t('settings.twitch_step1')}</p>
            <div className="client-id-input">
              <input
                type="text"
                placeholder={t('settings.twitch_placeholder')}
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
            <button className="btn-disconnect" onClick={disconnectBot}>{t('settings.disconnect')}</button>
          ) : (
            <button
              className="btn-connect"
              onClick={connectTwitch}
              disabled={!clientIdInfo?.configured}
            >
              {t('settings.connect_twitch')}
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
            }}>{t('settings.change_client_id')}</button>
          </div>
        )}
      </div>

      <div className="settings-section">
        <h3>{t('settings.notion')}</h3>
        <p className="setup-info">{t('settings.notion_desc')}</p>

        {!notionInfo?.configured ? (
          <div className="client-id-input">
            <input
              type="text"
              placeholder={t('settings.notion_placeholder')}
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
            }}>{t('settings.change_token')}</button>
          </div>
        )}

        <p className="setup-info" style={{ marginTop: '12px' }}>{t('settings.clips_db')}</p>
        {!notionDbInfo?.configured ? (
          <div className="client-id-input">
            <input
              type="text"
              placeholder={t('settings.notion_db_placeholder')}
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
            }}>{t('settings.change_db')}</button>
          </div>
        )}
      </div>

      <div className="settings-section">
        <h3>{t('settings.obs')}</h3>
        <p className="setup-info">{t('settings.obs_desc')}</p>

        <div className="bot-status">
          <span className="status-dot" style={{ background: obsStatus?.connected ? '#2ecc71' : '#e74c3c' }} />
          <span>{obsStatus?.connected ? t('settings.obs_connected') : t('settings.obs_not_connected')}</span>
        </div>

        {!obsConfig?.configured ? (
          <div className="obs-config-form">
            <div className="client-id-input">
              <input
                type="text"
                placeholder={t('settings.obs_host')}
                value={obsHost}
                onChange={(e) => setObsHost(e.target.value)}
                style={{ flex: 2 }}
              />
              <input
                type="text"
                placeholder={t('settings.obs_port')}
                value={obsPort}
                onChange={(e) => setObsPort(e.target.value)}
                style={{ flex: 1 }}
              />
            </div>
            <div className="client-id-input" style={{ marginTop: '4px' }}>
              <input
                type="password"
                placeholder={t('settings.obs_password')}
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
            <p className="setup-info">Config: {obsConfig.host}:{obsConfig.port} {obsConfig.has_password ? t('settings.obs_with_password') : t('settings.obs_without_password')}</p>
          </div>
        )}

        <div className="bot-controls">
          {obsStatus?.connected ? (
            <button className="btn-disconnect" onClick={async () => {
              await apiPost('/obs/disconnect', {});
              refetchObsStatus();
            }}>{t('settings.obs_disconnect')}</button>
          ) : (
            <button
              className="btn-connect"
              onClick={async () => {
                await apiPost('/obs/connect', {});
                refetchObsStatus();
              }}
              disabled={!obsConfig?.configured}
            >
              {t('settings.obs_connect')}
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
            }}>{t('settings.obs_change')}</button>
          </div>
        )}
      </div>

      <div className="settings-section">
        <h3>{t('settings.streamdeck')}</h3>
        <p className="setup-info">{t('settings.streamdeck_desc')}</p>
        {tokenInfo?.token ? (
          <div className="api-token-display">
            <code className="token-value">{tokenInfo.token.substring(0, 12)}...{tokenInfo.token.substring(tokenInfo.token.length - 8)}</code>
            <button onClick={copyToken}>{tokenCopied ? t('settings.copied') : t('settings.copy')}</button>
          </div>
        ) : (
          <p className="empty">{t('settings.token_loading')}</p>
        )}
        <div className="api-endpoints">
          <p className="setup-info" style={{ marginTop: '8px' }}>Base URL: <code>http://localhost:4000/api</code></p>
          <p className="setup-info">Header: <code>Authorization: Bearer &lt;token&gt;</code></p>
        </div>
      </div>

      <div className="settings-section">
        <h3>{t('settings.autostart')}</h3>
        <p className="setup-info">{t('settings.autostart_desc')}</p>
        <div className="language-toggle">
          <button
            className={`lang-btn ${autostartInfo?.enabled ? 'active' : ''}`}
            onClick={async () => {
              await apiPost('/settings/autostart', { enabled: true });
              refetchAutostart();
            }}
          >
            {t('settings.enabled')}
          </button>
          <button
            className={`lang-btn ${!autostartInfo?.enabled ? 'active' : ''}`}
            onClick={async () => {
              await apiPost('/settings/autostart', { enabled: false });
              refetchAutostart();
            }}
          >
            {t('settings.disabled')}
          </button>
        </div>
      </div>

      <div className="settings-section">
        <h3>{t('settings.backup')}</h3>
        <p className="setup-info">{t('settings.backup_desc')}</p>
        <div className="bot-controls">
          <button className="btn-connect" onClick={exportBackup}>{t('settings.backup_export')}</button>
          <label className="btn-connect" style={{ cursor: 'pointer', textAlign: 'center' }}>
            {t('settings.backup_import')}
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={importBackup}
              style={{ display: 'none' }}
            />
          </label>
        </div>
        {backupStatus && <p className="setup-info" style={{ marginTop: '8px' }}>{backupStatus}</p>}
      </div>

      <div className="settings-section">
        <h3>{t('settings.wizard')}</h3>
        <p className="setup-info">{t('settings.wizard_desc')}</p>
        <button className="btn-connect" onClick={async () => {
          await apiPost('/settings/onboarding', { completed: false });
          window.location.reload();
        }}>{t('settings.wizard_restart')}</button>
      </div>

      <div className="settings-section">
        <h3>{t('settings.language')}</h3>
        <p className="setup-info">{t('settings.language_desc')}</p>
        <div className="language-toggle">
          <button className={`lang-btn ${lang === 'de' ? 'active' : ''}`} onClick={() => setLang('de')}>Deutsch</button>
          <button className={`lang-btn ${lang === 'en' ? 'active' : ''}`} onClick={() => setLang('en')}>English</button>
        </div>
      </div>

      <div className="settings-section">
        <h3>{t('settings.design')}</h3>
        <p className="setup-info">{t('settings.design_desc')}</p>
        <div className="language-toggle">
          <button className={`lang-btn ${theme === 'dark' ? 'active' : ''}`} onClick={() => setTheme('dark')}>🌙 Dark</button>
          <button className={`lang-btn ${theme === 'light' ? 'active' : ''}`} onClick={() => setTheme('light')}>☀️ Light</button>
        </div>
      </div>
    </div>
  );
}

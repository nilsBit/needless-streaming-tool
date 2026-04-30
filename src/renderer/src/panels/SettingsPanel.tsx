import React, { useState, useEffect, useRef } from 'react';
import { useApi, apiGet, apiPost, apiFetch, getApiToken, getServerPort } from '../hooks/useApi';
import { useWebSocket } from '../hooks/useWebSocket';
import { TwitchConfigResponse, BotStatus } from '../../../shared/types';
import { useTranslation } from '../i18n/LanguageContext';
import { useTheme } from '../i18n/ThemeContext';
import { useToast } from '../i18n/ToastContext';
import CopyButton from '../components/CopyButton';
import NotionDatabasePicker from '../components/NotionDatabasePicker';
import { applyProfilePreset, PROFILE_KEYS, ProfileKey } from '../hooks/useDashboardLayout';

export default function SettingsPanel() {
  const { data: config, loading, refetch: refetchConfig } = useApi<TwitchConfigResponse>('/settings/twitch');
  const { data: botStatus, refetch: refetchBot } = useApi<BotStatus>('/settings/bot-status');
  const { data: tokenInfo } = useApi<{ token: string | null }>('/settings/api-token');
  const { data: notionInfo, refetch: refetchNotion } = useApi<{ configured: boolean; preview: string | null }>('/settings/notion');
  const { data: githubInfo, refetch: refetchGithub } = useApi<{ configured: boolean; preview: string | null; repo: string | null }>('/progress/github');
  const { data: obsConfig, refetch: refetchObs } = useApi<{ configured: boolean; host?: string; port?: number; has_password?: boolean }>('/obs/config');
  const { data: obsStatus, refetch: refetchObsStatus } = useApi<{ connected: boolean }>('/obs/status');
  const { data: syncStatus, refetch: refetchSync } = useApi<{
    enabled: boolean; syncPath?: string; lastSync?: string; device?: string; error?: string;
  }>('/settings/sync/status');
  const [syncPath, setSyncPath] = useState('');
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const { toast } = useToast();
  const [notionToken, setNotionToken] = useState('');
  const [githubToken, setGithubToken] = useState('');
  const [githubRepo, setGithubRepo] = useState('');
  const [importing, setImporting] = useState(false);
  const [obsHost, setObsHost] = useState('localhost');
  const [obsPort, setObsPort] = useState('4455');
  const [obsPassword, setObsPassword] = useState('');
  const { t, lang, setLang } = useTranslation();
  const { theme, setTheme } = useTheme();
  const { data: autostartInfo, refetch: refetchAutostart } = useApi<{ enabled: boolean }>('/settings/autostart');
  const fileInputRef = useRef<HTMLInputElement>(null);


  // Custom commands
  const { data: commandsData, refetch: refetchCommands } = useApi<Record<string, string>>('/settings/commands');
  const [editCommands, setEditCommands] = useState<Record<string, string>>({});
  const [commandsLoaded, setCommandsLoaded] = useState(false);

  useEffect(() => {
    if (commandsData && !commandsLoaded) {
      setEditCommands(commandsData);
      setCommandsLoaded(true);
    }
  }, [commandsData, commandsLoaded]);

  const saveCommands = async () => {
    const result = await apiPost('/settings/commands', editCommands);
    if (!result) { toast.error(t('error.action_failed')); return; }
    toast.success(t('commands.saved'));
    refetchCommands();
  };

  const [autoClipsEnabled, setAutoClipsEnabled] = useState(true);
  const [triggerReward, setTriggerReward] = useState(true);
  const [triggerHype, setTriggerHype] = useState(true);
  const [triggerMilestone, setTriggerMilestone] = useState(true);

  useEffect(() => {
    const keys = [
      'auto_clips_enabled',
      'auto_clip_trigger_reward',
      'auto_clip_trigger_hype',
      'auto_clip_trigger_milestone',
    ];
    Promise.all(keys.map(k => apiFetch(`/settings/get/${k}`).then(r => r.json()).then(d => [k, d.value] as [string, string | null]))).then(entries => {
      const m = Object.fromEntries(entries);
      if (m['auto_clips_enabled'] !== null) setAutoClipsEnabled(m['auto_clips_enabled'] !== 'false');
      if (m['auto_clip_trigger_reward'] !== null) setTriggerReward(m['auto_clip_trigger_reward'] !== 'false');
      if (m['auto_clip_trigger_hype'] !== null) setTriggerHype(m['auto_clip_trigger_hype'] !== 'false');
      if (m['auto_clip_trigger_milestone'] !== null) setTriggerMilestone(m['auto_clip_trigger_milestone'] !== 'false');
    }).catch(() => {});
  }, []);

  const saveAutoClipSettings = async () => {
    const result = await apiPost('/settings/batch', {
      auto_clips_enabled: String(autoClipsEnabled),
      auto_clip_trigger_reward: String(triggerReward),
      auto_clip_trigger_hype: String(triggerHype),
      auto_clip_trigger_milestone: String(triggerMilestone),
    });
    if (!result) { toast.error(t('error.action_failed')); return; }
    toast.success(t('overlay_config.saved'));
  };

  useEffect(() => {
    apiGet<{ enabled: boolean; syncPath: string }>('/settings/sync/config').then((cfg) => {
      if (cfg) {
        setSyncPath(cfg.syncPath || '');
        setSyncEnabled(cfg.enabled);
      }
    });
  }, []);

  useWebSocket((event) => {
    if (event === 'bot-status') { refetchBot(); refetchConfig(); }
    if (event === 'obs-status') refetchObsStatus();
  });

  useEffect(() => {
    if (githubInfo?.repo && !githubRepo) setGithubRepo(githubInfo.repo);
  }, [githubInfo]);

  const { data: profileData, refetch: refetchProfile } = useApi<{ value: string | null }>('/settings/get/stream_profile');
  const currentProfile = (profileData?.value || 'all') as ProfileKey;

  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set(['connections']));
  const toggleGroup = (group: string) => {
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  if (loading) return <div className="panel"><p>{t('common.loading')}</p></div>;

  const exportBackup = async () => {
    try {
      const res = await apiFetch('/backup/export');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'nst-backup.json';
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t('settings.backup_exported'));
    } catch (err) {
      console.error('[Settings] Export failed:', err);
      toast.error(t('settings.export_failed'));
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
        toast.success(t('settings.backup_imported'));
      } else {
        toast.error(t('settings.import_failed'));
      }
    } catch (err) {
      console.error('[Settings] Import failed:', err);
      toast.error(t('settings.import_failed'));
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const connectTwitch = async () => {
    try {
      const res = await apiFetch('/auth/twitch/open', { method: 'POST' });
      const data = await res.json();
      if (!data.success) {
        console.error('[Settings] Failed to open Twitch auth:', data.error);
        toast.error(t('error.action_failed'));
      }
    } catch (err) {
      console.error('[Settings] Failed to connect:', err);
      toast.error(t('error.action_failed'));
    }
  };

  const disconnectBot = async () => {
    await apiPost('/settings/bot/disconnect', {});
    refetchBot();
  };

  const importGithub = async () => {
    const parts = githubRepo.trim().split('/');
    if (parts.length !== 2) { toast.error('Format: owner/repo'); return; }
    setImporting(true);
    try {
      const res = await apiFetch('/progress/import/github', {
        method: 'POST',
        body: JSON.stringify({ owner: parts[0], repo: parts[1] }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`${data.imported} ${t('github.imported')}, ${data.skipped} ${t('github.skipped')}`);
      } else {
        toast.error(data.error || t('error.action_failed'));
      }
    } catch {
      toast.error(t('error.action_failed'));
    }
    setImporting(false);
  };

  const handleSelectSyncFolder = async () => {
    const folder = await window.electronAPI?.selectSyncFolder();
    if (folder) {
      setSyncPath(folder);
      await apiPost('/settings/sync/config', { enabled: syncEnabled, syncPath: folder });
      refetchSync();
    }
  };

  const handleToggleSync = async (enabled: boolean) => {
    setSyncEnabled(enabled);
    await apiPost('/settings/sync/config', { enabled, syncPath });
    refetchSync();
  };

  const handleManualSync = async () => {
    setSyncing(true);
    const result = await apiPost<{ success: boolean; error?: string }>('/settings/sync/trigger', {});
    setSyncing(false);
    refetchSync();
    if (result?.success) {
      toast.success('Sync abgeschlossen');
    } else {
      toast.error(result?.error || 'Sync fehlgeschlagen');
    }
  };

  const saveNotionToken = async () => {
    const result = await apiPost('/settings/notion', { token: notionToken.trim() });
    if (!result) { toast.error(t('error.action_failed')); return; }
    setNotionToken('');
    refetchNotion();
  };

  const saveGithubToken = async () => {
    const result = await apiPost('/progress/github', { token: githubToken.trim() });
    if (!result) { toast.error(t('error.action_failed')); return; }
    setGithubToken('');
    refetchGithub();
  };

  const SettingsGroup = ({ id, title, badge, children }: { id: string; title: string; badge?: React.ReactNode; children: React.ReactNode }) => {
    const isOpen = openGroups.has(id);
    return (
      <div className={`settings-group ${isOpen ? 'open' : ''}`}>
        <div className="settings-group-header" onClick={() => toggleGroup(id)}>
          <span className="settings-group-toggle">{isOpen ? '▼' : '▶'}</span>
          <h3 className="settings-group-title">{title}</h3>
          {badge && <span className="settings-group-badge">{badge}</span>}
        </div>
        {isOpen && <div className="settings-group-content">{children}</div>}
      </div>
    );
  };

  const connectionBadge = (
    <>
      <span className="status-dot-mini" style={{ background: botStatus?.connected ? '#2ecc71' : '#e74c3c' }} title="Twitch" />
      <span className="status-dot-mini" style={{ background: obsStatus?.connected ? '#2ecc71' : '#e74c3c' }} title="OBS" />
      <span className="status-dot-mini" style={{ background: notionInfo?.configured ? '#2ecc71' : '#888' }} title="Notion" />
    </>
  );

  return (
    <div className="panel settings-panel">

      <SettingsGroup id="connections" title={`🔗 ${t('settings.group.connections')}`} badge={connectionBadge}>
        <div className="settings-section">
          <h3>{t('settings.twitch')}</h3>

          <div className="bot-status">
            <span className="status-dot" style={{ background: botStatus?.connected ? '#2ecc71' : '#e74c3c' }} title={botStatus?.connected ? t('tooltip.connected') : t('tooltip.not_connected')} />
            <span>{botStatus?.connected ? `${t('settings.connected_to')} #${botStatus.channel}` : t('settings.not_connected')}</span>
          </div>

          <div className="bot-controls">
            {botStatus?.connected ? (
              <button className="btn-settings-danger" onClick={disconnectBot}>{t('settings.disconnect')}</button>
            ) : (
              <button
                className="btn-settings-primary"
                onClick={connectTwitch}
              >
                {t('settings.connect_twitch')}
              </button>
            )}
          </div>
        </div>

        <div className="settings-section">
          <h3>{t('settings.obs')}</h3>
          <p className="setup-info">{t('settings.obs_desc')}</p>

          <div className="bot-status">
            <span className="status-dot" style={{ background: obsStatus?.connected ? '#2ecc71' : '#e74c3c' }} title={obsStatus?.connected ? t('tooltip.connected') : t('tooltip.not_connected')} />
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
              <div className="client-id-input mt-8">
                <input
                  type="password"
                  placeholder={t('settings.obs_password')}
                  value={obsPassword}
                  onChange={(e) => setObsPassword(e.target.value)}
                />
                <button onClick={async () => {
                  const result = await apiPost('/obs/config', {
                    host: obsHost.trim() || 'localhost',
                    port: parseInt(obsPort) || 4455,
                    password: obsPassword,
                  });
                  if (!result) { toast.error(t('error.action_failed')); return; }
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
              <button className="btn-settings-danger" onClick={async () => {
                const result = await apiPost('/obs/disconnect', {});
                if (!result) { toast.error(t('error.action_failed')); return; }
                refetchObsStatus();
              }}>{t('settings.obs_disconnect')}</button>
            ) : (
              <button
                className="btn-settings-primary"
                onClick={async () => {
                  const result = await apiPost('/obs/connect', {});
                  if (!result) { toast.error(t('error.action_failed')); return; }
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
              <button className="btn-settings-ghost" onClick={async () => {
                const result = await apiPost('/obs/config', { host: '', port: 0, password: '' });
                if (!result) { toast.error(t('error.action_failed')); return; }
                setObsHost('localhost');
                setObsPort('4455');
                refetchObs();
              }}>{t('settings.obs_change')}</button>
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
                onKeyDown={(e) => e.key === 'Enter' && saveNotionToken()}
              />
              <button onClick={saveNotionToken}>💾</button>
            </div>
          ) : (
            <div className="setup-step">
              <p className="setup-info">Token: {notionInfo.preview}</p>
              <button className="btn-settings-ghost" onClick={async () => {
                const result = await apiPost('/settings/notion', { token: '' });
                if (!result) { toast.error(t('error.action_failed')); return; }
                refetchNotion();
              }}>{t('settings.change_token')}</button>
            </div>
          )}

          <div className="mt-12">
            <NotionDatabasePicker compact />
          </div>
        </div>

        <div className="settings-section">
          <h3>{t('github.title')}</h3>
          <p className="setup-info">{t('github.desc')}</p>

          {!githubInfo?.configured ? (
            <div className="client-id-input">
              <input
                type="password"
                placeholder={t('github.token_placeholder')}
                value={githubToken}
                onChange={e => setGithubToken(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveGithubToken()}
              />
              <button onClick={saveGithubToken}>💾</button>
            </div>
          ) : (
            <div className="setup-step">
              <p className="setup-info">Token: {githubInfo.preview}</p>
              <button className="btn-settings-ghost" onClick={async () => {
                const result = await apiPost('/progress/github', { token: '' });
                if (!result) { toast.error(t('error.action_failed')); return; }
                refetchGithub();
              }}>{t('settings.change_token')}</button>
            </div>
          )}

          <div className="client-id-input mt-8">
            <input
              type="text"
              placeholder={t('github.repo_placeholder')}
              value={githubRepo}
              onChange={e => setGithubRepo(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && importGithub()}
            />
          </div>

          <div className="bot-controls mt-8">
            <button
              className="btn-settings-primary"
              onClick={importGithub}
              disabled={importing || !githubInfo?.configured || !githubRepo.trim()}
            >
              {importing ? '⏳...' : t('github.import_btn')}
            </button>
          </div>
        </div>
      </SettingsGroup>

      <SettingsGroup id="features" title={`🎬 ${t('settings.group.features')}`}>
        <div className="settings-section">
          <h3>{t('auto_clips.title')}</h3>
          <p className="setup-info">{t('auto_clips.desc')}</p>

          <div className="language-toggle mb-12">
            <button
              className={`lang-btn ${autoClipsEnabled ? 'active' : ''}`}
              onClick={() => setAutoClipsEnabled(true)}
            >
              {t('auto_clips.enabled')}
            </button>
            <button
              className={`lang-btn ${!autoClipsEnabled ? 'active' : ''}`}
              onClick={() => setAutoClipsEnabled(false)}
            >
              {t('auto_clips.disabled')}
            </button>
          </div>

          <div className="settings-checkboxes">
            <label><input type="checkbox" checked={triggerReward} onChange={e => setTriggerReward(e.target.checked)} /> {t('auto_clips.trigger_reward')}</label>
            <label><input type="checkbox" checked={triggerHype} onChange={e => setTriggerHype(e.target.checked)} /> {t('auto_clips.trigger_hype')}</label>
            <label><input type="checkbox" checked={triggerMilestone} onChange={e => setTriggerMilestone(e.target.checked)} /> {t('auto_clips.trigger_milestone')}</label>
          </div>

          <button className="btn-settings-primary mt-12" onClick={saveAutoClipSettings}>{t('settings.save')}</button>
        </div>

        <div className="settings-section">
          <h3>{t('commands.title')}</h3>
          <p className="setup-info">{t('commands.desc')}</p>
          <div className="settings-checkboxes">
            {Object.entries(editCommands).map(([key, value]) => (
              <div key={key} className="settings-command-row">
                <span className="settings-command-label">{key}</span>
                <input
                  type="text"
                  value={value}
                  onChange={e => setEditCommands(prev => ({ ...prev, [key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <button className="btn-settings-primary mt-12" onClick={saveCommands}>{t('settings.save')}</button>
        </div>
      </SettingsGroup>

      <SettingsGroup id="app" title={`🖥️ ${t('settings.group.app')}`}>
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

        <div className="settings-section">
          <h3>{t('settings.autostart')}</h3>
          <p className="setup-info">{t('settings.autostart_desc')}</p>
          <div className="language-toggle">
            <button
              className={`lang-btn ${autostartInfo?.enabled ? 'active' : ''}`}
              onClick={async () => {
                const result = await apiPost('/settings/autostart', { enabled: true });
                if (!result) { toast.error(t('error.action_failed')); return; }
                refetchAutostart();
              }}
            >
              {t('settings.enabled')}
            </button>
            <button
              className={`lang-btn ${!autostartInfo?.enabled ? 'active' : ''}`}
              onClick={async () => {
                const result = await apiPost('/settings/autostart', { enabled: false });
                if (!result) { toast.error(t('error.action_failed')); return; }
                refetchAutostart();
              }}
            >
              {t('settings.disabled')}
            </button>
          </div>
        </div>

        <div className="settings-section">
          <h3>{t('profile.settings_title')}</h3>
          <p className="setup-info">{t('profile.settings_desc')}</p>
          <div className="profile-toggle">
            {PROFILE_KEYS.map(key => (
              <button
                key={key}
                className={`lang-btn ${currentProfile === key ? 'active' : ''}`}
                onClick={async () => {
                  await apiPost('/settings/set', { key: 'stream_profile', value: key });
                  applyProfilePreset(key);
                  refetchProfile();
                  window.location.reload();
                }}
              >
                {key === 'creative' ? '🎨' : key === 'gaming' ? '🎮' : key === 'coding' ? '💻' : key === 'chatting' ? '🎙️' : '⚙️'} {t(`profile.${key}` as any)}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-section">
          <h3>{t('settings.wizard')}</h3>
          <p className="setup-info">{t('settings.wizard_desc')}</p>
          <button className="btn-settings-ghost" onClick={async () => {
            await apiPost('/settings/onboarding', { completed: false });
            window.location.reload();
          }}>{t('settings.wizard_restart')}</button>
        </div>
      </SettingsGroup>

      <SettingsGroup id="data" title={`💾 ${t('settings.group.data')}`}>
        <div className="settings-section">
          <h3>{t('settings.streamdeck')}</h3>
          <p className="setup-info">{t('settings.streamdeck_desc')}</p>
          {tokenInfo?.token ? (
            <div className="api-token-display">
              <code className="token-value">{tokenInfo.token.substring(0, 12)}...{tokenInfo.token.substring(tokenInfo.token.length - 8)}</code>
              <CopyButton text={tokenInfo.token} />
            </div>
          ) : (
            <p className="empty">{t('settings.token_loading')}</p>
          )}
          <div className="api-endpoints mt-8">
            <p className="setup-info">Base URL: <code>http://localhost:{getServerPort()}/api</code></p>
            <p className="setup-info">Header: <code>Authorization: Bearer &lt;token&gt;</code></p>
          </div>
        </div>

        <div className="settings-section">
          <h3>{t('settings.backup')}</h3>
          <p className="setup-info">{t('settings.backup_desc')}</p>
          <div className="bot-controls">
            <button className="btn-settings-primary" onClick={exportBackup}>{t('settings.backup_export')}</button>
            <label className="btn-settings-primary btn-file-upload">
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
        </div>

        {/* Cloud Sync */}
        <div className="config-section">
          <h3>☁️ Cloud Sync</h3>
          <div className="config-row">
            <label>Sync aktiviert</label>
            <input
              type="checkbox"
              checked={syncEnabled}
              onChange={(e) => handleToggleSync(e.target.checked)}
            />
          </div>
          <div className="config-row">
            <label>Sync-Ordner</label>
            <div style={{ display: 'flex', gap: 8, flex: 1 }}>
              <input
                type="text"
                value={syncPath}
                readOnly
                placeholder="Kein Ordner ausgewählt"
                style={{ flex: 1 }}
              />
              <button onClick={handleSelectSyncFolder}>Auswählen</button>
            </div>
          </div>
          {syncStatus?.lastSync && (
            <div className="config-row">
              <label>Letzter Sync</label>
              <span>
                {new Date(syncStatus.lastSync).toLocaleString('de-DE')}
                {syncStatus.device && ` (${syncStatus.device})`}
              </span>
            </div>
          )}
          {syncStatus?.error && (
            <div className="config-row" style={{ color: '#e74c3c' }}>
              <label>Fehler</label>
              <span>{syncStatus.error}</span>
            </div>
          )}
          <div className="config-row">
            <label />
            <button
              onClick={handleManualSync}
              disabled={!syncEnabled || !syncPath || syncing}
            >
              {syncing ? 'Synchronisiere...' : 'Jetzt synchronisieren'}
            </button>
          </div>
        </div>
      </SettingsGroup>

    </div>
  );
}

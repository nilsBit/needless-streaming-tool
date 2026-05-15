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

type SettingsCategory = 'connections' | 'features' | 'app' | 'data';

const CATEGORIES: { key: SettingsCategory; icon: string; labelKey: string }[] = [
  { key: 'connections', icon: '🔗', labelKey: 'settings.group.connections' },
  { key: 'features', icon: '🎬', labelKey: 'settings.group.features' },
  { key: 'app', icon: '🖥️', labelKey: 'settings.group.app' },
  { key: 'data', icon: '💾', labelKey: 'settings.group.data' },
];

export default function SettingsPanel() {
  const { data: botStatus, refetch: refetchBot } = useApi<BotStatus>('/settings/bot-status');
  const { data: tokenInfo } = useApi<{ token: string | null }>('/settings/api-token');
  const { data: notionInfo, refetch: refetchNotion } = useApi<{ configured: boolean; preview: string | null }>('/settings/notion');
  const { data: githubInfo, refetch: refetchGithub } = useApi<{ configured: boolean; preview: string | null; repo: string | null }>('/progress/github');
  const { data: obsConfig, refetch: refetchObs } = useApi<{ configured: boolean; host?: string; port?: number; has_password?: boolean }>('/obs/config');
  const { data: obsStatus, refetch: refetchObsStatus } = useApi<{ connected: boolean }>('/obs/status');
  const { data: syncStatus, refetch: refetchSync } = useApi<{
    enabled: boolean; syncPath?: string; lastSync?: string; device?: string; error?: string;
  }>('/settings/sync/status');
  const { data: profileData, refetch: refetchProfile } = useApi<{ value: string | null }>('/settings/get/stream_profile');
  const { data: autostartInfo, refetch: refetchAutostart } = useApi<{ enabled: boolean }>('/settings/autostart');
  const { data: commandsData, refetch: refetchCommands } = useApi<Record<string, string>>('/settings/commands');

  const { toast } = useToast();
  const { t, lang, setLang } = useTranslation();
  const { theme, setTheme } = useTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [category, setCategory] = useState<SettingsCategory>('connections');
  const [expanded, setExpanded] = useState<string | null>(null);

  // Form states
  const [notionToken, setNotionToken] = useState('');
  const [githubToken, setGithubToken] = useState('');
  const [githubRepo, setGithubRepo] = useState('');
  const [importing, setImporting] = useState(false);
  const [obsHost, setObsHost] = useState('localhost');
  const [obsPort, setObsPort] = useState('4455');
  const [obsPassword, setObsPassword] = useState('');
  const [syncPath, setSyncPath] = useState('');
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Custom commands
  const [editCommands, setEditCommands] = useState<Record<string, string>>({});
  const [commandsLoaded, setCommandsLoaded] = useState(false);

  // Auto clips
  const [autoClipsEnabled, setAutoClipsEnabled] = useState(true);
  const [triggerReward, setTriggerReward] = useState(true);
  const [triggerHype, setTriggerHype] = useState(true);
  const [triggerMilestone, setTriggerMilestone] = useState(true);

  const currentProfile = (profileData?.value || 'all') as ProfileKey;

  useEffect(() => {
    if (commandsData && !commandsLoaded) {
      setEditCommands(commandsData);
      setCommandsLoaded(true);
    }
  }, [commandsData, commandsLoaded]);

  useEffect(() => {
    const keys = ['auto_clips_enabled', 'auto_clip_trigger_reward', 'auto_clip_trigger_hype', 'auto_clip_trigger_milestone'];
    Promise.all(keys.map(k => apiFetch(`/settings/get/${k}`).then(r => r.json()).then(d => [k, d.value] as [string, string | null]))).then(entries => {
      const m = Object.fromEntries(entries);
      if (m['auto_clips_enabled'] !== null) setAutoClipsEnabled(m['auto_clips_enabled'] !== 'false');
      if (m['auto_clip_trigger_reward'] !== null) setTriggerReward(m['auto_clip_trigger_reward'] !== 'false');
      if (m['auto_clip_trigger_hype'] !== null) setTriggerHype(m['auto_clip_trigger_hype'] !== 'false');
      if (m['auto_clip_trigger_milestone'] !== null) setTriggerMilestone(m['auto_clip_trigger_milestone'] !== 'false');
    }).catch(() => {});
  }, []);

  useEffect(() => {
    apiGet<{ enabled: boolean; syncPath: string }>('/settings/sync/config').then((cfg) => {
      if (cfg) { setSyncPath(cfg.syncPath || ''); setSyncEnabled(cfg.enabled); }
    });
  }, []);

  useEffect(() => {
    if (githubInfo?.repo && !githubRepo) setGithubRepo(githubInfo.repo);
  }, [githubInfo]);

  useWebSocket((event) => {
    if (event === 'bot-status') refetchBot();
    if (event === 'obs-status') refetchObsStatus();
  });

  const toggle = (key: string) => setExpanded(prev => prev === key ? null : key);

  // --- Actions ---
  const connectTwitch = async () => {
    try {
      await apiFetch('/auth/twitch/open', { method: 'POST' });
    } catch { toast.error(t('error.action_failed')); }
  };

  const disconnectBot = async () => {
    await apiPost('/settings/bot/disconnect', {});
    refetchBot();
  };

  const saveNotionToken = async () => {
    const result = await apiPost('/settings/notion', { token: notionToken.trim() });
    if (!result) { toast.error(t('error.action_failed')); return; }
    setNotionToken(''); setExpanded(null); refetchNotion();
  };

  const saveGithubToken = async () => {
    const result = await apiPost('/progress/github', { token: githubToken.trim() });
    if (!result) { toast.error(t('error.action_failed')); return; }
    setGithubToken(''); refetchGithub();
  };

  const importGithub = async () => {
    const parts = githubRepo.trim().split('/');
    if (parts.length !== 2) { toast.error('Format: owner/repo'); return; }
    setImporting(true);
    try {
      const res = await apiFetch('/progress/import/github', { method: 'POST', body: JSON.stringify({ owner: parts[0], repo: parts[1] }) });
      const data = await res.json();
      if (res.ok) toast.success(`${data.imported} ${t('github.imported')}, ${data.skipped} ${t('github.skipped')}`);
      else toast.error(data.error || t('error.action_failed'));
    } catch { toast.error(t('error.action_failed')); }
    setImporting(false);
  };

  const saveObsConfig = async () => {
    const result = await apiPost('/obs/config', { host: obsHost.trim() || 'localhost', port: parseInt(obsPort) || 4455, password: obsPassword });
    if (!result) { toast.error(t('error.action_failed')); return; }
    setObsPassword(''); setExpanded(null); refetchObs();
    const connectResult = await apiPost('/obs/connect', {});
    if (connectResult) refetchObsStatus();
  };

  const saveCommands = async () => {
    const result = await apiPost('/settings/commands', editCommands);
    if (!result) { toast.error(t('error.action_failed')); return; }
    toast.success(t('commands.saved')); refetchCommands();
  };

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

  const exportBackup = async () => {
    try {
      const res = await apiFetch('/backup/export');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'nst-backup.json'; a.click();
      URL.revokeObjectURL(url);
      toast.success(t('settings.backup_exported'));
    } catch { toast.error(t('settings.export_failed')); }
  };

  const importBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const res = await apiFetch('/backup/import', { method: 'POST', body: JSON.stringify(data) });
      if (res.ok) toast.success(t('settings.backup_imported'));
      else toast.error(t('settings.import_failed'));
    } catch { toast.error(t('settings.import_failed')); }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // --- Card Component ---
  const SettingsCard = ({ id, icon, title, status, statusColor, action, actionColor, onAction, children }: {
    id: string; icon: string; title: string; status: string; statusColor: string;
    action: string; actionColor?: string; onAction: () => void; children?: React.ReactNode;
  }) => (
    <div className={`s-card ${expanded === id ? 'expanded' : ''}`}>
      <div className="s-card-header">
        <div className="s-card-info">
          <span className="s-card-icon">{icon}</span>
          <div>
            <div className="s-card-title">{title}</div>
            <div className="s-card-status" style={{ color: statusColor }}>{status}</div>
          </div>
        </div>
        <button className={`s-card-action ${actionColor || 'primary'}`} onClick={onAction}>{action}</button>
      </div>
      {expanded === id && children && (
        <div className="s-card-body">{children}</div>
      )}
    </div>
  );

  // --- Render Categories ---
  const renderConnections = () => (
    <>
      <SettingsCard
        id="twitch" icon="🟣" title="Twitch"
        status={botStatus?.connected ? `${t('settings.connected_to')} #${botStatus.channel}` : t('settings.not_connected')}
        statusColor={botStatus?.connected ? '#2ecc71' : '#e74c3c'}
        action={botStatus?.connected ? t('settings.disconnect') : t('settings.connect_twitch')}
        actionColor={botStatus?.connected ? 'danger' : 'primary'}
        onAction={botStatus?.connected ? disconnectBot : connectTwitch}
      />

      <SettingsCard
        id="obs" icon="🎥" title="OBS"
        status={obsStatus?.connected ? t('settings.obs_connected') : t('settings.obs_not_connected')}
        statusColor={obsStatus?.connected ? '#2ecc71' : '#e74c3c'}
        action={obsStatus?.connected ? t('settings.obs_disconnect') : (obsConfig?.configured ? t('settings.obs_connect') : 'Setup')}
        actionColor={obsStatus?.connected ? 'danger' : 'primary'}
        onAction={obsStatus?.connected
          ? async () => { await apiPost('/obs/disconnect', {}); refetchObsStatus(); }
          : obsConfig?.configured
            ? async () => { await apiPost('/obs/connect', {}); refetchObsStatus(); }
            : () => toggle('obs')
        }
      >
        <div className="s-card-inputs">
          <div className="s-card-input-row">
            <input type="text" placeholder={t('settings.obs_host')} value={obsHost} onChange={e => setObsHost(e.target.value)} style={{ flex: 2 }} />
            <input type="text" placeholder={t('settings.obs_port')} value={obsPort} onChange={e => setObsPort(e.target.value)} style={{ flex: 1 }} />
          </div>
          <input type="password" placeholder={t('settings.obs_password')} value={obsPassword} onChange={e => setObsPassword(e.target.value)} />
          <button className="s-card-action primary" onClick={saveObsConfig}>{t('settings.obs_connect')}</button>
        </div>
      </SettingsCard>

      <SettingsCard
        id="notion" icon="📝" title="Notion"
        status={notionInfo?.configured ? `Token: ${notionInfo.preview}` : t('settings.not_connected')}
        statusColor={notionInfo?.configured ? '#2ecc71' : '#888'}
        action={notionInfo?.configured ? t('settings.change_token') : 'Setup'}
        actionColor={notionInfo?.configured ? 'ghost' : 'primary'}
        onAction={() => toggle('notion')}
      >
        <div className="s-card-inputs">
          <input type="text" placeholder={t('settings.notion_placeholder')} value={notionToken} onChange={e => setNotionToken(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveNotionToken()} />
          <button className="s-card-action primary" onClick={saveNotionToken}>{t('settings.save')}</button>
          <NotionDatabasePicker compact />
        </div>
      </SettingsCard>

      <SettingsCard
        id="github" icon="🐙" title="GitHub"
        status={githubInfo?.configured ? `Token: ${githubInfo.preview}` : t('settings.not_connected')}
        statusColor={githubInfo?.configured ? '#2ecc71' : '#888'}
        action={githubInfo?.configured ? t('settings.change_token') : 'Setup'}
        actionColor={githubInfo?.configured ? 'ghost' : 'primary'}
        onAction={() => toggle('github')}
      >
        <div className="s-card-inputs">
          {!githubInfo?.configured && (
            <>
              <input type="password" placeholder={t('github.token_placeholder')} value={githubToken} onChange={e => setGithubToken(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveGithubToken()} />
              <button className="s-card-action primary" onClick={saveGithubToken}>{t('settings.save')}</button>
            </>
          )}
          {githubInfo?.configured && (
            <>
              <input type="text" placeholder={t('github.repo_placeholder')} value={githubRepo} onChange={e => setGithubRepo(e.target.value)} onKeyDown={e => e.key === 'Enter' && importGithub()} />
              <button className="s-card-action primary" onClick={importGithub} disabled={importing || !githubRepo.trim()}>
                {importing ? '...' : t('github.import_btn')}
              </button>
              <button className="s-card-action ghost" onClick={async () => { await apiPost('/progress/github', { token: '' }); refetchGithub(); }}>{t('settings.change_token')}</button>
            </>
          )}
        </div>
      </SettingsCard>
    </>
  );

  const renderFeatures = () => (
    <>
      <div className="s-card">
        <div className="s-card-header">
          <div className="s-card-info">
            <span className="s-card-icon">🎬</span>
            <div>
              <div className="s-card-title">{t('auto_clips.title')}</div>
              <div className="s-card-status" style={{ color: autoClipsEnabled ? '#2ecc71' : '#888' }}>
                {autoClipsEnabled ? t('auto_clips.enabled') : t('auto_clips.disabled')}
              </div>
            </div>
          </div>
          <button className={`s-card-action ${expanded === 'autoclips' ? 'ghost' : 'primary'}`} onClick={() => toggle('autoclips')}>
            {expanded === 'autoclips' ? '▲' : '▼'}
          </button>
        </div>
        {expanded === 'autoclips' && (
          <div className="s-card-body">
            <div className="s-toggle-row">
              <button className={`s-toggle-btn ${autoClipsEnabled ? 'active' : ''}`} onClick={() => setAutoClipsEnabled(true)}>{t('auto_clips.enabled')}</button>
              <button className={`s-toggle-btn ${!autoClipsEnabled ? 'active' : ''}`} onClick={() => setAutoClipsEnabled(false)}>{t('auto_clips.disabled')}</button>
            </div>
            <label className="s-checkbox"><input type="checkbox" checked={triggerReward} onChange={e => setTriggerReward(e.target.checked)} /> {t('auto_clips.trigger_reward')}</label>
            <label className="s-checkbox"><input type="checkbox" checked={triggerHype} onChange={e => setTriggerHype(e.target.checked)} /> {t('auto_clips.trigger_hype')}</label>
            <label className="s-checkbox"><input type="checkbox" checked={triggerMilestone} onChange={e => setTriggerMilestone(e.target.checked)} /> {t('auto_clips.trigger_milestone')}</label>
            <button className="s-card-action primary" onClick={saveAutoClipSettings}>{t('settings.save')}</button>
          </div>
        )}
      </div>

      <div className="s-card">
        <div className="s-card-header">
          <div className="s-card-info">
            <span className="s-card-icon">💬</span>
            <div>
              <div className="s-card-title">{t('commands.title')}</div>
              <div className="s-card-status" style={{ color: '#888' }}>{t('commands.desc')}</div>
            </div>
          </div>
          <button className={`s-card-action ${expanded === 'commands' ? 'ghost' : 'primary'}`} onClick={() => toggle('commands')}>
            {expanded === 'commands' ? '▲' : '▼'}
          </button>
        </div>
        {expanded === 'commands' && (
          <div className="s-card-body">
            {Object.entries(editCommands).map(([key, value]) => (
              <div key={key} className="s-command-row">
                <span className="s-command-label">{key}</span>
                <input type="text" value={value} onChange={e => setEditCommands(prev => ({ ...prev, [key]: e.target.value }))} />
              </div>
            ))}
            <button className="s-card-action primary" onClick={saveCommands}>{t('settings.save')}</button>
          </div>
        )}
      </div>
    </>
  );

  const renderApp = () => (
    <>
      <div className="s-card">
        <div className="s-card-header">
          <div className="s-card-info">
            <span className="s-card-icon">🌐</span>
            <div><div className="s-card-title">{t('settings.language')}</div></div>
          </div>
          <div className="s-toggle-row compact">
            <button className={`s-toggle-btn ${lang === 'de' ? 'active' : ''}`} onClick={() => setLang('de')}>Deutsch</button>
            <button className={`s-toggle-btn ${lang === 'en' ? 'active' : ''}`} onClick={() => setLang('en')}>English</button>
          </div>
        </div>
      </div>

      <div className="s-card">
        <div className="s-card-header">
          <div className="s-card-info">
            <span className="s-card-icon">🎨</span>
            <div><div className="s-card-title">{t('settings.design')}</div></div>
          </div>
          <div className="s-toggle-row compact">
            <button className={`s-toggle-btn ${theme === 'dark' ? 'active' : ''}`} onClick={() => setTheme('dark')}>Dark</button>
            <button className={`s-toggle-btn ${theme === 'light' ? 'active' : ''}`} onClick={() => setTheme('light')}>Light</button>
          </div>
        </div>
      </div>

      <div className="s-card">
        <div className="s-card-header">
          <div className="s-card-info">
            <span className="s-card-icon">🚀</span>
            <div><div className="s-card-title">{t('settings.autostart')}</div></div>
          </div>
          <div className="s-toggle-row compact">
            <button className={`s-toggle-btn ${autostartInfo?.enabled ? 'active' : ''}`} onClick={async () => { await apiPost('/settings/autostart', { enabled: true }); refetchAutostart(); }}>{t('settings.enabled')}</button>
            <button className={`s-toggle-btn ${!autostartInfo?.enabled ? 'active' : ''}`} onClick={async () => { await apiPost('/settings/autostart', { enabled: false }); refetchAutostart(); }}>{t('settings.disabled')}</button>
          </div>
        </div>
      </div>

      <div className="s-card">
        <div className="s-card-header">
          <div className="s-card-info">
            <span className="s-card-icon">👤</span>
            <div>
              <div className="s-card-title">{t('profile.settings_title')}</div>
              <div className="s-card-status" style={{ color: '#888' }}>{t(`profile.${currentProfile}` as any)}</div>
            </div>
          </div>
          <button className={`s-card-action ${expanded === 'profile' ? 'ghost' : 'primary'}`} onClick={() => toggle('profile')}>
            {expanded === 'profile' ? '▲' : '▼'}
          </button>
        </div>
        {expanded === 'profile' && (
          <div className="s-card-body">
            <div className="s-profile-grid">
              {PROFILE_KEYS.map(key => (
                <button key={key} className={`s-profile-btn ${currentProfile === key ? 'active' : ''}`} onClick={async () => {
                  await apiPost('/settings/set', { key: 'stream_profile', value: key });
                  applyProfilePreset(key); refetchProfile(); window.location.reload();
                }}>
                  {key === 'creative' ? '🎨' : key === 'gaming' ? '🎮' : key === 'coding' ? '💻' : key === 'chatting' ? '🎙️' : '⚙️'} {t(`profile.${key}` as any)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="s-card">
        <div className="s-card-header">
          <div className="s-card-info">
            <span className="s-card-icon">🧙</span>
            <div>
              <div className="s-card-title">{t('settings.wizard')}</div>
              <div className="s-card-status" style={{ color: '#888' }}>{t('settings.wizard_desc')}</div>
            </div>
          </div>
          <button className="s-card-action ghost" onClick={async () => { await apiPost('/settings/onboarding', { completed: false }); window.location.reload(); }}>
            {t('settings.wizard_restart')}
          </button>
        </div>
      </div>
    </>
  );

  const renderData = () => (
    <>
      <div className="s-card">
        <div className="s-card-header">
          <div className="s-card-info">
            <span className="s-card-icon">🔑</span>
            <div>
              <div className="s-card-title">{t('settings.streamdeck')}</div>
              <div className="s-card-status" style={{ color: '#888' }}>
                {tokenInfo?.token ? `${tokenInfo.token.substring(0, 8)}...` : t('settings.token_loading')}
              </div>
            </div>
          </div>
          {tokenInfo?.token && <CopyButton text={tokenInfo.token} />}
        </div>
        {expanded === 'api' && tokenInfo?.token && (
          <div className="s-card-body">
            <code className="s-code-block">Base URL: http://localhost:{getServerPort()}/api</code>
            <code className="s-code-block">Authorization: Bearer {tokenInfo.token.substring(0, 12)}...</code>
          </div>
        )}
      </div>

      <div className="s-card">
        <div className="s-card-header">
          <div className="s-card-info">
            <span className="s-card-icon">💾</span>
            <div>
              <div className="s-card-title">{t('settings.backup')}</div>
              <div className="s-card-status" style={{ color: '#888' }}>{t('settings.backup_desc')}</div>
            </div>
          </div>
        </div>
        <div className="s-card-body" style={{ paddingTop: 0 }}>
          <div className="s-card-input-row">
            <button className="s-card-action primary" onClick={exportBackup}>{t('settings.backup_export')}</button>
            <label className="s-card-action primary" style={{ cursor: 'pointer', textAlign: 'center' }}>
              {t('settings.backup_import')}
              <input ref={fileInputRef} type="file" accept=".json" onChange={importBackup} style={{ display: 'none' }} />
            </label>
          </div>
        </div>
      </div>

      <div className="s-card">
        <div className="s-card-header">
          <div className="s-card-info">
            <span className="s-card-icon">☁️</span>
            <div>
              <div className="s-card-title">Cloud Sync</div>
              <div className="s-card-status" style={{ color: syncEnabled ? '#2ecc71' : '#888' }}>
                {syncEnabled ? (syncStatus?.lastSync ? `${t('settings.last_sync')}: ${new Date(syncStatus.lastSync).toLocaleString('de-DE')}` : t('settings.enabled')) : t('settings.disabled')}
              </div>
            </div>
          </div>
          <button className={`s-card-action ${expanded === 'sync' ? 'ghost' : 'primary'}`} onClick={() => toggle('sync')}>
            {expanded === 'sync' ? '▲' : '▼'}
          </button>
        </div>
        {expanded === 'sync' && (
          <div className="s-card-body">
            <label className="s-checkbox">
              <input type="checkbox" checked={syncEnabled} onChange={e => { setSyncEnabled(e.target.checked); apiPost('/settings/sync/config', { enabled: e.target.checked, syncPath }); refetchSync(); }} />
              Sync aktiviert
            </label>
            <div className="s-card-input-row">
              <input type="text" value={syncPath} readOnly placeholder="Kein Ordner" style={{ flex: 1 }} />
              <button className="s-card-action ghost" onClick={async () => {
                const folder = await window.electronAPI?.selectSyncFolder();
                if (folder) { setSyncPath(folder); await apiPost('/settings/sync/config', { enabled: syncEnabled, syncPath: folder }); refetchSync(); }
              }}>{t('settings.select')}</button>
            </div>
            {syncStatus?.error && <div className="s-card-status" style={{ color: '#e74c3c' }}>{syncStatus.error}</div>}
            <button className="s-card-action primary" onClick={async () => {
              setSyncing(true);
              const result = await apiPost<{ success: boolean; error?: string }>('/settings/sync/trigger', {});
              setSyncing(false); refetchSync();
              if (result?.success) toast.success('Sync OK'); else toast.error(result?.error || 'Sync failed');
            }} disabled={!syncEnabled || !syncPath || syncing}>
              {syncing ? '...' : t('settings.sync_now')}
            </button>
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="panel settings-panel-v2">
      <div className="s-sidebar">
        {CATEGORIES.map(cat => (
          <button
            key={cat.key}
            className={`s-sidebar-btn ${category === cat.key ? 'active' : ''}`}
            onClick={() => setCategory(cat.key)}
          >
            <span>{cat.icon}</span>
            <span>{t(cat.labelKey as any)}</span>
          </button>
        ))}
      </div>
      <div className="s-content">
        {category === 'connections' && renderConnections()}
        {category === 'features' && renderFeatures()}
        {category === 'app' && renderApp()}
        {category === 'data' && renderData()}
      </div>
    </div>
  );
}

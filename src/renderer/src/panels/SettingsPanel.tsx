import React, { useState, useEffect, useRef } from 'react';
import { useApi, apiGet, apiPost, apiFetch, getApiToken, getServerPort } from '../hooks/useApi';
import { useWebSocket } from '../hooks/useWebSocket';
import { TwitchConfigResponse, BotStatus } from '../../../shared/types';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
import CopyButton from '../components/CopyButton';
import NotionDatabasePicker from '../components/NotionDatabasePicker';

type SettingsCategory = 'connections' | 'features' | 'app' | 'data';

const CATEGORIES: { key: SettingsCategory; icon: string; label: string }[] = [
  { key: 'connections', icon: '🔗', label: 'Verbindungen' },
  { key: 'features', icon: '🎬', label: 'Features' },
  { key: 'app', icon: '🖥️', label: 'App' },
  { key: 'data', icon: '💾', label: 'Daten & API' },
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
  const { data: autostartInfo, refetch: refetchAutostart } = useApi<{ enabled: boolean }>('/settings/autostart');
  const { data: commandsData, refetch: refetchCommands } = useApi<Record<string, string>>('/settings/commands');

  const { toast } = useToast();
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
    } catch { toast.error('Aktion fehlgeschlagen'); }
  };

  const disconnectBot = async () => {
    await apiPost('/settings/bot/disconnect', {});
    refetchBot();
  };

  const saveNotionToken = async () => {
    const result = await apiPost('/settings/notion', { token: notionToken.trim() });
    if (!result) { toast.error('Aktion fehlgeschlagen'); return; }
    setNotionToken(''); setExpanded(null); refetchNotion();
  };

  const saveGithubToken = async () => {
    const result = await apiPost('/progress/github', { token: githubToken.trim() });
    if (!result) { toast.error('Aktion fehlgeschlagen'); return; }
    setGithubToken(''); refetchGithub();
  };

  const importGithub = async () => {
    const parts = githubRepo.trim().split('/');
    if (parts.length !== 2) { toast.error('Format: owner/repo'); return; }
    setImporting(true);
    try {
      const res = await apiFetch('/progress/import/github', { method: 'POST', body: JSON.stringify({ owner: parts[0], repo: parts[1] }) });
      const data = await res.json();
      if (res.ok) toast.success(`${data.imported} importiert, ${data.skipped} übersprungen`);
      else toast.error(data.error || 'Aktion fehlgeschlagen');
    } catch { toast.error('Aktion fehlgeschlagen'); }
    setImporting(false);
  };

  const saveObsConfig = async () => {
    const result = await apiPost('/obs/config', { host: obsHost.trim() || 'localhost', port: parseInt(obsPort) || 4455, password: obsPassword });
    if (!result) { toast.error('Aktion fehlgeschlagen'); return; }
    setObsPassword(''); setExpanded(null); refetchObs();
    const connectResult = await apiPost('/obs/connect', {});
    if (connectResult) refetchObsStatus();
  };

  const saveCommands = async () => {
    const result = await apiPost('/settings/commands', editCommands);
    if (!result) { toast.error('Aktion fehlgeschlagen'); return; }
    toast.success('Commands gespeichert'); refetchCommands();
  };

  const saveAutoClipSettings = async () => {
    const result = await apiPost('/settings/batch', {
      auto_clips_enabled: String(autoClipsEnabled),
      auto_clip_trigger_reward: String(triggerReward),
      auto_clip_trigger_hype: String(triggerHype),
      auto_clip_trigger_milestone: String(triggerMilestone),
    });
    if (!result) { toast.error('Aktion fehlgeschlagen'); return; }
    toast.success('Design gespeichert');
  };

  const exportBackup = async () => {
    try {
      const res = await apiFetch('/backup/export');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'nst-backup.json'; a.click();
      URL.revokeObjectURL(url);
      toast.success('Backup exportiert!');
    } catch { toast.error('Export fehlgeschlagen'); }
  };

  const importBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const res = await apiFetch('/backup/import', { method: 'POST', body: JSON.stringify(data) });
      if (res.ok) toast.success('Backup erfolgreich importiert!');
      else toast.error('Import fehlgeschlagen');
    } catch { toast.error('Import fehlgeschlagen'); }
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
        status={botStatus?.connected ? `Verbunden mit #${botStatus.channel}` : 'Nicht verbunden'}
        statusColor={botStatus?.connected ? '#2ecc71' : '#e74c3c'}
        action={botStatus?.connected ? 'Trennen' : 'Mit Twitch verbinden'}
        actionColor={botStatus?.connected ? 'danger' : 'primary'}
        onAction={botStatus?.connected ? disconnectBot : connectTwitch}
      />

      <SettingsCard
        id="obs" icon="🎥" title="OBS"
        status={obsStatus?.connected ? 'Verbunden mit OBS' : 'Nicht verbunden'}
        statusColor={obsStatus?.connected ? '#2ecc71' : '#e74c3c'}
        action={obsStatus?.connected ? 'OBS trennen' : (obsConfig?.configured ? 'Mit OBS verbinden' : 'Setup')}
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
            <input type="text" placeholder="Host (localhost)" value={obsHost} onChange={e => setObsHost(e.target.value)} style={{ flex: 2 }} />
            <input type="text" placeholder="Port (4455)" value={obsPort} onChange={e => setObsPort(e.target.value)} style={{ flex: 1 }} />
          </div>
          <input type="password" placeholder="Passwort (optional)" value={obsPassword} onChange={e => setObsPassword(e.target.value)} />
          <button className="s-card-action primary" onClick={saveObsConfig}>Mit OBS verbinden</button>
        </div>
      </SettingsCard>

      <SettingsCard
        id="notion" icon="📝" title="Notion"
        status={notionInfo?.configured ? `Token: ${notionInfo.preview}` : 'Nicht verbunden'}
        statusColor={notionInfo?.configured ? '#2ecc71' : '#888'}
        action={notionInfo?.configured ? 'Token ändern' : 'Setup'}
        actionColor={notionInfo?.configured ? 'ghost' : 'primary'}
        onAction={() => toggle('notion')}
      >
        <div className="s-card-inputs">
          <input type="text" placeholder="Notion Internal Integration Token (ntn_...)" value={notionToken} onChange={e => setNotionToken(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveNotionToken()} />
          <button className="s-card-action primary" onClick={saveNotionToken}>Speichern</button>
          <NotionDatabasePicker compact />
        </div>
      </SettingsCard>

      <SettingsCard
        id="github" icon="🐙" title="GitHub"
        status={githubInfo?.configured ? `Token: ${githubInfo.preview}` : 'Nicht verbunden'}
        statusColor={githubInfo?.configured ? '#2ecc71' : '#888'}
        action={githubInfo?.configured ? 'Token ändern' : 'Setup'}
        actionColor={githubInfo?.configured ? 'ghost' : 'primary'}
        onAction={() => toggle('github')}
      >
        <div className="s-card-inputs">
          {!githubInfo?.configured && (
            <>
              <input type="password" placeholder="GitHub Personal Access Token (ghp_...)" value={githubToken} onChange={e => setGithubToken(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveGithubToken()} />
              <button className="s-card-action primary" onClick={saveGithubToken}>Speichern</button>
            </>
          )}
          {githubInfo?.configured && (
            <>
              <input type="text" placeholder="owner/repo" value={githubRepo} onChange={e => setGithubRepo(e.target.value)} onKeyDown={e => e.key === 'Enter' && importGithub()} />
              <button className="s-card-action primary" onClick={importGithub} disabled={importing || !githubRepo.trim()}>
                {importing ? '...' : '📥 Importieren'}
              </button>
              <button className="s-card-action ghost" onClick={async () => { await apiPost('/progress/github', { token: '' }); refetchGithub(); }}>Token ändern</button>
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
              <div className="s-card-title">Auto-Clips</div>
              <div className="s-card-status" style={{ color: autoClipsEnabled ? '#2ecc71' : '#888' }}>
                {autoClipsEnabled ? 'Auto-Clips aktiviert' : 'Auto-Clips deaktiviert'}
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
              <button className={`s-toggle-btn ${autoClipsEnabled ? 'active' : ''}`} onClick={() => setAutoClipsEnabled(true)}>Auto-Clips aktiviert</button>
              <button className={`s-toggle-btn ${!autoClipsEnabled ? 'active' : ''}`} onClick={() => setAutoClipsEnabled(false)}>Auto-Clips deaktiviert</button>
            </div>
            <label className="s-checkbox"><input type="checkbox" checked={triggerReward} onChange={e => setTriggerReward(e.target.checked)} /> Channel Point Rewards</label>
            <label className="s-checkbox"><input type="checkbox" checked={triggerHype} onChange={e => setTriggerHype(e.target.checked)} /> Hype Moments</label>
            <label className="s-checkbox"><input type="checkbox" checked={triggerMilestone} onChange={e => setTriggerMilestone(e.target.checked)} /> Milestones</label>
            <button className="s-card-action primary" onClick={saveAutoClipSettings}>Speichern</button>
          </div>
        )}
      </div>

      <div className="s-card">
        <div className="s-card-header">
          <div className="s-card-info">
            <span className="s-card-icon">💬</span>
            <div>
              <div className="s-card-title">Chat Commands</div>
              <div className="s-card-status" style={{ color: '#888' }}>Chat-Befehle umbenennen. Alle Befehle beginnen mit !</div>
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
            <button className="s-card-action primary" onClick={saveCommands}>Speichern</button>
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
            <span className="s-card-icon">🎨</span>
            <div><div className="s-card-title">Design</div></div>
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
            <div><div className="s-card-title">Autostart</div></div>
          </div>
          <div className="s-toggle-row compact">
            <button className={`s-toggle-btn ${autostartInfo?.enabled ? 'active' : ''}`} onClick={async () => { await apiPost('/settings/autostart', { enabled: true }); refetchAutostart(); }}>Aktiviert</button>
            <button className={`s-toggle-btn ${!autostartInfo?.enabled ? 'active' : ''}`} onClick={async () => { await apiPost('/settings/autostart', { enabled: false }); refetchAutostart(); }}>Deaktiviert</button>
          </div>
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
              <div className="s-card-title">Stream Deck API Token</div>
              <div className="s-card-status" style={{ color: '#888' }}>
                {tokenInfo?.token ? `${tokenInfo.token.substring(0, 8)}...` : 'Token wird geladen...'}
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
              <div className="s-card-title">Daten-Backup</div>
              <div className="s-card-status" style={{ color: '#888' }}>Alle Daten als JSON exportieren oder ein Backup importieren.</div>
            </div>
          </div>
        </div>
        <div className="s-card-body" style={{ paddingTop: 0 }}>
          <div className="s-card-input-row">
            <button className="s-card-action primary" onClick={exportBackup}>💾 Backup exportieren</button>
            <label className="s-card-action primary" style={{ cursor: 'pointer', textAlign: 'center' }}>
              📂 Backup importieren
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
                {syncEnabled ? (syncStatus?.lastSync ? `Letzter Sync: ${new Date(syncStatus.lastSync).toLocaleString('de-DE')}` : 'Aktiviert') : 'Deaktiviert'}
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
              }}>Auswählen</button>
            </div>
            {syncStatus?.error && <div className="s-card-status" style={{ color: '#e74c3c' }}>{syncStatus.error}</div>}
            <button className="s-card-action primary" onClick={async () => {
              setSyncing(true);
              const result = await apiPost<{ success: boolean; error?: string }>('/settings/sync/trigger', {});
              setSyncing(false); refetchSync();
              if (result?.success) toast.success('Sync OK'); else toast.error(result?.error || 'Sync failed');
            }} disabled={!syncEnabled || !syncPath || syncing}>
              {syncing ? '...' : 'Jetzt synchronisieren'}
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
            <span>{cat.label}</span>
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

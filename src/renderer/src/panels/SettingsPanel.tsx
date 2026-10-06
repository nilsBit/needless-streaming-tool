import React, { useState, useEffect, useRef } from 'react';
import { useApi, apiGet, apiPost, apiFetch, getServerPort } from '../hooks/useApi';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
import CopyButton from '../components/CopyButton';
import ConnectionCards from '../components/settings/ConnectionCards';
import FeaturesCard from '../components/settings/FeaturesCard';

export type SettingsCategory = 'connections' | 'app' | 'data';

// Einstellungen: Verbindungen (the connection cards, shared with the setup),
// Programm (what the stream can do, look, autostart; the hotkeys are their
// own panel) and Daten (API token, backup, sync folder).
export default function SettingsPanel({ category }: { category: SettingsCategory }) {
  const { data: tokenInfo } = useApi<{ token: string | null }>('/settings/api-token');
  const { data: syncStatus, refetch: refetchSync } = useApi<{
    enabled: boolean; syncPath?: string; lastSync?: string; device?: string; error?: string;
  }>('/settings/sync/status');
  const { data: autostartInfo, refetch: refetchAutostart } = useApi<{ enabled: boolean }>('/settings/autostart');

  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [expanded, setExpanded] = useState<string | null>(null);
  const [syncPath, setSyncPath] = useState('');
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    apiGet<{ enabled: boolean; syncPath: string }>('/settings/sync/config').then((cfg) => {
      if (cfg) { setSyncPath(cfg.syncPath || ''); setSyncEnabled(cfg.enabled); }
    });
  }, []);

  const toggle = (key: string) => setExpanded((prev) => (prev === key ? null : key));

  const exportBackup = async () => {
    try {
      const res = await apiFetch('/backup/export');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'nst-backup.json'; a.click();
      URL.revokeObjectURL(url);
      toast.success('Sicherung erstellt');
    } catch { toast.error('Sicherung fehlgeschlagen'); }
  };

  const importBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const res = await apiFetch('/backup/import', { method: 'POST', body: JSON.stringify(data) });
      if (res.ok) toast.success('Sicherung zurückgespielt');
      else toast.error('Zurückspielen fehlgeschlagen');
    } catch { toast.error('Import fehlgeschlagen'); }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const renderApp = () => (
    <>
      <FeaturesCard />

      <div className="s-card">
        <div className="s-card-header">
          <div className="s-card-info">
            <div><div className="s-card-title">Erscheinungsbild der App</div></div>
          </div>
          <div className="s-toggle-row compact">
            <button className={`s-toggle-btn ${theme === 'dark' ? 'active' : ''}`} onClick={() => setTheme('dark')}>Dunkel</button>
            <button className={`s-toggle-btn ${theme === 'light' ? 'active' : ''}`} onClick={() => setTheme('light')}>Hell</button>
          </div>
        </div>
      </div>

      <div className="s-card">
        <div className="s-card-header">
          <div className="s-card-info">
            <div><div className="s-card-title">Mit dem Rechner starten</div></div>
          </div>
          <div className="s-toggle-row compact">
            <button className={`s-toggle-btn ${autostartInfo?.enabled ? 'active' : ''}`} onClick={async () => { await apiPost('/settings/autostart', { enabled: true }); refetchAutostart(); }}>An</button>
            <button className={`s-toggle-btn ${!autostartInfo?.enabled ? 'active' : ''}`} onClick={async () => { await apiPost('/settings/autostart', { enabled: false }); refetchAutostart(); }}>Aus</button>
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
            <div>
              <div className="s-card-title">API-Token für externe Werkzeuge</div>
              <div className="s-card-status" style={{ color: '#888' }}>
                {tokenInfo?.token ? `${tokenInfo.token.substring(0, 8)}...` : 'Token wird geladen …'}
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
            <div>
              <div className="s-card-title">Sicherung</div>
              <div className="s-card-status" style={{ color: '#888' }}>Alle Daten als Datei sichern oder eine Sicherung zurückspielen. Zugangsdaten und Tokens bleiben draußen und werden beim Zurückspielen nicht angerührt.</div>
            </div>
          </div>
        </div>
        <div className="s-card-body" style={{ paddingTop: 0 }}>
          <div className="s-card-input-row">
            <button className="s-card-action primary" onClick={exportBackup}>Sicherung erstellen</button>
            <label className="s-card-action primary" style={{ cursor: 'pointer', textAlign: 'center' }}>
              Sicherung zurückspielen
              <input ref={fileInputRef} type="file" accept=".json" onChange={importBackup} style={{ display: 'none' }} />
            </label>
          </div>
        </div>
      </div>

      <div className="s-card">
        <div className="s-card-header">
          <div className="s-card-info">
            <div>
              <div className="s-card-title">Sync-Ordner</div>
              <div className="s-card-status" style={{ color: syncEnabled ? '#2ecc71' : '#888' }}>
                {syncEnabled ? (syncStatus?.lastSync ? `Zuletzt abgeglichen ${new Date(syncStatus.lastSync).toLocaleString('de-DE')}` : 'An') : 'Aus'}
              </div>
            </div>
          </div>
          <button className={`s-card-action ${expanded === 'sync' ? 'ghost' : 'primary'}`} onClick={() => toggle('sync')}>
            {expanded === 'sync' ? 'Zuklappen' : 'Einrichten'}
          </button>
        </div>
        {expanded === 'sync' && (
          <div className="s-card-body">
            <label className="s-checkbox">
              <input type="checkbox" checked={syncEnabled} onChange={e => { setSyncEnabled(e.target.checked); apiPost('/settings/sync/config', { enabled: e.target.checked, syncPath }); refetchSync(); }} />
              Mit einem Ordner abgleichen, etwa in Dropbox
            </label>
            <div className="s-card-input-row">
              <input type="text" value={syncPath} readOnly placeholder="Kein Ordner gewählt" style={{ flex: 1 }} />
              <button className="s-card-action ghost" onClick={async () => {
                const folder = await window.electronAPI?.selectSyncFolder();
                if (folder) { setSyncPath(folder); await apiPost('/settings/sync/config', { enabled: syncEnabled, syncPath: folder }); refetchSync(); }
              }}>Ordner wählen</button>
            </div>
            {syncStatus?.error && <div className="s-card-status" style={{ color: '#e74c3c' }}>{syncStatus.error}</div>}
            <button className="s-card-action primary" onClick={async () => {
              setSyncing(true);
              const result = await apiPost<{ success: boolean; error?: string }>('/settings/sync/trigger', {});
              setSyncing(false); refetchSync();
              if (result?.success) toast.success('Abgeglichen'); else toast.error(result?.error || 'Abgleich fehlgeschlagen');
            }} disabled={!syncEnabled || !syncPath || syncing}>
              {syncing ? 'Gleicht ab …' : 'Jetzt abgleichen'}
            </button>
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="panel settings-panel-v2 settings-plain">
      <div className="s-content">
        {category === 'connections' && <ConnectionCards />}
        {category === 'app' && renderApp()}
        {category === 'data' && renderData()}
      </div>
    </div>
  );
}

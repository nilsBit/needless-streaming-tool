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
// own panel) and Daten (backup, API token folded away, sync folder only while on).
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
    <ul className="chat-list" aria-label="Daten">
      <li className="ovl-item">
        <div className="ovl-line data-line">
          <span className="chat-row-name">Sicherung erstellen</span>
          <span className="chat-row-text">Befehle, Overlays, Einstellungen und Zahlen in eine Datei. Zugangsdaten bleiben draußen.</span>
          <button type="button" className="card-primary" onClick={exportBackup}>Sicherung erstellen</button>
        </div>
      </li>

      <li className="ovl-item">
        <div className="ovl-line data-line">
          <span className="chat-row-name">Sicherung zurückspielen</span>
          <span className="chat-row-text">Ersetzt die Daten hier durch die aus der Datei. Deine Zugänge bleiben, wie sie sind.</span>
          <button type="button" className="card-secondary" onClick={() => fileInputRef.current?.click()}>Datei wählen …</button>
          <input ref={fileInputRef} type="file" accept=".json" onChange={importBackup} hidden />
        </div>
      </li>

      <li className={`ovl-item ${expanded === 'api' ? 'open' : ''}`}>
        <div className="ovl-line data-line">
          <span className="chat-row-name">Für eigene Werkzeuge</span>
          <span className="chat-row-text">Nur nötig, wenn du selbst etwas an das Tool anbindest. Stream Deck und Figma finden ihren Zugang allein.</span>
          <button type="button" className="card-secondary" aria-expanded={expanded === 'api'} onClick={() => toggle('api')}>
            {expanded === 'api' ? 'Zuklappen' : 'Anzeigen'}
          </button>
        </div>
        {expanded === 'api' && (
          <div className="data-open">
            {tokenInfo?.token ? (
              <>
                <div className="chat-box-row">
                  <div className="ovl-box-text"><b>API-Token</b><span>{tokenInfo.token.substring(0, 8)}…</span></div>
                  <CopyButton text={tokenInfo.token} />
                </div>
                <div className="chat-box-row">
                  <div className="ovl-box-text"><b>Adresse</b><span>http://localhost:{getServerPort()}/api · Kopfzeile „Authorization: Bearer &lt;Token&gt;“</span></div>
                </div>
              </>
            ) : (
              <span className="chat-row-text">Token wird geladen …</span>
            )}
          </div>
        )}
      </li>

      {/* The sync folder is retired from the app; it only shows while it is
          still switched on, so whoever uses it can switch it off. */}
      {syncEnabled && (
        <li className="ovl-item">
          <div className="ovl-line data-line">
            <span className="chat-row-name">Sync-Ordner</span>
            <span className="chat-row-text">
              {syncStatus?.error ?? (syncStatus?.lastSync ? `Zuletzt abgeglichen ${new Date(syncStatus.lastSync).toLocaleString('de-DE')}` : 'An')}
            </span>
            <button type="button" className="card-secondary" onClick={async () => {
              setSyncEnabled(false);
              await apiPost('/settings/sync/config', { enabled: false, syncPath });
              refetchSync();
            }}>Ausschalten</button>
          </div>
        </li>
      )}
    </ul>
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

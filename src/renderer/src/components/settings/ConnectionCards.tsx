import React, { useEffect, useState } from 'react';
import { useApi, apiPost, apiFetch } from '../../hooks/useApi';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useToast } from '../../contexts/ToastContext';
import { useVisibleInterval } from '../../hooks/useVisibleInterval';
import { useFeatures } from '../../contexts/FeaturesContext';
import NotionDatabasePicker from '../NotionDatabasePicker';
import type { BotStatus } from '../../../../shared/types';
import type { ConnectionKey } from '../../../../shared/features';

// The connections as cards — one building block for Einstellungen →
// Verbindungen (every card) and the setup's step "Verbinden" (`only` the
// ones the chosen features need). Twitch, OBS, Worldbuilder and Discord belong
// to features; Notion and GitHub are settings only.

interface Props {
  /** The setup passes what its choice needs; the settings show everything. */
  only?: readonly ConnectionKey[];
}

interface SourceInfo { source: 'notion' | 'worldbuilder'; world?: string | null; error?: string; message?: string }

const OK = '#2ecc71';
const BAD = '#e74c3c';
const OFF = '#888';

function Card({ id, title, note, status, statusColor, action, actionColor, onAction, expanded, children }: {
  id: string; title: string; note?: string; status: string; statusColor: string;
  action?: string; actionColor?: string; onAction?: () => void; expanded: boolean; children?: React.ReactNode;
}) {
  return (
    <div className={`s-card ${expanded ? 'expanded' : ''}`} data-connection={id}>
      <div className="s-card-header">
        <div className="s-card-info">
          <div>
            <div className="s-card-title">{title}{note && <span className="s-card-note"> · {note}</span>}</div>
            <div className="s-card-status" style={{ color: statusColor }}>{status}</div>
          </div>
        </div>
        {action && onAction && <button type="button" className={`s-card-action ${actionColor || 'primary'}`} onClick={onAction}>{action}</button>}
      </div>
      {expanded && children && <div className="s-card-body">{children}</div>}
    </div>
  );
}

export default function ConnectionCards({ only }: Props) {
  const { toast } = useToast();
  const { worldbuilder } = useFeatures();
  const show = (key: ConnectionKey) => !only || only.includes(key);
  const settingsOnly = !only;

  const { data: botStatus, refetch: refetchBot } = useApi<BotStatus>('/settings/bot-status');
  const { data: obsConfig, refetch: refetchObs } = useApi<{ configured: boolean; host?: string; port?: number; has_password?: boolean }>('/obs/config');
  const { data: obsStatus, refetch: refetchObsStatus } = useApi<{ connected: boolean }>('/obs/status');
  const { data: notionInfo, refetch: refetchNotion } = useApi<{ configured: boolean; preview: string | null }>('/settings/notion');
  const { data: githubInfo, refetch: refetchGithub } = useApi<{ configured: boolean; preview: string | null; repo: string | null }>('/progress/github');
  const { data: discordLive, refetch: refetchDiscordLive } = useApi<{ configured: boolean; message: string }>('/settings/discord-live');
  const { data: world, refetch: refetchWorld } = useApi<SourceInfo>('/characters/source');

  const [expanded, setExpanded] = useState<string | null>(null);
  const toggle = (key: string) => setExpanded((prev) => (prev === key ? null : key));

  const [obsHost, setObsHost] = useState('localhost');
  const [obsPort, setObsPort] = useState('4455');
  const [obsPassword, setObsPassword] = useState('');
  const [notionToken, setNotionToken] = useState('');
  const [githubToken, setGithubToken] = useState('');
  const [githubRepo, setGithubRepo] = useState('');
  const [importing, setImporting] = useState(false);
  const [discordWebhook, setDiscordWebhook] = useState('');
  const [discordMessage, setDiscordMessage] = useState<string | null>(null);

  useEffect(() => { if (githubInfo?.repo && !githubRepo) setGithubRepo(githubInfo.repo); }, [githubInfo, githubRepo]);
  useWebSocket((event) => {
    if (event === 'bot-status') refetchBot();
    if (event === 'obs-status') refetchObsStatus();
    if (event === 'entry-changed' || event === 'follow-changed') refetchWorld();
  });
  useVisibleInterval(refetchWorld, 30_000, show('worldbuilder'));

  const connectTwitch = async () => {
    try { await apiFetch('/auth/twitch/open', { method: 'POST' }); }
    catch { toast.error('Aktion fehlgeschlagen'); }
  };
  const disconnectBot = async () => { await apiPost('/settings/bot/disconnect', {}); refetchBot(); };

  const saveObsConfig = async () => {
    const result = await apiPost('/obs/config', { host: obsHost.trim() || 'localhost', port: parseInt(obsPort) || 4455, password: obsPassword });
    if (!result) { toast.error('Aktion fehlgeschlagen'); return; }
    setObsPassword(''); setExpanded(null); refetchObs();
    const connectResult = await apiPost('/obs/connect', {});
    if (connectResult) refetchObsStatus();
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

  const saveDiscordLive = async () => {
    const body: { webhook_url?: string; message?: string } = {};
    if (discordWebhook.trim() !== '') body.webhook_url = discordWebhook.trim();
    if (discordMessage !== null) body.message = discordMessage;
    const res = await apiFetch('/settings/discord-live', { method: 'POST', body: JSON.stringify(body) });
    if (!res.ok) { toast.error((await res.json()).error || 'Aktion fehlgeschlagen'); return; }
    setDiscordWebhook(''); setDiscordMessage(null); setExpanded(null); refetchDiscordLive();
    toast.success('Discord gespeichert');
  };

  const removeDiscordLive = async () => {
    await apiFetch('/settings/discord-live', { method: 'POST', body: JSON.stringify({ webhook_url: '' }) });
    refetchDiscordLive();
  };

  const useWorldbuilder = async () => {
    const result = await apiPost('/characters/source', { source: 'worldbuilder' });
    if (!result) { toast.error('Aktion fehlgeschlagen'); return; }
    refetchWorld();
  };

  const worldStatus = !world ? '…'
    : world.source !== 'worldbuilder' ? 'Notion ist die Quelle'
    : world.error ? 'Nicht erreichbar – ist der Worldbuilder offen?'
    : world.world ? `Erreichbar · „${world.world}“` : 'Erreichbar';
  const worldColor = !world || world.source !== 'worldbuilder' ? OFF : world.error ? BAD : OK;

  return (
    <>
      {show('twitch') && (
        <Card
          id="twitch" title="Twitch" expanded={false}
          note={only ? 'Bot, Alerts und Kanalpunkte' : undefined}
          status={botStatus?.connected ? `Verbunden mit #${botStatus.channel}` : (botStatus?.error ?? 'Nicht verbunden')}
          statusColor={botStatus?.connected ? OK : BAD}
          action={botStatus?.connected ? 'Trennen' : 'Mit Twitch verbinden'}
          actionColor={botStatus?.connected ? 'danger' : 'primary'}
          onAction={botStatus?.connected ? disconnectBot : connectTwitch}
        />
      )}

      {show('obs') && (
        <Card
          id="obs" title="OBS" expanded={expanded === 'obs'}
          note={only ? 'Overlays und Szenen' : undefined}
          status={obsStatus?.connected ? 'Verbunden mit OBS' : (obsConfig?.configured ? 'Nicht verbunden' : 'Noch nicht eingerichtet – in OBS: Werkzeuge → WebSocket-Servereinstellungen')}
          statusColor={obsStatus?.connected ? OK : BAD}
          action={obsStatus?.connected ? 'OBS trennen' : (obsConfig?.configured ? 'Mit OBS verbinden' : 'Einrichten')}
          actionColor={obsStatus?.connected ? 'danger' : 'primary'}
          onAction={obsStatus?.connected
            ? async () => { await apiPost('/obs/disconnect', {}); refetchObsStatus(); }
            : obsConfig?.configured
              ? async () => { await apiPost('/obs/connect', {}); refetchObsStatus(); }
              : () => toggle('obs')}
        >
          <div className="s-card-inputs">
            <div className="s-card-input-row">
              <input type="text" placeholder="Rechner (localhost)" aria-label="Rechner" value={obsHost} onChange={(e) => setObsHost(e.target.value)} style={{ flex: 2 }} />
              <input type="text" placeholder="Port (4455)" aria-label="Port" value={obsPort} onChange={(e) => setObsPort(e.target.value)} style={{ flex: 1 }} />
            </div>
            <input type="password" placeholder="Passwort aus OBS (leer, wenn keins)" aria-label="Passwort" value={obsPassword} onChange={(e) => setObsPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveObsConfig()} />
            <button type="button" className="s-card-action primary" onClick={saveObsConfig}>Mit OBS verbinden</button>
          </div>
        </Card>
      )}

      {show('worldbuilder') && (only || worldbuilder) && (
        <Card
          id="worldbuilder" title="Worldbuilder" expanded={false}
          note={only ? 'Eintragskarte aus der Welt' : undefined}
          status={worldStatus} statusColor={worldColor}
          action={world && world.source !== 'worldbuilder' ? 'Worldbuilder als Quelle' : undefined}
          onAction={useWorldbuilder}
        />
      )}

      {settingsOnly && (
        <Card
          id="notion" title="Notion" expanded={expanded === 'notion'}
          status={notionInfo?.configured ? `Token: ${notionInfo.preview}` : 'Nicht verbunden'}
          statusColor={notionInfo?.configured ? OK : OFF}
          action={notionInfo?.configured ? 'Token ändern' : 'Einrichten'}
          actionColor={notionInfo?.configured ? 'ghost' : 'primary'}
          onAction={() => toggle('notion')}
        >
          <div className="s-card-inputs">
            <input type="text" placeholder="Notion Internal Integration Token (ntn_...)" value={notionToken} onChange={(e) => setNotionToken(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveNotionToken()} />
            <button type="button" className="s-card-action primary" onClick={saveNotionToken}>Speichern</button>
            <NotionDatabasePicker compact />
          </div>
        </Card>
      )}

      {show('discord') && (
        <Card
          id="discord" title="Discord" expanded={expanded === 'discord'}
          note="Live-Meldung"
          status={discordLive?.configured ? 'Meldet, wenn der Stream startet' : 'Nicht eingerichtet'}
          statusColor={discordLive?.configured ? OK : OFF}
          action={discordLive?.configured ? 'Ändern' : 'Einrichten'}
          actionColor={discordLive?.configured ? 'ghost' : 'primary'}
          onAction={() => toggle('discord')}
        >
          <div className="s-card-inputs">
            {/* The URL is a write permission for the channel: it goes in, never back out. */}
            <input
              type="password"
              aria-label="Webhook-Adresse"
              placeholder={discordLive?.configured ? 'Neue Webhook-Adresse (leer lassen = behalten)' : 'Webhook-Adresse (https://discord.com/api/webhooks/…)'}
              value={discordWebhook}
              onChange={(e) => setDiscordWebhook(e.target.value)}
            />
            <textarea rows={3} aria-label="Text der Meldung" placeholder="Text — {channel} wird zum Twitch-Kanal" value={discordMessage ?? discordLive?.message ?? ''} onChange={(e) => setDiscordMessage(e.target.value)} />
            <button type="button" className="s-card-action primary" onClick={saveDiscordLive}>Speichern</button>
            {discordLive?.configured && <button type="button" className="s-card-action danger" onClick={removeDiscordLive}>Webhook entfernen</button>}
          </div>
        </Card>
      )}

      {settingsOnly && (
        <Card
          id="github" title="GitHub" expanded={expanded === 'github'}
          status={githubInfo?.configured ? `Token: ${githubInfo.preview}` : 'Nicht verbunden'}
          statusColor={githubInfo?.configured ? OK : OFF}
          action={githubInfo?.configured ? 'Token ändern' : 'Einrichten'}
          actionColor={githubInfo?.configured ? 'ghost' : 'primary'}
          onAction={() => toggle('github')}
        >
          <div className="s-card-inputs">
            {!githubInfo?.configured && (
              <>
                <input type="password" placeholder="GitHub Personal Access Token (ghp_...)" value={githubToken} onChange={(e) => setGithubToken(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveGithubToken()} />
                <button type="button" className="s-card-action primary" onClick={saveGithubToken}>Speichern</button>
              </>
            )}
            {githubInfo?.configured && (
              <>
                <input type="text" placeholder="owner/repo" value={githubRepo} onChange={(e) => setGithubRepo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && importGithub()} />
                <button type="button" className="s-card-action primary" onClick={importGithub} disabled={importing || !githubRepo.trim()}>{importing ? 'Importiert …' : 'Importieren'}</button>
                <button type="button" className="s-card-action ghost" onClick={async () => { await apiPost('/progress/github', { token: '' }); refetchGithub(); }}>Token ändern</button>
              </>
            )}
          </div>
        </Card>
      )}
    </>
  );
}

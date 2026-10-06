import React, { useEffect } from 'react';
import { useApi } from '../../hooks/useApi';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useNavigate } from '../../NavigationContext';
import { useFeatures } from '../../contexts/FeaturesContext';

interface BotStatus { connected: boolean; channel: string | null }
interface ObsStatus { connected: boolean }
interface SourceInfo { source: 'notion' | 'worldbuilder'; world?: string | null; error?: string; message?: string }

type Tone = 'ok' | 'off' | 'bad';

// The three connections, always in view at the bottom of the sidebar.
// Green: in place. Red: chosen but not reachable. Grey: not set up.
export default function ConnectionMarks() {
  const go = useNavigate();
  const { worldbuilder } = useFeatures();
  const { data: bot, refetch: refetchBot } = useApi<BotStatus>('/settings/bot-status');
  const { data: obs, refetch: refetchObs } = useApi<ObsStatus>('/obs/status');
  const { data: world, refetch: refetchWorld } = useApi<SourceInfo>('/characters/source');

  useWebSocket((event) => {
    if (event === 'bot-status') refetchBot();
    if (event === 'obs-status') refetchObs();
    if (event === 'entry-changed' || event === 'follow-changed') refetchWorld();
  });

  // The Worldbuilder sends no push; look every half minute.
  useEffect(() => {
    const timer = setInterval(() => refetchWorld(), 30_000);
    return () => clearInterval(timer);
  }, [refetchWorld]);

  const worldTone: Tone = !world ? 'off' : world.source !== 'worldbuilder' ? 'off' : world.error ? 'bad' : 'ok';
  const marks: Array<{ key: string; label: string; detail: string; tone: Tone; onClick: () => void }> = [
    {
      key: 'twitch',
      label: 'Twitch',
      detail: bot?.connected ? `Bot im Kanal #${bot.channel}` : 'nicht verbunden',
      tone: bot?.connected ? 'ok' : 'bad',
      onClick: () => go({ area: 'settings', subTab: 'verbindungen' }),
    },
    {
      key: 'obs',
      label: 'OBS',
      detail: obs?.connected ? 'verbunden' : 'nicht verbunden',
      tone: obs?.connected ? 'ok' : 'bad',
      onClick: () => go({ area: 'settings', subTab: 'verbindungen' }),
    },
    {
      key: 'world',
      label: 'Worldbuilder',
      detail: !world ? '…'
        : world.source !== 'worldbuilder' ? 'Notion ist die Quelle'
        : world.error ? 'nicht erreichbar'
        : world.world ? `„${world.world}“` : 'erreichbar',
      tone: worldTone,
      onClick: () => go({ area: 'stream' }),
    },
  ];

  // Nils's Worldbuilder: a mark only on a machine where it is set up.
  const shown = marks.filter((m) => m.key !== 'world' || worldbuilder);

  return (
    <div className="shell-marks" aria-label="Verbindungen">
      {shown.map((m) => (
        <button key={m.key} type="button" className={`shell-mark ${m.tone}`} onClick={m.onClick} title={`${m.label}: ${m.detail}`}>
          <span className="shell-mark-dot" aria-hidden="true" />
          <span className="shell-mark-text">
            <span className="shell-mark-label">{m.label}</span>
            <span className="shell-mark-detail">{m.detail}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

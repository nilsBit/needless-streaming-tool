import React, { useEffect } from 'react';
import { useApi } from '../../hooks/useApi';
import { BotStatus } from '../../../../shared/types';

export default function DoneStep({ onFinish }: { onFinish: () => void }) {
  const { data: botStatus, refetch: refetchBot } = useApi<BotStatus>('/settings/bot-status');
  const { data: obsStatus, refetch: refetchObs } = useApi<{ connected: boolean }>('/obs/status');
  const { data: notionInfo } = useApi<{ configured: boolean }>('/settings/notion');

  useEffect(() => {
    const interval = setInterval(() => {
      refetchBot();
      refetchObs();
    }, 2000);
    return () => clearInterval(interval);
  }, [refetchBot, refetchObs]);

  const twitchDone = !!botStatus?.connected;
  const obsDone = !!obsStatus?.connected;
  const notionDone = !!notionInfo?.configured;
  const canFinish = twitchDone && obsDone;

  const items = [
    { label: 'Twitch', done: twitchDone, required: true },
    { label: 'OBS', done: obsDone, required: true },
    { label: 'Notion (optional)', done: notionDone, required: false },
  ];

  return (
    <div className="onboarding-step done-step">
      <div className="welcome-icon">{canFinish ? '🎉' : '⚠️'}</div>
      <h2>{canFinish ? 'Alles bereit!' : 'Fast fertig...'}</h2>

      <div className="done-checklist">
        {items.map((item) => (
          <div key={item.label} className={`done-item ${!item.done && item.required ? 'done-item-missing' : ''}`}>
            <span className="done-icon">{item.done ? '✅' : item.required ? '❌' : '⬜'}</span>
            <span>{item.label}</span>
          </div>
        ))}
      </div>

      {!canFinish && (
        <p className="step-warning">
          Twitch und OBS muessen verbunden sein. Gehe zurueck und richte sie ein.
        </p>
      )}

      <p className="step-hint">
        Du kannst alles jederzeit in den Settings aendern oder den Wizard unter Settings erneut starten.
      </p>

      <button className="btn-primary btn-large" onClick={onFinish} disabled={!canFinish}>
        Los geht's!
      </button>
    </div>
  );
}

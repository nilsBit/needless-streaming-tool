import React from 'react';
import { useApi } from '../../hooks/useApi';
import { BotStatus } from '../../../../shared/types';

export default function DoneStep({ onFinish }: { onFinish: () => void }) {
  const { data: botStatus } = useApi<BotStatus>('/settings/bot-status');
  const { data: obsStatus } = useApi<{ connected: boolean }>('/obs/status');
  const { data: notionInfo } = useApi<{ configured: boolean }>('/settings/notion');

  const items = [
    { label: 'Twitch', done: botStatus?.connected },
    { label: 'OBS', done: obsStatus?.connected },
    { label: 'Notion', done: notionInfo?.configured },
  ];

  return (
    <div className="onboarding-step done-step">
      <div className="welcome-icon">🎉</div>
      <h2>Alles bereit!</h2>

      <div className="done-checklist">
        {items.map((item) => (
          <div key={item.label} className="done-item">
            <span className="done-icon">{item.done ? '✅' : '⬜'}</span>
            <span>{item.label}</span>
          </div>
        ))}
      </div>

      <p className="step-hint">
        Du kannst alles jederzeit in den Settings aendern oder den Wizard unter Settings erneut starten.
      </p>

      <button className="btn-primary btn-large" onClick={onFinish}>Los geht's!</button>
    </div>
  );
}

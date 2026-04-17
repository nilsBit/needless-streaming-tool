import React, { useEffect } from 'react';
import { useApi } from '../../hooks/useApi';
import { BotStatus } from '../../../../shared/types';
import { useTranslation } from '../../i18n/LanguageContext';

export default function DoneStep({ onFinish }: { onFinish: () => void }) {
  const { t } = useTranslation();
  const { data: botStatus, refetch: refetchBot } = useApi<BotStatus>('/settings/bot-status');
  const { data: obsStatus, refetch: refetchObs } = useApi<{ connected: boolean }>('/obs/status');
  const { data: notionInfo } = useApi<{ configured: boolean }>('/settings/notion');

  const twitchDone = !!botStatus?.connected;
  const obsDone = !!obsStatus?.connected;

  useEffect(() => {
    if (twitchDone && obsDone) return;
    const interval = setInterval(() => {
      refetchBot();
      refetchObs();
    }, 2000);
    return () => clearInterval(interval);
  }, [refetchBot, refetchObs, twitchDone, obsDone]);
  const notionDone = !!notionInfo?.configured;
  const canFinish = twitchDone && obsDone;

  const items = [
    { label: 'Twitch', done: twitchDone, required: true },
    { label: 'OBS', done: obsDone, required: true },
    { label: `Notion (${t('done.optional')})`, done: notionDone, required: false },
  ];

  return (
    <div className="onboarding-step done-step">
      <div className="welcome-icon">{canFinish ? '🎉' : '⚠️'}</div>
      <h2>{canFinish ? t('done.title_ready') : t('done.title_almost')}</h2>

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
          {t('done.warning')}
        </p>
      )}

      <p className="step-hint">
        {t('done.hint')}
      </p>

      <button className="btn-primary btn-large" onClick={onFinish} disabled={!canFinish}>
        {t('onboarding.finish')}
      </button>
    </div>
  );
}

import React, { useEffect } from 'react';
import { useApi, apiFetch } from '../../hooks/useApi';
import { useWebSocket } from '../../hooks/useWebSocket';
import { BotStatus } from '../../../../shared/types';
import { useTranslation } from '../../i18n/LanguageContext';
import { useToast } from '../../i18n/ToastContext';

export default function TwitchStep({ onReady }: { onReady: (ready: boolean) => void }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: botStatus, refetch: refetchBot } = useApi<BotStatus>('/settings/bot-status');

  useWebSocket((event) => {
    if (event === 'bot-status') refetchBot();
  });

  const connected = !!botStatus?.connected;
  useEffect(() => {
    onReady(connected);
  }, [connected, onReady]);

  const connectTwitch = async () => {
    try {
      await apiFetch('/auth/twitch/open', { method: 'POST' });
    } catch {
      toast.error(t('onboarding.connect_failed'));
    }
  };

  return (
    <div className="onboarding-step">
      <h2>{t('twitch.title')}</h2>
      <p className="step-desc">{t('twitch.desc')}</p>

      <div className="onboarding-status">
        <span className="status-dot" style={{ background: botStatus?.connected ? '#2ecc71' : '#e74c3c' }} aria-hidden="true" />
        <span>{botStatus?.connected ? `${t('settings.connected_to')} #${botStatus.channel}` : t('settings.not_connected')}</span>
      </div>

      {!botStatus?.connected && (
        <button className="btn-primary" onClick={connectTwitch}>
          {t('twitch.connect_btn')}
        </button>
      )}

      {botStatus?.connected && (
        <div className="onboarding-check">{t('twitch.connected')}</div>
      )}
    </div>
  );
}

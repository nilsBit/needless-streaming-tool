import React, { useState } from 'react';
import { useApi, apiFetch, getServerPort } from '../../hooks/useApi';
import { useWebSocket } from '../../hooks/useWebSocket';
import { BotStatus } from '../../../../shared/types';
import { useTranslation } from '../../i18n/LanguageContext';
import { useToast } from '../../i18n/ToastContext';

interface ClientIdResponse {
  configured: boolean;
  client_id_preview: string | null;
}

export default function TwitchStep() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: botStatus, refetch: refetchBot } = useApi<BotStatus>('/settings/bot-status');
  const { data: clientIdInfo, refetch: refetchClientId } = useApi<ClientIdResponse>('/auth/twitch/client-id');
  const [clientId, setClientId] = useState('');
  const [saving, setSaving] = useState(false);

  useWebSocket((event) => {
    if (event === 'bot-status') { refetchBot(); refetchClientId(); }
  });

  const saveClientId = async () => {
    if (!clientId.trim()) return;
    setSaving(true);
    try {
      await apiFetch('/auth/twitch/client-id', {
        method: 'POST',
        body: JSON.stringify({ client_id: clientId.trim() }),
      });
      setClientId('');
      refetchClientId();
    } catch {
      toast.error(t('onboarding.save_failed'));
    }
    setSaving(false);
  };

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

      {!clientIdInfo?.configured ? (
        <>
          <div className="onboarding-steps-list">
            <div className="setup-instruction">
              <span className="instruction-number">1</span>
              <span>{t('twitch.step1')}</span>
            </div>
            <div className="setup-instruction">
              <span className="instruction-number">2</span>
              <span>{t('twitch.step2')}</span>
            </div>
            <div className="setup-instruction">
              <span className="instruction-number">3</span>
              <span>{t('twitch.step3')}</span>
            </div>
          </div>

          <div className="onboarding-info-box">
            <div className="info-row"><span className="info-label">Name:</span><span>{t('twitch.name_hint')}</span></div>
            <div className="info-row"><span className="info-label">OAuth Redirect URL:</span><span className="info-mono">http://localhost:{getServerPort()}/auth/twitch/callback</span></div>
            <div className="info-row"><span className="info-label">Category:</span><span>{t('twitch.category')}</span></div>
          </div>

          <div className="onboarding-steps-list">
            <div className="setup-instruction">
              <span className="instruction-number">4</span>
              <span>{t('twitch.step4')}</span>
            </div>
            <div className="setup-instruction">
              <span className="instruction-number">5</span>
              <span>{t('twitch.step5')}</span>
            </div>
          </div>

          <div className="input-row">
            <input
              type="text"
              placeholder={t('twitch.client_id_placeholder')}
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveClientId()}
            />
            <button onClick={saveClientId} disabled={!clientId.trim() || saving}>
              {saving ? t('onboarding.loading') : t('settings.save')}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="onboarding-check">{t('twitch.client_id_saved')}: {clientIdInfo.client_id_preview}</div>
          {!botStatus?.connected && (
            <>
              <p className="step-desc">{t('twitch.connect_desc')}</p>
              <button className="btn-primary" onClick={connectTwitch}>
                {t('twitch.connect_btn')}
              </button>
            </>
          )}
          {botStatus?.connected && (
            <div className="onboarding-check">{t('twitch.connected')}</div>
          )}
        </>
      )}
    </div>
  );
}

import React, { useState } from 'react';
import { useApi, apiPost } from '../../hooks/useApi';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useTranslation } from '../../i18n/LanguageContext';
import { useToast } from '../../i18n/ToastContext';

export default function ObsStep() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: obsStatus, refetch: refetchStatus } = useApi<{ connected: boolean }>('/obs/status');
  const { data: obsConfig, refetch: refetchConfig } = useApi<{ configured: boolean }>('/obs/config');
  const [host, setHost] = useState('localhost');
  const [port, setPort] = useState('4455');
  const [password, setPassword] = useState('');
  const [connecting, setConnecting] = useState(false);

  useWebSocket((event) => {
    if (event === 'obs-status') refetchStatus();
  });

  const saveAndConnect = async () => {
    setConnecting(true);
    try {
      await apiPost('/obs/config', {
        host: host.trim() || 'localhost',
        port: parseInt(port) || 4455,
        password,
      });
      refetchConfig();
      await apiPost('/obs/connect', {});
      refetchStatus();
    } catch {
      toast.error(t('onboarding.connect_failed'));
    }
    setConnecting(false);
  };

  return (
    <div className="onboarding-step">
      <h2>{t('obs.title')}</h2>
      <p className="step-desc">{t('obs.desc')}</p>

      <div className="onboarding-status">
        <span className="status-dot" style={{ background: obsStatus?.connected ? '#2ecc71' : '#e74c3c' }} aria-hidden="true" />
        <span>{obsStatus?.connected ? t('settings.obs_connected') : t('settings.obs_not_connected')}</span>
      </div>

      {!obsStatus?.connected && (
        <>
          <div className="onboarding-steps-list">
            <div className="setup-instruction">
              <span className="instruction-number">1</span>
              <span>{t('obs.step1')}</span>
            </div>
            <div className="setup-instruction">
              <span className="instruction-number">2</span>
              <span>{t('obs.step2')}</span>
            </div>
            <div className="setup-instruction">
              <span className="instruction-number">3</span>
              <span>{t('obs.step3')}</span>
            </div>
            <div className="setup-instruction">
              <span className="instruction-number">4</span>
              <span>{t('obs.step4')}</span>
            </div>
          </div>

          <p className="step-desc" style={{ marginTop: '8px' }}>{t('obs.connection_data')}</p>

          <div className="onboarding-fields">
            <div className="input-row">
              <input type="text" placeholder={t('obs.host_placeholder')} value={host} onChange={(e) => setHost(e.target.value)} style={{ flex: 2 }} />
              <input type="number" placeholder={t('obs.port_placeholder')} value={port} onChange={(e) => setPort(e.target.value)} style={{ flex: 1 }} min="1" max="65535" />
            </div>
            <div className="input-row">
              <input type="password" placeholder={t('obs.password_hint')} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <button className="btn-primary" onClick={saveAndConnect} disabled={connecting}>
              {connecting ? t('onboarding.loading') : t('obs.connect_btn')}
            </button>
          </div>

          <p className="step-hint">{t('obs.tip')}</p>
        </>
      )}

      {obsStatus?.connected && (
        <div className="onboarding-check">{t('obs.connected')}</div>
      )}
    </div>
  );
}

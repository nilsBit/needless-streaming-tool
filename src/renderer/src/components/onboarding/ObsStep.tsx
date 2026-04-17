import React, { useState, useEffect } from 'react';
import { useApi, apiPost } from '../../hooks/useApi';
import { useTranslation } from '../../i18n/LanguageContext';

export default function ObsStep() {
  const { t } = useTranslation();
  const { data: obsStatus, refetch: refetchStatus } = useApi<{ connected: boolean }>('/obs/status');
  const { data: obsConfig, refetch: refetchConfig } = useApi<{ configured: boolean }>('/obs/config');
  const [host, setHost] = useState('localhost');
  const [port, setPort] = useState('4455');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (obsStatus?.connected) return;
    const interval = setInterval(refetchStatus, 2000);
    return () => clearInterval(interval);
  }, [refetchStatus, obsStatus?.connected]);

  const saveAndConnect = async () => {
    await apiPost('/obs/config', {
      host: host.trim() || 'localhost',
      port: parseInt(port) || 4455,
      password,
    });
    refetchConfig();
    await apiPost('/obs/connect', {});
    refetchStatus();
  };

  return (
    <div className="onboarding-step">
      <h2>{t('obs.title')}</h2>
      <p className="step-desc">{t('obs.desc')}</p>

      <div className="onboarding-status">
        <span className="status-dot" style={{ background: obsStatus?.connected ? '#2ecc71' : '#e74c3c' }} />
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
              <input type="text" placeholder="Host (localhost)" value={host} onChange={(e) => setHost(e.target.value)} style={{ flex: 2 }} />
              <input type="text" placeholder="Port (4455)" value={port} onChange={(e) => setPort(e.target.value)} style={{ flex: 1 }} />
            </div>
            <div className="input-row">
              <input type="password" placeholder={t('obs.password_hint')} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <button className="btn-primary" onClick={saveAndConnect}>{t('obs.connect_btn')}</button>
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

import React, { useState } from 'react';
import { useApi, apiPost, getApiToken } from '../../hooks/useApi';
import { useTranslation } from '../../i18n/LanguageContext';
import { useToast } from '../../i18n/ToastContext';
import CopyButton from '../CopyButton';

export default function StreamDeckStep() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: fixedTokenData } = useApi<{ token: string | null }>('/settings/api-token');
  const sessionToken = getApiToken();
  const token = fixedTokenData?.token || sessionToken || null;

  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(false);

  const installPlugin = async () => {
    setInstalling(true);
    try {
      await apiPost('/settings/streamdeck/install', {});
      setInstalled(true);
    } catch {
      toast.error(t('onboarding.install_failed'));
    }
    setInstalling(false);
  };

  return (
    <div className="onboarding-step">
      <h2>{t('streamdeck.title')}</h2>
      <p className="step-desc">
        {t('streamdeck.desc')}
      </p>

      <div className="onboarding-steps-list">
        <div className="setup-instruction">
          <span className="instruction-number">1</span>
          <div style={{ flex: 1 }}>
            <span>{t('streamdeck.step1')}</span>
            <button
              className="btn-install-inline"
              onClick={installPlugin}
              disabled={installing || installed}
            >
              {installed ? t('streamdeck.installed') : installing ? t('streamdeck.installing') : t('streamdeck.install_btn')}
            </button>
          </div>
        </div>
        <div className="setup-instruction">
          <span className="instruction-number">2</span>
          <span>{t('streamdeck.step2')}</span>
        </div>
        <div className="setup-instruction">
          <span className="instruction-number">3</span>
          <div style={{ flex: 1 }}>
            <span>{t('streamdeck.step3')}</span>
            {token ? (
              <div className="token-display-onboarding" style={{ marginTop: '8px' }}>
                <code>{token.substring(0, 16)}...{token.substring(token.length - 8)}</code>
                <CopyButton text={token} />
              </div>
            ) : (
              <p className="step-hint" style={{ marginTop: '8px' }}>{t('settings.token_loading')}</p>
            )}
          </div>
        </div>
      </div>

      <p className="step-hint">
        {t('streamdeck.no_deck')}
      </p>
    </div>
  );
}

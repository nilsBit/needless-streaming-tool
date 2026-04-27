import React from 'react';
import { useApi } from '../../hooks/useApi';
import { useTranslation } from '../../i18n/LanguageContext';
import CopyButton from '../CopyButton';

interface OverlayInfo {
  name: string;
  url: string;
}

export default function OverlaysStep() {
  const { t } = useTranslation();
  const { data: overlays, loading } = useApi<OverlayInfo[]>('/overlays/builtin');

  return (
    <div className="onboarding-step">
      <h2>{t('overlays.title')}</h2>
      <p className="step-desc">{t('overlays.desc')}</p>

      <div className="onboarding-steps-list">
        <div className="setup-instruction">
          <span className="instruction-number">1</span>
          <span>{t('overlays.step1')}</span>
        </div>
        <div className="setup-instruction">
          <span className="instruction-number">2</span>
          <span>{t('overlays.step2')}</span>
        </div>
        <div className="setup-instruction">
          <span className="instruction-number">3</span>
          <span>{t('overlays.step3')}</span>
        </div>
        <div className="setup-instruction">
          <span className="instruction-number">4</span>
          <span>{t('overlays.step4')}</span>
        </div>
      </div>

      <p className="step-desc" style={{ marginTop: '12px' }}>{t('overlays.available')}</p>

      {loading ? (
        <p className="step-hint">{t('onboarding.loading')}</p>
      ) : (
        <div className="overlay-list-onboarding">
          {overlays?.map((o) => (
            <div key={o.name} className="overlay-item-onboarding">
              <span>{o.name}</span>
              <CopyButton text={o.url} />
            </div>
          ))}
        </div>
      )}

      <p className="step-hint">{t('overlays.hint')}</p>
    </div>
  );
}

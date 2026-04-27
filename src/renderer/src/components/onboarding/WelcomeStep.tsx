import React from 'react';
import { useTranslation } from '../../i18n/LanguageContext';

export default function WelcomeStep({ onNext }: { onNext: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="onboarding-step welcome-step">
      <div className="welcome-icon" role="img" aria-label="Welcome">🔬</div>
      <h1>{t('onboarding.welcome_title')}</h1>
      <p className="welcome-text">
        {t('onboarding.welcome_text')}
      </p>
      <p className="welcome-sub">
        {t('onboarding.welcome_sub')}
      </p>
      <button className="btn-primary" onClick={onNext}>{t('onboarding.start_setup')}</button>
    </div>
  );
}

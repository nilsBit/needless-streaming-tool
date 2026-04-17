import React from 'react';
import { useTranslation } from '../../i18n/LanguageContext';

export default function LanguageStep({ onNext }: { onNext: () => void }) {
  const { setLang } = useTranslation();

  const select = (lang: 'de' | 'en') => {
    setLang(lang);
    onNext();
  };

  return (
    <div className="onboarding-step welcome-step">
      <div className="welcome-icon">🌐</div>
      <h1>Sprache / Language</h1>
      <p className="welcome-text">Wähle deine Sprache. / Choose your language.</p>
      <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginTop: '24px' }}>
        <button className="btn-primary" onClick={() => select('de')} style={{ fontSize: '18px', padding: '16px 32px' }}>
          🇩🇪 Deutsch
        </button>
        <button className="btn-primary" onClick={() => select('en')} style={{ fontSize: '18px', padding: '16px 32px' }}>
          🇬🇧 English
        </button>
      </div>
    </div>
  );
}

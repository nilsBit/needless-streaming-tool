import React, { useState } from 'react';
import { apiPost } from '../hooks/useApi';
import WelcomeStep from './onboarding/WelcomeStep';
import TwitchStep from './onboarding/TwitchStep';
import ObsStep from './onboarding/ObsStep';
import NotionStep from './onboarding/NotionStep';
import OverlaysStep from './onboarding/OverlaysStep';
import StreamDeckStep from './onboarding/StreamDeckStep';
import DoneStep from './onboarding/DoneStep';
import LanguageStep from './onboarding/LanguageStep';
import { useTranslation } from '../i18n/LanguageContext';

const STEPS = ['Language', 'Welcome', 'Twitch', 'OBS', 'Notion', 'Overlays', 'Stream Deck', 'Fertig'];
const SKIPPABLE = new Set([4, 6]); // Notion, Stream Deck (shifted +1)

export default function OnboardingWizard({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const { t } = useTranslation();

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const finish = async () => {
    await apiPost('/settings/onboarding', { completed: true });
    onComplete();
  };

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-card">
        {/* Step indicator */}
        {step > 0 && (
          <div className="step-indicators">
            {STEPS.map((label, i) => (
              <div
                key={label}
                className={`step-dot ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}
                title={label}
              />
            ))}
          </div>
        )}

        {/* Step content */}
        <div className="step-content">
          {step === 0 && <LanguageStep onNext={next} />}
          {step === 1 && <WelcomeStep onNext={next} />}
          {step === 2 && <TwitchStep />}
          {step === 3 && <ObsStep />}
          {step === 4 && <NotionStep />}
          {step === 5 && <OverlaysStep />}
          {step === 6 && <StreamDeckStep />}
          {step === 7 && <DoneStep onFinish={finish} />}
        </div>

        {/* Navigation */}
        {step > 0 && (
          <div className="step-nav">
            <button className="btn-back" onClick={back}>{t('onboarding.back')}</button>
            {step < STEPS.length - 1 && (
              <div className="step-nav-right">
                {SKIPPABLE.has(step) && (
                  <button className="btn-skip" onClick={next}>{t('onboarding.skip')}</button>
                )}
                <button className="btn-primary" onClick={next}>{t('onboarding.next')}</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

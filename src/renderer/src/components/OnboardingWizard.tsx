import React, { useState, useCallback } from 'react';
import { apiPost } from '../hooks/useApi';
import { useToast } from '../i18n/ToastContext';
import WelcomeStep from './onboarding/WelcomeStep';
import TwitchStep from './onboarding/TwitchStep';
import ObsStep from './onboarding/ObsStep';
import NotionStep from './onboarding/NotionStep';
import OverlaysStep from './onboarding/OverlaysStep';
import StreamDeckStep from './onboarding/StreamDeckStep';
import DoneStep from './onboarding/DoneStep';
import LanguageStep from './onboarding/LanguageStep';
import ProfileStep from './onboarding/ProfileStep';
import { useTranslation } from '../i18n/LanguageContext';

const STEP_KEYS = [
  'onboarding.step.language', 'onboarding.step.profile', 'onboarding.step.welcome',
  'onboarding.step.twitch', 'onboarding.step.obs', 'onboarding.step.notion',
  'onboarding.step.overlays', 'onboarding.step.streamdeck', 'onboarding.step.done',
] as const;
const SKIPPABLE = new Set([5, 7]); // Notion, Stream Deck
const READY_REQUIRED = new Set([3, 4]); // Twitch, OBS

export default function OnboardingWizard({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const [stepReady, setStepReady] = useState(false);
  const { t } = useTranslation();
  const { toast } = useToast();

  const onStepReady = useCallback((ready: boolean) => setStepReady(ready), []);

  const goTo = (target: number) => { setStepReady(false); setStep(target); };
  const next = () => goTo(Math.min(step + 1, STEP_KEYS.length - 1));
  const back = () => goTo(Math.max(step - 1, 0));

  const finish = async () => {
    try {
      await apiPost('/settings/onboarding', { completed: true });
      onComplete();
    } catch {
      toast.error(t('onboarding.save_failed'));
    }
  };

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-card">
        {/* Step indicator */}
        {step > 0 && (
          <div className="step-indicators">
            {STEP_KEYS.map((key, i) => (
              <div
                key={key}
                className={`step-dot ${i === step ? 'active' : ''} ${i < step ? 'done clickable' : ''}`}
                title={t(key)}
                onClick={i < step ? () => goTo(i) : undefined}
              />
            ))}
          </div>
        )}

        {/* Step content */}
        <div className="step-content">
          {step === 0 && <LanguageStep onNext={next} />}
          {step === 1 && <ProfileStep />}
          {step === 2 && <WelcomeStep />}
          {step === 3 && <TwitchStep onReady={onStepReady} />}
          {step === 4 && <ObsStep onReady={onStepReady} />}
          {step === 5 && <NotionStep onComplete={next} />}
          {step === 6 && <OverlaysStep />}
          {step === 7 && <StreamDeckStep />}
          {step === 8 && <DoneStep onFinish={finish} />}
        </div>

        {/* Navigation */}
        {step > 0 && (
          <div className="step-nav">
            <button className="btn-back" onClick={back}>{t('onboarding.back')}</button>
            {step < STEP_KEYS.length - 1 && (
              <div className="step-nav-right">
                {SKIPPABLE.has(step) && (
                  <button className="btn-skip" onClick={next}>{t('onboarding.skip')}</button>
                )}
                <button className="btn-primary" onClick={next} disabled={READY_REQUIRED.has(step) && !stepReady}>{t('onboarding.next')}</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

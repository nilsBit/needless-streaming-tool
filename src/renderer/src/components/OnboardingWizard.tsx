import React, { useState } from 'react';
import { apiPost } from '../hooks/useApi';
import WelcomeStep from './onboarding/WelcomeStep';
import TwitchStep from './onboarding/TwitchStep';
import ObsStep from './onboarding/ObsStep';
import NotionStep from './onboarding/NotionStep';
import OverlaysStep from './onboarding/OverlaysStep';
import StreamDeckStep from './onboarding/StreamDeckStep';
import DoneStep from './onboarding/DoneStep';

const STEPS = ['Welcome', 'Twitch', 'OBS', 'Notion', 'Overlays', 'Stream Deck', 'Fertig'];
const SKIPPABLE = new Set([3, 5]); // Notion, Stream Deck

export default function OnboardingWizard({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);

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
          {step === 0 && <WelcomeStep onNext={next} />}
          {step === 1 && <TwitchStep />}
          {step === 2 && <ObsStep />}
          {step === 3 && <NotionStep />}
          {step === 4 && <OverlaysStep />}
          {step === 5 && <StreamDeckStep />}
          {step === 6 && <DoneStep onFinish={finish} />}
        </div>

        {/* Navigation */}
        {step > 0 && (
          <div className="step-nav">
            <button className="btn-back" onClick={back}>Zurück</button>
            {step < STEPS.length - 1 && (
              <div className="step-nav-right">
                {SKIPPABLE.has(step) && (
                  <button className="btn-skip" onClick={next}>Überspringen</button>
                )}
                <button className="btn-primary" onClick={next}>Weiter</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { useFeatures } from '../contexts/FeaturesContext';
import { useToast } from '../contexts/ToastContext';
import { connectionsNeeded, CONNECTION_LABELS, PERSONAL_FEATURES, type FeatureKey } from '../../../shared/features';
import FeaturesStep from '../components/setup/FeaturesStep';
import ConnectionsStep from '../components/setup/ConnectionsStep';
import ObsStep from '../components/setup/ObsStep';
import FinishStep from '../components/setup/FinishStep';
import logoSvg from '../assets/logo.svg';

// The setup: four steps in place of the sidebar — on first start, and again
// from Einstellungen → Programm → "Was dein Stream kann". Every step can be
// skipped; everything here is reachable later in the settings.
//
// Spec: docs/superpowers/specs/2026-10-06-einrichtung-design.md

const STEPS = [
  { n: 1, xp: '+20 EP', label: 'Können', sub: 'Was dein Stream kann', title: 'Was soll dein Stream können?', sentence: 'Wähle aus, was du brauchst. Das Tool zeigt dir danach nur das – und sagt dir unten, was dafür verbunden werden muss. Ändern geht jederzeit.' },
  { n: 2, xp: '+40 EP je Verbindung', label: 'Verbinden', sub: 'Twitch, OBS und mehr', title: 'Verbinden', sentence: 'Für deine Auswahl braucht das Tool diese Verbindungen. Was steht, wird grün. Was du jetzt nicht hast, holst du später unter Einstellungen → Verbindungen nach.' },
  { n: 3, xp: '+40 EP', label: 'In OBS einrichten', sub: 'Overlays als Quellen', title: 'In OBS einrichten', sentence: 'Deine Auswahl braucht Browserquellen in OBS. Das Tool legt sie an – du wählst nur die Szene. Was in OBS schon da ist, erkennt es und lässt es in Ruhe.' },
  { n: 4, xp: '', label: 'Fertig', sub: 'Bereit für den Stream', title: 'Bereit für den Stream', sentence: 'Die App zeigt dir jetzt nur, was du gewählt hast. Hier steht, was dein Stream kann, was steht und was noch fehlt.' },
];

export default function SetupPage() {
  const { toast } = useToast();
  const { done, features, defaults, worldbuilder, save, finish, closeSetup } = useFeatures();
  const firstRun = !done;
  const [step, setStep] = useState(1);
  const [picked, setPicked] = useState<Set<string>>(() => new Set<string>(firstRun ? defaults : [...features]));
  const [saving, setSaving] = useState(false);

  const current = STEPS[step - 1];
  const needed = connectionsNeeded(picked);
  const pickedList = [...picked].filter((k) => worldbuilder || !PERSONAL_FEATURES.includes(k as FeatureKey)) as FeatureKey[];

  const toggle = (key: FeatureKey) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const goTo = async (n: number) => {
    if (step === 1 && n > 1) {
      setSaving(true);
      const ok = await save(pickedList);
      setSaving(false);
      if (!ok) { toast.error('Auswahl nicht gespeichert'); return; }
    }
    setStep(n);
  };

  const leave = async () => {
    if (firstRun) await finish();
    else closeSetup();
  };

  const finishUp = async () => {
    await finish();
  };

  // Opened again to change the choice: save it and go back to the app,
  // without walking through the other steps (Nils, 08.10.).
  const saveAndClose = async () => {
    setSaving(true);
    const ok = await save(pickedList);
    setSaving(false);
    if (!ok) { toast.error('Auswahl nicht gespeichert'); return; }
    toast.success('Gespeichert');
    closeSetup();
  };

  return (
    <div className="setup" data-setup-step={step}>
      <nav className="setup-rail" aria-label="Schritte der Einrichtung">
        <img src={logoSvg} alt="NST" className="shell-logo" />
        <p className="setup-rail-title">Deine erste Quest</p>
        {STEPS.map((s) => {
          const state = s.n === step ? 'current' : s.n < step ? 'done' : 'ahead';
          return (
            <button key={s.n} type="button" className={`setup-step ${state}`} aria-current={s.n === step ? 'step' : undefined} onClick={() => goTo(s.n)} disabled={saving}>
              <span className="setup-step-n" aria-hidden="true">
                {state === 'done'
                  ? <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8.5l3.2 3L13 4.5" /></svg>
                  : s.n}
              </span>
              <span className="setup-step-text"><strong>{s.label}</strong><span>{s.n === 1 && step > 1 ? `${pickedList.length} ${pickedList.length === 1 ? 'Funktion' : 'Funktionen'} gewählt` : s.sub}</span>{s.xp && <span className="setup-step-xp">{s.xp}</span>}</span>
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        <p className="setup-rail-hint">Jeder Schritt lässt sich überspringen. Danach geht es im Bereich „Quests“ weiter – mit genau dem, was du gewählt hast.</p>
      </nav>

      <div className="setup-page">
        <header className="setup-head">
          <p className="setup-eyebrow">Etappe {step} von 4</p>
          <h1>{current.title}</h1>
          <p>{current.sentence}</p>
        </header>

        <main className="setup-body">
          {step === 1 && <FeaturesStep picked={picked} onToggle={toggle} worldbuilder={worldbuilder} />}
          {step === 2 && <ConnectionsStep needed={needed} />}
          {step === 3 && <ObsStep picked={picked} />}
          {step === 4 && <FinishStep picked={picked} />}
        </main>

        <footer className="setup-foot">
          <p className="setup-foot-text">
            {step === 1 && <><strong>{pickedList.length}</strong> ausgewählt · dafür brauchst du <strong>{needed.length ? needed.map((n) => CONNECTION_LABELS[n]).join(' · ') : 'nichts weiter'}</strong></>}
            {step === 2 && 'Jede Verbindung ist ein Kasten. Was steht, wird grün.'}
            {step === 3 && 'Was hier liegt, siehst du später unter Overlays & Alerts mit „in OBS“.'}
            {step === 4 && <>Ändern geht jederzeit unter <strong>Einstellungen → Programm → Was dein Stream kann</strong>.</>}
          </p>
          <div className="setup-foot-actions">
            {/* Past the first step the choice is saved already: leaving closes, it does not undo. */}
            {step < 4 && <button type="button" className="card-link" onClick={leave} disabled={saving}>{firstRun ? 'Später einrichten' : step === 1 ? 'Abbrechen' : 'Schließen'}</button>}
            {step > 1 && <button type="button" className="card-secondary" onClick={() => goTo(step - 1)} disabled={saving}>Zurück</button>}
            {!firstRun && step === 1 && <button type="button" className="card-secondary" onClick={() => goTo(2)} disabled={saving}>Weiter: Verbinden</button>}
            {!firstRun && step === 1
              ? <button type="button" className="card-primary" onClick={saveAndClose} disabled={saving}>{saving ? 'Speichert …' : 'Speichern'}</button>
              : step < 4
                ? <button type="button" className="card-primary" onClick={() => goTo(step + 1)} disabled={saving}>{saving ? 'Speichert …' : `Weiter: ${STEPS[step].label}`}</button>
                : <button type="button" className="card-primary" onClick={finishUp}>Zur App</button>}
          </div>
        </footer>
      </div>
    </div>
  );
}

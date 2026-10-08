import React, { useState } from 'react';
import Dialog from '../ux/Dialog';

// A Quest-Pfad (spec 2026-10-08-quests-design): a guided flow that creates
// something. Stages as points on a path, the current one below, Zurück /
// Weiter, and an end that is celebrated. Each flow that creates something is
// one of these; the forms stay for editing.

export interface PathStep {
  label: string;
  content: React.ReactNode;
  /** Whether Weiter may be pressed; true when absent. */
  ready?: boolean;
}

interface Props {
  title: string;
  /** One line under the title: what this path makes. */
  sentence: string;
  steps: PathStep[];
  /** The last step's button; it creates the thing. False keeps the path open (the caller said why). */
  finishLabel: string;
  onFinish: () => Promise<boolean>;
  /** Shown after onFinish succeeded. */
  done: React.ReactNode;
  onClose: () => void;
  /** Start further in, e.g. a template that already chose the first stage. */
  startAt?: number;
}

export default function QuestPath({ title, sentence, steps, finishLabel, onFinish, done, onClose, startAt = 0 }: Props) {
  const [at, setAt] = useState(Math.min(startAt, steps.length - 1));
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(false);
  const last = at === steps.length - 1;
  const step = steps[at];
  const labels = [...steps.map((s) => s.label), 'Geschafft'];
  const position = finished ? steps.length : at;

  const next = async () => {
    if (!last) { setAt(at + 1); return; }
    setBusy(true);
    const ok = await onFinish();
    setBusy(false);
    if (ok) setFinished(true);
  };

  return (
    <Dialog
      title={title}
      sentence={sentence}
      onClose={onClose}
      width={760}
      footer={finished ? (
        <><span style={{ flex: 1 }} /><button type="button" className="card-secondary" onClick={onClose}>Schließen</button></>
      ) : (
        <>
          <button type="button" className="card-secondary" onClick={() => (at === 0 ? onClose() : setAt(at - 1))} disabled={busy}>{at === 0 ? 'Abbrechen' : 'Zurück'}</button>
          <span style={{ flex: 1 }} />
          <button type="button" className="card-primary" onClick={next} disabled={busy || step.ready === false}>{busy ? 'Einen Moment …' : last ? finishLabel : 'Weiter'}</button>
        </>
      )}
    >
      <ol className="quest-path" aria-label="Etappen">
        {labels.map((label, i) => {
          const state = i < position ? 'past' : i === position ? 'current' : 'ahead';
          return (
            <li key={label} className={`quest-path-node ${state}`} aria-current={state === 'current' ? 'step' : undefined}>
              <span className="quest-path-dot" aria-hidden="true">{state === 'past' ? '✓' : i + 1}</span>
              <span className="quest-path-label">{label}</span>
            </li>
          );
        })}
      </ol>
      <div className="quest-path-body">{finished ? done : step.content}</div>
    </Dialog>
  );
}

/** The celebrated end of a path: what was made, the EP it brought, and what to do now. */
export function PathDone({ title, text, xp, children }: { title: string; text: string; xp: number | null; children?: React.ReactNode }) {
  return (
    <div className="quest-done">
      <span className="quest-done-mark" aria-hidden="true">✓</span>
      <h3 className="quest-done-title">{title}</h3>
      {xp !== null && <span className="quest-done-xp">Quest geschafft · +{xp} EP</span>}
      <p className="quest-done-text">{text}</p>
      {children && <div className="card-row card-wrap" style={{ justifyContent: 'center' }}>{children}</div>}
    </div>
  );
}

/** Big choice cards — a stage picks one of a few, never from a list field. */
export function ChoiceCards<T extends string>({ options, value, onChange, label }: {
  options: Array<{ value: T; title: string; text: string; icon?: string }>;
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="choice-cards" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} className={`choice-card ${o.value === value ? 'on' : ''}`} onClick={() => onChange(o.value)}>
          {o.icon && <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={o.icon} /></svg>}
          <span className="choice-card-title">{o.title}</span>
          <span className="choice-card-text">{o.text}</span>
        </button>
      ))}
    </div>
  );
}

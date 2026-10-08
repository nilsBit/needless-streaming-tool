import React from 'react';

// The three steps above the Punkte and Kanalpunkte pages (design B, 08.10.):
// how the thing works, and where the streamer stands in it. A step that
// waits for something is marked in the accent.

export interface Step {
  title: string;
  text: string;
  /** What stands now: "3 angelegt", "Wartet auf Schritt 2". */
  state: string;
  done: boolean;
  /** A button inside the step, when there is one thing to do. */
  action?: { label: string; onClick: () => void };
}

export default function RewardSteps({ steps, label }: { steps: Step[]; label: string }) {
  return (
    <ol className="reward-steps" aria-label={label}>
      {steps.map((s, i) => (
        <li key={s.title} className={`reward-step ${s.done ? 'done' : 'waiting'}`}>
          <div className="reward-step-head">
            <span className="reward-step-n" aria-hidden="true">{i + 1}</span>
            <span className="reward-step-title">{s.title}</span>
          </div>
          <span className="reward-step-text">{s.text}</span>
          <span className="reward-step-state">{s.state}</span>
          {s.action && <button type="button" className="card-secondary reward-step-action" onClick={s.action.onClick}>{s.action.label}</button>}
        </li>
      ))}
    </ol>
  );
}

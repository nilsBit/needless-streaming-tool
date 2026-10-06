import React from 'react';
import { FEATURE_GROUPS, FEATURES, type FeatureKey } from '../../../../shared/features';
import { CONNECTION_LABELS } from '../../../../shared/features';

interface Props {
  picked: ReadonlySet<string>;
  onToggle: (key: FeatureKey) => void;
  /** Nils's own group shows only where the Worldbuilder is set up. */
  worldbuilder: boolean;
}

// Step 1: "Was soll dein Stream können?" — every feature a card to tick, in
// the four groups the sidebar has, plus "Welt" on this machine.
export default function FeaturesStep({ picked, onToggle, worldbuilder }: Props) {
  const groups = FEATURE_GROUPS.filter((g) => worldbuilder || !g.personal);
  return (
    <div className="feature-groups">
      {groups.map((g) => (
        <section key={g.key} className="feature-group" aria-label={g.label}>
          <div className="feature-group-head">
            <h2>{g.label}</h2>
            <p>{g.sentence}</p>
          </div>
          {FEATURES.filter((f) => f.group === g.key).map((f) => {
            const on = picked.has(f.key);
            const needs = f.needs.map((n) => CONNECTION_LABELS[n]);
            return (
              <button key={f.key} type="button" className={`feature-card ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => onToggle(f.key)} data-feature={f.key}>
                <span className={`feature-box ${on ? 'on' : ''}`} aria-hidden="true">
                  {on && <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8.5l3.2 3L13 4.5" /></svg>}
                </span>
                <span className="feature-text">
                  <strong>{f.label}</strong>
                  <span>{f.sentence}</span>
                  <small>{needs.length ? `braucht ${needs.join(' und ')}` : 'braucht nichts weiter'}</small>
                </span>
              </button>
            );
          })}
        </section>
      ))}
    </div>
  );
}

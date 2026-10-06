import React from 'react';

interface Props {
  title: string;
  sentence: string;
  /** `null`: OBS is out of reach, nothing to say. */
  onScreen: boolean | null;
  children: React.ReactNode;
}

// One card on "Im Stream": name, one sentence, whether its overlay source is
// on in the current OBS scene, then the panel that does the work.
export default function StreamCard({ title, sentence, onScreen, children }: Props) {
  return (
    <section className={`stream-card ${onScreen ? 'on-screen' : ''}`} aria-label={title}>
      <div className="stream-card-head">
        <h2>{title}</h2>
        {onScreen !== null && (
          <span className={`stream-chip ${onScreen ? 'on' : 'off'}`}>{onScreen ? 'in der Szene' : 'nicht in der Szene'}</span>
        )}
      </div>
      <p className="stream-card-sentence">{sentence}</p>
      <div className="stream-card-body">{children}</div>
    </section>
  );
}

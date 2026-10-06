import React from 'react';
import { AREAS, type AreaKey } from '../navigation';

interface Props {
  onNavigate: (area: AreaKey) => void;
}

// Stage 1 of the rebuild: one card per area so everything is findable.
// Stage 2 adds the status marks and the "Bereit für den Stream?" checklist above.
export default function StartPage({ onNavigate }: Props) {
  const areas = AREAS.filter((a) => a.key !== 'start');
  return (
    <div className="start-page">
      <div className="start-cards">
        {areas.map((area) => (
          <section key={area.key} className="start-card" aria-labelledby={`start-${area.key}`}>
            <h2 id={`start-${area.key}`}>{area.label}</h2>
            <p>{area.sentence}</p>
            <p className="start-card-keywords">{area.keywords.join(' · ')}</p>
            <button type="button" onClick={() => onNavigate(area.key)}>Öffnen</button>
          </section>
        ))}
      </div>
    </div>
  );
}

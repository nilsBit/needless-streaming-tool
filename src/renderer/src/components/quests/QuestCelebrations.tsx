import React, { useRef, useState } from 'react';
import { useWebSocket } from '../../hooks/useWebSocket';

// Quests done are celebrated one after another, never all at once (08.10.):
// a card bottom right with the EP, then — for a new stage or a chapter done —
// a short moment of its own. While live, only the card.

interface Done {
  title: string;
  xp: number;
  levelUp: boolean;
  stage: { level: number; name: string; xp: number; next: { name: string; from: number } | null };
  chapter: { n: number; title: string; badge: string } | null;
  onAir: boolean;
}

const CARD_MS = 2600;

export default function QuestCelebrations() {
  const queue = useRef<Done[]>([]);
  // Showing something: set at once, not on the next render — two quests done
  // in one go arrive before React has drawn the first.
  const busy = useRef(false);
  const [card, setCard] = useState<Done | null>(null);
  const [moment, setMoment] = useState<Done | null>(null);

  const showNext = () => {
    const next = queue.current.shift() ?? null;
    busy.current = !!next;
    setCard(next);
    if (!next) return;
    setTimeout(() => {
      if (!next.onAir && (next.levelUp || next.chapter)) { setCard(null); setMoment(next); return; } // busy stays until the moment closes
      showNext();
    }, CARD_MS);
  };

  useWebSocket((event, data) => {
    if (event !== 'quest-completed') return;
    queue.current.push(data as Done);
    if (!busy.current) showNext();
  });

  const closeMoment = () => { setMoment(null); showNext(); };

  return (
    <>
      {card && (
        <div className="quest-card" role="status">
          <span className="quest-card-mark" aria-hidden="true">✓</span>
          <div><strong>Quest geschafft: {card.title}</strong><span className="quest-xp">+{card.xp} EP</span></div>
        </div>
      )}
      {moment && (
        <div className="quest-moment-backdrop">
          <section className="quest-moment" role="dialog" aria-label={moment.levelUp ? 'Neue Stufe' : 'Kapitel geschafft'}>
            {moment.levelUp ? (
              <>
                <span className="quest-moment-ring" aria-hidden="true">{moment.stage.level}</span>
                <span className="quest-kicker">Neue Stufe</span>
                <strong className="quest-moment-title">{moment.stage.name}</strong>
                <p>Du hast {moment.stage.xp} EP.{moment.stage.next ? ` Nächste Stufe: ${moment.stage.next.name} bei ${moment.stage.next.from} EP.` : ''}</p>
              </>
            ) : null}
            {moment.chapter && (
              <>
                <span className="quest-moment-badge" aria-hidden="true">★</span>
                <span className="quest-kicker">Kapitel {moment.chapter.n} geschafft</span>
                <strong className="quest-moment-title">Abzeichen „{moment.chapter.badge}“</strong>
                <p>{moment.chapter.title} – erledigt.</p>
              </>
            )}
            <button type="button" className="card-primary" onClick={closeMoment} autoFocus>Weiter</button>
          </section>
        </div>
      )}
    </>
  );
}

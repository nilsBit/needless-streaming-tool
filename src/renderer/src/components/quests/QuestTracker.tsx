import React, { useEffect, useState } from 'react';
import { useNavigate } from '../../NavigationContext';
import { getActiveQuest, setActiveQuest, startQuest } from './questStart';
import { useQuests, type QuestView } from './useQuests';

// The active quest, always in sight at the bottom of the sidebar (08.10.):
// its title, its steps — the first ticked once you are where it is done —
// and "Los geht's". The active quest is the one last started; otherwise the
// one the tool proposes next.
export default function QuestTracker({ area, subTab }: { area: string; subTab: string | null }) {
  const go = useNavigate();
  const { quests } = useQuests();
  const [stored, setStored] = useState<string | null>(getActiveQuest);

  useEffect(() => {
    const on = (e: Event) => setStored((e as CustomEvent<string | null>).detail);
    window.addEventListener('nst-active-quest', on);
    return () => window.removeEventListener('nst-active-quest', on);
  }, []);

  if (!quests) return null;
  const open = quests.chapters.filter((c) => !c.locked).flatMap((c) => c.quests).filter((q) => !q.completedAt && !q.blockedBy);
  const active: QuestView | null = open.find((q) => q.key === stored) ?? quests.next;
  // A started quest that is done hands over to the next one.
  if (stored && !open.some((q) => q.key === stored)) setTimeout(() => setActiveQuest(null), 0);
  if (!active) return null;

  const there = active.goTo.area === area && (!active.goTo.subTab || active.goTo.subTab === subTab);
  return (
    <section className="quest-tracker" aria-label="Aktive Quest">
      <span className="quest-kicker">Aktive Quest · +{active.xp} EP</span>
      <strong className="quest-tracker-title">{active.title}</strong>
      <ol className="quest-tracker-steps">
        {active.how.map((step, i) => {
          const ticked = i === 0 && there;
          return (
            <li key={step} className={ticked ? 'done' : ''}>
              <span className="quest-tracker-dot" aria-hidden="true">{ticked ? '✓' : i + 1}</span>
              <span>{step}</span>
            </li>
          );
        })}
      </ol>
      <button type="button" className="card-primary" onClick={() => startQuest(active.key, active.goTo, go as never)}>Los geht's</button>
    </section>
  );
}

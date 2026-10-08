import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from '../../NavigationContext';
import { getActiveQuest, setActiveQuest, startQuest } from './questStart';
import { useQuests, type QuestView } from './useQuests';

// The active quest at the bottom of the sidebar (08.10.): folded, one slim
// line with a marker, its title and EP; open, its steps — the first ticked
// once you are where it is done — and "Los geht's". Folded is the default
// ("müssen wir die aktive quest immer anzeigen?"); the choice is kept. A new
// active quest makes the marker pulse once. The active quest is the one last
// started; otherwise the one the tool proposes next.

const OPEN_KEY = 'nst.questTrackerOpen';
const readOpen = () => { try { return localStorage.getItem(OPEN_KEY) === '1'; } catch { return false; } };
export default function QuestTracker({ area, subTab }: { area: string; subTab: string | null }) {
  const go = useNavigate();
  const { quests } = useQuests();
  const [stored, setStored] = useState<string | null>(getActiveQuest);
  const [open, setOpen] = useState(readOpen);
  const [fresh, setFresh] = useState(false);
  const lastKey = useRef<string | null>(null);
  const toggle = () => {
    setOpen((o) => { try { localStorage.setItem(OPEN_KEY, o ? '0' : '1'); } catch { /* kept until reload */ } return !o; });
  };

  useEffect(() => {
    const on = (e: Event) => setStored((e as CustomEvent<string | null>).detail);
    window.addEventListener('nst-active-quest', on);
    return () => window.removeEventListener('nst-active-quest', on);
  }, []);

  const activeKey = quests ? (quests.chapters.filter((c) => !c.locked).flatMap((c) => c.quests).find((q) => !q.completedAt && !q.blockedBy && q.key === stored)?.key ?? quests.next?.key ?? null) : null;
  useEffect(() => {
    if (lastKey.current && activeKey && activeKey !== lastKey.current) {
      setFresh(true);
      const t = setTimeout(() => setFresh(false), 2400);
      lastKey.current = activeKey;
      return () => clearTimeout(t);
    }
    lastKey.current = activeKey;
    return undefined;
  }, [activeKey]);

  if (!quests) return null;
  const openQuests = quests.chapters.filter((c) => !c.locked).flatMap((c) => c.quests).filter((q) => !q.completedAt && !q.blockedBy);
  const active: QuestView | null = openQuests.find((q) => q.key === stored) ?? quests.next;
  // A started quest that is done hands over to the next one.
  if (stored && !openQuests.some((q) => q.key === stored)) setTimeout(() => setActiveQuest(null), 0);
  if (!active) return null;

  const there = active.goTo.area === area && (!active.goTo.subTab || active.goTo.subTab === subTab);
  return (
    <section className={`quest-tracker ${open ? 'open' : ''}`} aria-label="Aktive Quest">
      <button type="button" className="quest-tracker-head" aria-expanded={open} onClick={toggle} title={open ? 'Einklappen' : 'Schritte zeigen'}>
        <span className={`quest-tracker-mark ${fresh ? 'fresh' : ''}`} aria-hidden="true" />
        <span className="quest-tracker-title">{active.title}</span>
        <span className="quest-xp">+{active.xp}</span>
      </button>
      {open && <>
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
      <button type="button" className="card-primary quest-tracker-go" onClick={() => startQuest(active.key, active.goTo, go as never)}>Los geht's</button>
      </>}
    </section>
  );
}

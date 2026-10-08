import React, { useEffect, useState } from 'react';
import { takeSpot } from './questStart';
import { useQuests } from './useQuests';

// Lights up the spot to click for a quest that has no path of its own
// (08.10.): a pulsing ring around it and a bubble beside it with the quest
// and its steps. Gone with "Verstanden", a click on the spot, or the quest
// done.

const TARGETS: Record<string, string> = {
  choose: '[data-card="features"]',
  twitch: '[data-connection="twitch"]',
  obs: '[data-connection="obs"]',
  discord: '[data-connection="discord"]',
  alertSound: '.panel.alerts',
  topics3: 'input[aria-label="Neues Thema"]',
  spin: '[data-quest-target="spin"]',
  moment: '[data-quest-target="moment"]',
  pointTry: '[data-quest-target="pointTry"]',
  published: '.board',
};

interface Spot { key: string; rect: DOMRect | null }

export default function QuestCoach() {
  const { quests } = useQuests();
  const [spot, setSpot] = useState<Spot | null>(null);

  useEffect(() => {
    let el: Element | null = null;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const clear = () => { el?.classList.remove('quest-spot'); el = null; };
    const find = (key: string) => {
      const selector = TARGETS[key];
      const found = selector ? document.querySelector(selector) : null;
      if (!found && selector && tries++ < 20) { timer = setTimeout(() => find(key), 100); return; }
      clear();
      el = found;
      if (el) {
        el.classList.add('quest-spot');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      setSpot({ key, rect: el ? el.getBoundingClientRect() : null });
    };
    const onSpot = () => { const k = takeSpot(); if (k) { tries = 0; find(k); } };
    const onMove = () => setSpot((s) => (s && el ? { ...s, rect: el.getBoundingClientRect() } : s));
    const onClick = (e: MouseEvent) => { if (el && el.contains(e.target as Node)) { clear(); setSpot(null); } };
    window.addEventListener('nst-quest-spot', onSpot);
    window.addEventListener('resize', onMove);
    document.addEventListener('scroll', onMove, true);
    document.addEventListener('click', onClick, true);
    return () => {
      if (timer) clearTimeout(timer);
      clear();
      window.removeEventListener('nst-quest-spot', onSpot);
      window.removeEventListener('resize', onMove);
      document.removeEventListener('scroll', onMove, true);
      document.removeEventListener('click', onClick, true);
    };
  }, []);

  const quest = spot && quests ? quests.chapters.flatMap((c) => c.quests).find((q) => q.key === spot.key) : null;
  if (!spot || !quest || quest.completedAt) return null;

  const r = spot.rect;
  const style: React.CSSProperties = r
    ? { top: Math.min(window.innerHeight - 220, r.bottom + 12), left: Math.max(16, Math.min(window.innerWidth - 380, r.left)) }
    : { bottom: 24, right: 24 };
  const close = () => { document.querySelector('.quest-spot')?.classList.remove('quest-spot'); setSpot(null); };
  return (
    <div className="quest-bubble" role="note" style={style}>
      <strong>Quest „{quest.title}“</strong>
      <ol>{quest.how.map((s) => <li key={s}>{s}</li>)}</ol>
      <button type="button" className="quest-bubble-ok" onClick={close}>Verstanden</button>
    </div>
  );
}

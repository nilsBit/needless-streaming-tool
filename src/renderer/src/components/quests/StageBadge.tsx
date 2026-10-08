import React, { useRef } from 'react';
import { useNavigate } from '../../NavigationContext';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useToast } from '../../contexts/ToastContext';
import { celebrate } from '../ux/celebrate';
import { stageProgress, useQuests } from './useQuests';

// The streamer's stage in the sidebar, under the logo: a ring with the level,
// the stage's name and how far to the next. A click opens the quests. A quest
// done says so in a toast; a new stage makes the ring light up (08.10.).
export default function StageBadge() {
  const go = useNavigate();
  const { toast } = useToast();
  const { quests } = useQuests();
  const ring = useRef<HTMLSpanElement>(null);

  useWebSocket((event, data) => {
    if (event !== 'quest-completed') return;
    const d = data as { title: string; xp: number; levelUp: boolean; stage: { name: string } };
    toast.success(`Quest geschafft: ${d.title} · +${d.xp} EP`);
    if (d.levelUp) {
      toast.success(`Neue Stufe: ${d.stage.name}`);
      celebrate('success', ring.current);
    }
  });

  if (!quests) return null;
  const { stage } = quests;
  const pct = Math.round(stageProgress(stage) * 100);
  return (
    <button type="button" className="stage-badge" onClick={() => go({ area: 'quests' })} aria-label={`Stufe ${stage.level}, ${stage.name} – Quests öffnen`}>
      <span ref={ring} className="stage-ring" aria-hidden="true">{stage.level}</span>
      <span className="stage-text">
        <span className="stage-name">{stage.name}</span>
        <span className="stage-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>
        <span className="stage-hint">{stage.next ? `${stage.next.from - stage.xp} EP bis ${stage.next.name}` : `${stage.xp} EP`}</span>
      </span>
    </button>
  );
}

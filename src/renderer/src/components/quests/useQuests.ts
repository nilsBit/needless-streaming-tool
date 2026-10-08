import { useApi } from '../../hooks/useApi';
import { useWebSocket } from '../../hooks/useWebSocket';

export interface QuestView {
  key: string;
  group: string;
  title: string;
  text: string;
  xp: number;
  goTo: { area: string; subTab?: string };
  completedAt: string | null;
}

export interface QuestOverview {
  stage: { level: number; name: string; xp: number; from: number; next: { name: string; from: number } | null };
  choosing: boolean;
  next: QuestView | null;
  open: QuestView[];
  done: QuestView[];
}

/** The streamer's quests, fresh after every quest done and every change of features. */
export function useQuests() {
  const { data, refetch } = useApi<QuestOverview>('/quests');
  useWebSocket((event) => {
    if (event === 'quest-completed' || event === 'features-changed') refetch();
  });
  return { quests: data, refetch };
}

/** How far into the current stage, 0 to 1. */
export function stageProgress(stage: QuestOverview['stage']): number {
  if (!stage.next) return 1;
  return Math.max(0, Math.min(1, (stage.xp - stage.from) / (stage.next.from - stage.from)));
}

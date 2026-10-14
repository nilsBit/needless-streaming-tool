import React from 'react';
import { useApi, apiPatch, apiPost } from '../../hooks/useApi';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useToast } from '../../contexts/ToastContext';
import type { PanelKey } from '../../panelKeys';

// One card of "Im Stream" in the small window (12.10.): a line of where it
// stands and its one main button. The rest of the card opens below on a tap
// on the name. Each row reads the same routes and events as its full card.

interface Quick {
  line: string;
  action?: { label: string; run: () => Promise<unknown> };
}

interface StreamState { challenge_title: string | null; challenge_status: string; timer_running: number; timer_ends_at?: number | null; timer_paused_left?: number | null; timer_task_by?: string | null }
interface Issue { status: string }
interface Design { status: string; title: string }
interface ActiveVote { active?: boolean; options?: string[] }
interface ProjectView { name: string; kind: 'steps' | 'count' | 'goal'; stand: string; finished: boolean }
interface SongView { song: { title: string; artist?: string } | null }

function useChallenge(): Quick {
  const { data, refetch } = useApi<StreamState>('/stream-state');
  useWebSocket((event) => { if (event === 'stream-state') refetch(); });
  const running = !!data?.challenge_title && data.challenge_status === 'in_progress';
  if (!data?.challenge_title || data.challenge_status === 'idle') return { line: 'Kein Ziel gesetzt' };
  // A reward's countdown holds the place: only "Beenden" fits, "Geschafft" would break it
  if (data.timer_ends_at != null || data.timer_paused_left != null) {
    return {
      line: data.timer_task_by ? `${data.challenge_title} · von ${data.timer_task_by}` : data.challenge_title,
      action: { label: 'Beenden', run: () => apiPost('/stream-state/reward-timer/end', {}) },
    };
  }
  const state = data.challenge_status === 'done' ? ' · geschafft' : data.challenge_status === 'failed' ? ' · nicht geschafft' : '';
  return {
    line: data.challenge_title + state,
    action: running ? { label: 'Geschafft', run: () => apiPatch('/stream-state', { challenge_status: 'done', timer_running: 0 }) } : undefined,
  };
}

function useWheel(): Quick {
  const { data, refetch } = useApi<Issue[]>('/issues');
  useWebSocket((event) => { if (event.startsWith('issue-')) refetch(); });
  const open = (data ?? []).filter((i) => i.status === 'open').length;
  return {
    line: open === 0 ? 'Noch keine Themen' : `${open} ${open === 1 ? 'Thema' : 'Themen'}`,
    action: open > 0 ? { label: 'Drehen', run: () => apiPost('/actions/roulette', {}) } : undefined,
  };
}

function useVote(): Quick {
  const { data: designs, refetch } = useApi<Design[]>('/designs');
  const { data: vote, refetch: refetchVote } = useApi<ActiveVote>('/voting');
  useWebSocket((event) => {
    if (event.startsWith('design-')) refetch();
    if (event.startsWith('design-vote') || event.startsWith('poll-') || event === 'vote-result') refetchVote();
  });
  const active = (designs ?? []).filter((d) => d.status === 'active');
  // As the full card reads it: a vote runs while one is there with options.
  if (vote && vote.active !== false && vote.options) return { line: 'Abstimmung läuft', action: { label: 'Beenden', run: () => apiPost('/voting/end', {}) } };
  return {
    line: active.length === 0 ? 'Noch keine Vorschläge' : `${active.length} ${active.length === 1 ? 'Vorschlag' : 'Vorschläge'}`,
    action: active.length >= 2
      ? { label: 'Starten', run: () => apiPost('/voting/start', { title: 'Abstimmung', options: active.map((d) => d.title), duration: 60 }) }
      : undefined,
  };
}

function useProject(): Quick {
  const { data, refetch } = useApi<{ current: ProjectView | null }>('/projects');
  useWebSocket((event) => { if (event.startsWith('project-')) refetch(); });
  const p = data?.current;
  if (!p) return { line: 'Kein Projekt dran' };
  // A goal's stand is typed in — that happens in the opened card.
  const action = p.finished || p.kind === 'goal' ? undefined
    : { label: p.kind === 'count' ? '+1' : 'Weiter', run: () => apiPost('/projects/current/forward', {}) };
  return { line: `${p.name} · ${p.stand}`, action };
}

function useSong(): Quick {
  const { data, refetch } = useApi<SongView>('/actions/song');
  useWebSocket((event) => { if (event === 'song-update' || event === 'song-clear') refetch(); });
  const song = data?.song;
  return { line: song ? [song.title, song.artist].filter(Boolean).join(' · ') : 'Gerade läuft nichts' };
}

function useWorld(): Quick {
  const { data, refetch } = useApi<{ entry: { title: string; art?: string } | null }>('/entries/active');
  useWebSocket((event) => { if (event === 'entry-changed') refetch(); });
  const entry = data?.entry;
  return { line: entry ? [entry.title, entry.art].filter(Boolean).join(' · ') : 'Kein Eintrag im Overlay' };
}

const QUICK: Partial<Record<PanelKey, () => Quick>> = {
  challenge: useChallenge,
  issues: useWheel,
  designs: useVote,
  progress: useProject,
  song: useSong,
  world: useWorld,
};

const noQuick = (): Quick => ({ line: '' });

interface Props {
  panel: PanelKey;
  title: string;
  /** The card's overlay is in the scene on air. */
  onScreen: boolean;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

export default function CompactRow({ panel, title, onScreen, open, onToggle, children }: Props) {
  const useQuick: () => Quick = QUICK[panel] ?? noQuick;
  const quick = useQuick();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);
  const run = async () => {
    if (!quick.action) return;
    setBusy(true);
    const result = await quick.action.run();
    setBusy(false);
    if (!result) toast.error(`${title}: hat nicht geklappt`);
  };
  return (
    <section className={`compact-row${onScreen ? ' on-screen' : ''}${open ? ' open' : ''}`}>
      <div className="compact-row-head">
        <span className={`compact-row-dot${onScreen ? ' on' : ''}`} aria-hidden="true" />
        <button type="button" className="compact-row-name" aria-expanded={open} onClick={onToggle}>
          <strong>{title}</strong>
          <span>{quick.line}{onScreen ? ' · im Bild' : ''}</span>
        </button>
        {quick.action && (
          <button type="button" className="compact-row-action" onClick={() => void run()} disabled={busy}>{quick.action.label}</button>
        )}
      </div>
      {open && <div className="compact-row-body">{children}</div>}
    </section>
  );
}

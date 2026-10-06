import React, { useState, useEffect, useRef } from 'react';
import { useApi, apiPatch } from '../hooks/useApi';
import { useWebSocket } from '../hooks/useWebSocket';
import { StreamState, ProjectItem } from '../../../shared/types';
import { useToast } from '../contexts/ToastContext';

// "Ziel für heute" on "Im Stream": a sentence and a running clock. Idle: one
// field, one button. Running: the goal, the clock, and what to do with it.
export default function ChallengePanel() {
  const { toast } = useToast();
  const { data: initialState, loading, refetch } = useApi<StreamState>('/stream-state');
  const { data: progressData } = useApi<{ items: ProjectItem[] }>('/progress');
  const [liveState, setLiveState] = useState<StreamState | null>(null);
  const [title, setTitle] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const state = liveState || initialState;

  useWebSocket((event, data) => {
    if (event === 'stream-state') setLiveState(data as StreamState);
  });

  useEffect(() => {
    if (state && !isEditing) {
      const newTitle = state.challenge_title || '';
      if (newTitle !== title) setTitle(newTitle);
    }
  // Deps intentionally narrow to avoid firing every WS tick.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.challenge_title, isEditing]);

  const seconds = state?.timer_seconds || 0;
  const timerDisplay = `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;

  const startChallenge = async () => {
    if (!title.trim()) return;
    setIsEditing(false);
    const result = await apiPatch('/stream-state', { challenge_title: title.trim(), challenge_status: 'in_progress', timer_seconds: 0, timer_running: 1 });
    if (!result) { toast.error('Ziel nicht gesetzt'); return; }
    refetch();
  };

  const finishChallenge = async (status: string) => {
    const result = await apiPatch('/stream-state', { challenge_status: status, timer_running: 0 });
    if (!result) { toast.error('Aktion fehlgeschlagen'); return; }
    refetch();
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(async () => {
      const reset = await apiPatch('/stream-state', { challenge_title: null, challenge_status: 'idle', timer_seconds: 0, timer_running: 0 });
      if (!reset) { toast.error('Aktion fehlgeschlagen'); resetTimerRef.current = null; return; }
      setTitle('');
      refetch();
      resetTimerRef.current = null;
    }, 3000);
  };

  const toggleTimer = async () => {
    const result = await apiPatch('/stream-state', { timer_running: state?.timer_running ? 0 : 1 });
    if (!result) { toast.error('Aktion fehlgeschlagen'); return; }
    refetch();
  };

  const cancelChallenge = async () => {
    const result = await apiPatch('/stream-state', { challenge_title: null, challenge_status: 'idle', timer_seconds: 0, timer_running: 0 });
    if (!result) { toast.error('Aktion fehlgeschlagen'); return; }
    setTitle('');
    refetch();
  };

  if (loading && !state) return <div className="panel"><p className="empty">Laden …</p></div>;

  const isActive = !!state?.challenge_title && state.challenge_status !== 'idle';
  const statusLabel = state?.challenge_status === 'in_progress' ? 'läuft' : state?.challenge_status === 'done' ? 'geschafft' : state?.challenge_status === 'failed' ? 'nicht geschafft' : '';
  const statusTone = state?.challenge_status === 'done' ? 'ok' : state?.challenge_status === 'failed' ? 'bad' : 'live';
  const isLinkedToProgress = isActive && progressData?.items?.some(
    (item) => item.status === 'in_progress' && item.title === state?.challenge_title,
  );

  if (!isActive) {
    return (
      <div className="panel card-slim">
        <div className="card-row">
          <input
            type="text"
            placeholder="Was willst du heute schaffen?"
            aria-label="Ziel für heute"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onFocus={() => setIsEditing(true)}
            onBlur={() => setTimeout(() => setIsEditing(false), 200)}
            onKeyDown={(e) => e.key === 'Enter' && startChallenge()}
          />
          <button type="button" className="card-primary" onClick={startChallenge} disabled={!title.trim()}>Los</button>
        </div>
        <div className="card-status"><span>Noch kein Ziel. Die Uhr startet mit „Los“.</span></div>
      </div>
    );
  }

  return (
    <div className="panel card-slim">
      <div className="card-goal">
        <span className={`card-goal-dot ${statusTone}`} aria-hidden="true" />
        <span className="card-goal-title">{state?.challenge_title}</span>
        <span className="card-goal-state">{statusLabel}</span>
      </div>
      <div className="card-line">
        <span className="card-timer">{timerDisplay}</span>
        <button type="button" className="card-secondary" onClick={toggleTimer}>{state?.timer_running ? 'Pause' : 'Weiter'}</button>
      </div>
      <div className="card-row">
        <button type="button" className="card-primary" onClick={() => finishChallenge('done')}>Geschafft</button>
        <button type="button" className="card-secondary" onClick={() => finishChallenge('failed')}>Nicht geschafft</button>
      </div>
      <div className="card-status">
        {isLinkedToProgress && <span>Hängt am aktiven Punkt unter „Fortschritt“.</span>}
        <button type="button" className="card-link" onClick={cancelChallenge}>Abbrechen</button>
      </div>
    </div>
  );
}

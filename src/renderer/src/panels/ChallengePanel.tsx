import React, { useState, useEffect, useRef } from 'react';
import { useApi, apiPatch } from '../hooks/useApi';
import { useWebSocket } from '../hooks/useWebSocket';
import { StreamState, ProjectItem } from '../../../shared/types';
import ChatCommands from '../components/ChatCommands';
import { useToast } from '../contexts/ToastContext';

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
    if (!result) { toast.error('Aktion fehlgeschlagen'); return; }
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

  if (loading && !state) {
    return <div className="panel"><p className="empty">Laden...</p></div>;
  }

  const isActive = state?.challenge_title && state.challenge_status !== 'idle';
  const statusColor = state?.challenge_status === 'in_progress' ? '#e74c3c' : state?.challenge_status === 'done' ? '#2ecc71' : state?.challenge_status === 'failed' ? '#e74c3c' : '#888';
  const statusLabel = state?.challenge_status === 'in_progress' ? 'Läuft' : state?.challenge_status === 'done' ? 'Geschafft!' : state?.challenge_status === 'failed' ? 'Gescheitert' : '';
  const isLinkedToProgress = isActive && progressData?.items?.some(
    item => item.status === 'in_progress' && item.title === state?.challenge_title
  );

  return (
    <div className="panel challenge-panel">
      <h2>🔬 Challenge</h2>
      <p className="panel-desc">Setz dein Ziel für den Stream. Timer startet automatisch.</p>

      {!isActive ? (
        <div className="challenge-input">
          <input
            type="text"
            placeholder="Was willst du heute schaffen?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onFocus={() => setIsEditing(true)}
            onBlur={() => setTimeout(() => setIsEditing(false), 200)}
            onKeyDown={(e) => e.key === 'Enter' && startChallenge()}
          />
          <button onClick={startChallenge}>Los!</button>
        </div>
      ) : (
        <>
          <div className="challenge-status">
            <span className="status-dot" style={{ background: statusColor }} />
            <span className="challenge-title">{state?.challenge_title}</span>
            <span className="challenge-state">{statusLabel}</span>
          </div>

          {isLinkedToProgress && (
            <p className="linked-indicator">Verknüpft mit Progress Tracker</p>
          )}

          <div className="timer">
            <span className="timer-display">{timerDisplay}</span>
            <button onClick={toggleTimer} title={state?.timer_running ? 'Pausieren' : 'Weiter'}>
              {state?.timer_running ? '⏸️' : '▶️'}
            </button>
          </div>

          <div className="challenge-actions">
            <button className="btn-done" onClick={() => finishChallenge('done')}>✅ Geschafft</button>
            <button className="btn-failed" onClick={() => finishChallenge('failed')}>❌ Nicht geschafft</button>
            <button className="btn-reset" onClick={cancelChallenge}>Abbrechen</button>
          </div>
        </>
      )}
      <ChatCommands commands={[
        { cmd: '!challenge', desc: 'Zeigt aktuelle Challenge + Status' },
        { cmd: '!uptime', desc: 'Wie lange läuft der Stream' },
      ]} />
    </div>
  );
}

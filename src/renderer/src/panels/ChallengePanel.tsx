import React, { useState, useEffect, useRef } from 'react';
import { useApi, apiPatch } from '../hooks/useApi';
import { StreamState } from '../../../shared/types';
import ChatCommands from '../components/ChatCommands';

export default function ChallengePanel() {
  const { data: state, refetch } = useApi<StreamState>('/stream-state');
  const [title, setTitle] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [timerDisplay, setTimerDisplay] = useState('00:00');
  const [seconds, setSeconds] = useState(0);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (state) {
      if (!isEditing) {
        setTitle(state.challenge_title || '');
      }
      setSeconds(state.timer_seconds);
    }
  }, [state, isEditing]);

  useEffect(() => {
    if (!state?.timer_running) return;
    let syncCounter = 0;
    const interval = setInterval(() => {
      setSeconds((s) => {
        const next = s + 1;
        syncCounter++;
        if (syncCounter % 10 === 0) {
          apiPatch('/stream-state', { timer_seconds: next });
        }
        return next;
      });
    }, 1000);
    return () => {
      clearInterval(interval);
      setSeconds((s) => {
        apiPatch('/stream-state', { timer_seconds: s });
        return s;
      });
    };
  }, [state?.timer_running]);

  useEffect(() => {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    setTimerDisplay(`${mins}:${secs}`);
  }, [seconds]);

  const startChallenge = async () => {
    if (!title.trim()) return;
    setIsEditing(false);
    await apiPatch('/stream-state', { challenge_title: title.trim(), challenge_status: 'in_progress', timer_seconds: 0, timer_running: 1 });
    setSeconds(0);
    refetch();
  };

  const finishChallenge = async (status: string) => {
    await apiPatch('/stream-state', { challenge_status: status, timer_running: 0 });
    refetch();
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(async () => {
      await apiPatch('/stream-state', { challenge_title: null, challenge_status: 'idle', timer_seconds: 0, timer_running: 0 });
      setTitle('');
      setSeconds(0);
      refetch();
      resetTimerRef.current = null;
    }, 3000);
  };

  const toggleTimer = async () => {
    await apiPatch('/stream-state', { timer_running: state?.timer_running ? 0 : 1 });
    refetch();
  };

  const cancelChallenge = async () => {
    await apiPatch('/stream-state', { challenge_title: null, challenge_status: 'idle', timer_seconds: 0, timer_running: 0 });
    setTitle('');
    setSeconds(0);
    refetch();
  };

  const isActive = state?.challenge_title && state.challenge_status !== 'idle';
  const statusColor = state?.challenge_status === 'in_progress' ? '#e74c3c' : state?.challenge_status === 'done' ? '#2ecc71' : state?.challenge_status === 'failed' ? '#e74c3c' : '#888';
  const statusLabel = state?.challenge_status === 'in_progress' ? 'Läuft' : state?.challenge_status === 'done' ? 'Geschafft!' : state?.challenge_status === 'failed' ? 'Gescheitert' : '';

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

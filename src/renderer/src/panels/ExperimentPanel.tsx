import React, { useState, useEffect, useRef } from 'react';
import { useApi, apiPatch } from '../hooks/useApi';
import { StreamState } from '../../../shared/types';

export default function ExperimentPanel() {
  const { data: state, refetch } = useApi<StreamState>('/stream-state');
  const [title, setTitle] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [timerDisplay, setTimerDisplay] = useState('00:00');
  const [seconds, setSeconds] = useState(0);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (state) {
      if (!isEditing) {
        setTitle(state.experiment_title || '');
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

  const startExperiment = async () => {
    if (!title.trim()) return;
    setIsEditing(false);
    await apiPatch('/stream-state', { experiment_title: title.trim(), experiment_status: 'in_progress', timer_seconds: 0, timer_running: 1 });
    setSeconds(0);
    refetch();
  };

  const finishExperiment = async (status: string) => {
    await apiPatch('/stream-state', { experiment_status: status, timer_running: 0 });
    refetch();
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(async () => {
      await apiPatch('/stream-state', { experiment_title: null, experiment_status: 'idle', timer_seconds: 0, timer_running: 0 });
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

  const cancelExperiment = async () => {
    await apiPatch('/stream-state', { experiment_title: null, experiment_status: 'idle', timer_seconds: 0, timer_running: 0 });
    setTitle('');
    setSeconds(0);
    refetch();
  };

  const isActive = state?.experiment_title && state.experiment_status !== 'idle';
  const statusColor = state?.experiment_status === 'in_progress' ? '#e74c3c' : state?.experiment_status === 'done' ? '#2ecc71' : state?.experiment_status === 'failed' ? '#e74c3c' : '#888';
  const statusLabel = state?.experiment_status === 'in_progress' ? 'Läuft' : state?.experiment_status === 'done' ? 'Geschafft!' : state?.experiment_status === 'failed' ? 'Gescheitert' : '';

  return (
    <div className="panel experiment-panel">
      <h2>🔬 Experiment</h2>
      <p className="panel-desc">Setz dein Ziel für den Stream. Timer startet automatisch.</p>

      {!isActive ? (
        <div className="experiment-input">
          <input
            type="text"
            placeholder="Was willst du heute schaffen?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onFocus={() => setIsEditing(true)}
            onBlur={() => setTimeout(() => setIsEditing(false), 200)}
            onKeyDown={(e) => e.key === 'Enter' && startExperiment()}
          />
          <button onClick={startExperiment}>Los!</button>
        </div>
      ) : (
        <>
          <div className="experiment-status">
            <span className="status-dot" style={{ background: statusColor }} />
            <span className="experiment-title">{state?.experiment_title}</span>
            <span className="experiment-state">{statusLabel}</span>
          </div>

          <div className="timer">
            <span className="timer-display">{timerDisplay}</span>
            <button onClick={toggleTimer} title={state?.timer_running ? 'Pausieren' : 'Weiter'}>
              {state?.timer_running ? '⏸️' : '▶️'}
            </button>
          </div>

          <div className="experiment-actions">
            <button className="btn-done" onClick={() => finishExperiment('done')}>✅ Geschafft</button>
            <button className="btn-failed" onClick={() => finishExperiment('failed')}>❌ Nicht geschafft</button>
            <button className="btn-reset" onClick={cancelExperiment}>Abbrechen</button>
          </div>
        </>
      )}
    </div>
  );
}

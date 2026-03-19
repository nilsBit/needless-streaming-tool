import React, { useState, useEffect } from 'react';
import { useApi, apiPatch } from '../hooks/useApi';

interface StreamState {
  experiment_title: string | null;
  experiment_status: string;
  timer_seconds: number;
  timer_running: number;
  is_live: number;
}

export default function ExperimentPanel() {
  const { data: state, refetch } = useApi<StreamState>('/stream-state');
  const [title, setTitle] = useState('');
  const [timerDisplay, setTimerDisplay] = useState('00:00');
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (state) {
      setTitle(state.experiment_title || '');
      setSeconds(state.timer_seconds);
    }
  }, [state]);

  useEffect(() => {
    if (!state?.timer_running) return;
    const interval = setInterval(() => {
      setSeconds((s) => {
        const next = s + 1;
        apiPatch('/stream-state', { timer_seconds: next });
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [state?.timer_running]);

  useEffect(() => {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    setTimerDisplay(`${mins}:${secs}`);
  }, [seconds]);

  const setExperiment = async () => {
    await apiPatch('/stream-state', { experiment_title: title, experiment_status: 'in_progress', timer_seconds: 0, timer_running: 0 });
    setSeconds(0);
    refetch();
  };

  const setStatus = async (status: string) => {
    await apiPatch('/stream-state', { experiment_status: status, timer_running: 0 });
    refetch();
  };

  const toggleTimer = async () => {
    await apiPatch('/stream-state', { timer_running: state?.timer_running ? 0 : 1 });
    refetch();
  };

  const resetExperiment = async () => {
    await apiPatch('/stream-state', { experiment_title: null, experiment_status: 'idle', timer_seconds: 0, timer_running: 0 });
    setTitle('');
    setSeconds(0);
    refetch();
  };

  const statusColor = state?.experiment_status === 'in_progress' ? '#e74c3c' : state?.experiment_status === 'done' ? '#2ecc71' : state?.experiment_status === 'failed' ? '#e74c3c' : '#888';

  return (
    <div className="panel experiment-panel">
      <h2>🔬 Experiment</h2>

      <div className="experiment-input">
        <input
          type="text"
          placeholder="Experiment-Titel..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && setExperiment()}
        />
        <button onClick={setExperiment}>Start</button>
      </div>

      {state?.experiment_title && (
        <>
          <div className="experiment-status">
            <span className="status-dot" style={{ background: statusColor }} />
            <span className="experiment-title">{state.experiment_title}</span>
            <span className="experiment-state">{state.experiment_status}</span>
          </div>

          <div className="timer">
            <span className="timer-display">{timerDisplay}</span>
            <button onClick={toggleTimer}>{state.timer_running ? '⏸️' : '▶️'}</button>
          </div>

          <div className="experiment-actions">
            <button className="btn-done" onClick={() => setStatus('done')}>✅ Done</button>
            <button className="btn-failed" onClick={() => setStatus('failed')}>❌ Failed</button>
            <button className="btn-reset" onClick={resetExperiment}>🔄 Reset</button>
          </div>
        </>
      )}
    </div>
  );
}

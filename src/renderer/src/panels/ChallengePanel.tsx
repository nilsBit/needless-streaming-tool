import React, { useState, useEffect, useRef } from 'react';
import { useApi, apiPatch } from '../hooks/useApi';
import { StreamState, ProjectItem } from '../../../shared/types';
import ChatCommands from '../components/ChatCommands';
import { useTranslation } from '../i18n/LanguageContext';
import { useToast } from '../i18n/ToastContext';

export default function ChallengePanel() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: state, loading, refetch } = useApi<StreamState>('/stream-state');
  const { data: progressData } = useApi<{ items: ProjectItem[] }>('/progress');
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
    const result = await apiPatch('/stream-state', { challenge_title: title.trim(), challenge_status: 'in_progress', timer_seconds: 0, timer_running: 1 });
    if (!result) { toast.error(t('error.action_failed')); return; }
    setSeconds(0);
    refetch();
  };

  const finishChallenge = async (status: string) => {
    const result = await apiPatch('/stream-state', { challenge_status: status, timer_running: 0 });
    if (!result) { toast.error(t('error.action_failed')); return; }
    refetch();
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(async () => {
      const reset = await apiPatch('/stream-state', { challenge_title: null, challenge_status: 'idle', timer_seconds: 0, timer_running: 0 });
      if (!reset) { toast.error(t('error.action_failed')); resetTimerRef.current = null; return; }
      setTitle('');
      setSeconds(0);
      refetch();
      resetTimerRef.current = null;
    }, 3000);
  };

  const toggleTimer = async () => {
    const result = await apiPatch('/stream-state', { timer_running: state?.timer_running ? 0 : 1 });
    if (!result) { toast.error(t('error.action_failed')); return; }
    refetch();
  };

  const cancelChallenge = async () => {
    const result = await apiPatch('/stream-state', { challenge_title: null, challenge_status: 'idle', timer_seconds: 0, timer_running: 0 });
    if (!result) { toast.error(t('error.action_failed')); return; }
    setTitle('');
    setSeconds(0);
    refetch();
  };

  if (loading && !state) {
    return <div className="panel"><p className="empty">{t('common.loading')}</p></div>;
  }

  const isActive = state?.challenge_title && state.challenge_status !== 'idle';
  const statusColor = state?.challenge_status === 'in_progress' ? '#e74c3c' : state?.challenge_status === 'done' ? '#2ecc71' : state?.challenge_status === 'failed' ? '#e74c3c' : '#888';
  const statusLabel = state?.challenge_status === 'in_progress' ? t('challenge.running') : state?.challenge_status === 'done' ? t('challenge.done') : state?.challenge_status === 'failed' ? t('challenge.failed') : '';
  const isLinkedToProgress = isActive && progressData?.items?.some(
    item => item.status === 'in_progress' && item.title === state?.challenge_title
  );

  return (
    <div className="panel challenge-panel">
      <h2>🔬 Challenge</h2>
      <p className="panel-desc">{t('challenge.desc')}</p>

      {!isActive ? (
        <div className="challenge-input">
          <input
            type="text"
            placeholder={t('challenge.placeholder')}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onFocus={() => setIsEditing(true)}
            onBlur={() => setTimeout(() => setIsEditing(false), 200)}
            onKeyDown={(e) => e.key === 'Enter' && startChallenge()}
          />
          <button onClick={startChallenge}>{t('challenge.start')}</button>
        </div>
      ) : (
        <>
          <div className="challenge-status">
            <span className="status-dot" style={{ background: statusColor }} />
            <span className="challenge-title">{state?.challenge_title}</span>
            <span className="challenge-state">{statusLabel}</span>
          </div>

          {isLinkedToProgress && (
            <p className="linked-indicator">{t('progress.linked_challenge')}</p>
          )}

          <div className="timer">
            <span className="timer-display">{timerDisplay}</span>
            <button onClick={toggleTimer} title={state?.timer_running ? t('challenge.pause') : t('challenge.resume')}>
              {state?.timer_running ? '⏸️' : '▶️'}
            </button>
          </div>

          <div className="challenge-actions">
            <button className="btn-done" onClick={() => finishChallenge('done')}>{t('challenge.btn_done')}</button>
            <button className="btn-failed" onClick={() => finishChallenge('failed')}>{t('challenge.btn_failed')}</button>
            <button className="btn-reset" onClick={cancelChallenge}>{t('challenge.btn_cancel')}</button>
          </div>
        </>
      )}
      <ChatCommands commands={[
        { cmd: '!challenge', desc: t('challenge.cmd_challenge') },
        { cmd: '!uptime', desc: t('challenge.cmd_uptime') },
      ]} />
    </div>
  );
}

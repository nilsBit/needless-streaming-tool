import React, { useState } from 'react';
import { useApi, apiPost, apiPatch, apiDelete } from '../hooks/useApi';
import { Milestone } from '../../../shared/types';
import { useWebSocket } from '../hooks/useWebSocket';
import { useTranslation } from '../i18n/LanguageContext';
import { useToast } from '../i18n/ToastContext';

const LEVEL_CONFIG = {
  minor: { emoji: '✨', label: 'Minor', color: '#3498db' },
  major: { emoji: '🎉', label: 'Major', color: '#f39c12' },
  epic: { emoji: '🏆', label: 'Epic', color: '#e74c3c' },
} as const;

type Level = keyof typeof LEVEL_CONFIG;

export default function MilestonesPanel() {
  const { data: milestones, loading, refetch } = useApi<Milestone[]>('/milestones');
  const [title, setTitle] = useState('');
  const [level, setLevel] = useState<Level>('major');
  const { t } = useTranslation();
  const { toast } = useToast();

  useWebSocket((event) => {
    if (event.startsWith('milestone-')) refetch();
  });

  const addMilestone = async () => {
    if (!title.trim()) return;
    const result = await apiPost('/milestones', { title: title.trim(), level });
    if (!result) { toast.error(t('error.action_failed')); return; }
    setTitle('');
  };

  const completeMilestone = async (id: number) => {
    const result = await apiPatch(`/milestones/${id}`, { status: 'completed' });
    if (!result) { toast.error(t('error.action_failed')); return; }
    refetch();
  };

  const deleteMilestone = async (id: number) => {
    const ok = await apiDelete(`/milestones/${id}`);
    if (!ok) { toast.error(t('error.action_failed')); return; }
    refetch();
  };

  if (loading && !milestones) {
    return <div className="panel"><p className="empty">{t('common.loading')}</p></div>;
  }

  const pending = milestones?.filter((ms) => ms.status === 'pending') || [];
  const completed = milestones?.filter((ms) => ms.status === 'completed') || [];

  return (
    <div className="panel milestones-panel">
      <h2>🎉 Milestones</h2>

      <div className="milestone-list">
        {pending.length === 0 && <p className="empty">{t('milestones.empty')}</p>}
        {pending.map((ms) => (
          <div key={ms.id} className="milestone-item pending">
            <button
              className="status-toggle"
              onClick={() => completeMilestone(ms.id)}
              title={t('milestones.check_tooltip')}
            >
              ⬜
            </button>
            <span className="ms-level" style={{ color: LEVEL_CONFIG[ms.level]?.color }}>
              {LEVEL_CONFIG[ms.level]?.emoji}
            </span>
            <span className="ms-title">{ms.title}</span>
            <button className="btn-delete-small" onClick={() => deleteMilestone(ms.id)} title={t('tooltip.delete')}>✕</button>
          </div>
        ))}
      </div>

      {completed.length > 0 && (
        <div className="milestone-history">
          <h3>{`${t('milestones.completed')} (${completed.length})`}</h3>
          {completed.map((ms) => (
            <div key={ms.id} className="milestone-item completed">
              <span className="status-toggle done">✅</span>
              <span className="ms-level">{LEVEL_CONFIG[ms.level]?.emoji}</span>
              <span className="ms-title">{ms.title}</span>
              <span className="ms-time">
                {ms.completed_at ? new Date(ms.completed_at + 'Z').toLocaleDateString('de-DE') : ''}
              </span>
              <button className="btn-delete-small" onClick={() => deleteMilestone(ms.id)} title={t('tooltip.delete')}>✕</button>
            </div>
          ))}
        </div>
      )}

      <div className="milestone-add">
        <input
          type="text"
          placeholder="Neuer Milestone..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addMilestone()}
        />
        <div className="milestone-level-select">
          {(Object.entries(LEVEL_CONFIG) as Array<[Level, typeof LEVEL_CONFIG[Level]]>).map(([lvl, config]) => (
            <button
              key={lvl}
              className={`level-btn ${level === lvl ? 'active' : ''}`}
              style={{ borderColor: level === lvl ? config.color : 'transparent' }}
              onClick={() => setLevel(lvl)}
              title={config.label}
            >
              {config.emoji}
            </button>
          ))}
        </div>
        <button onClick={addMilestone} disabled={!title.trim()}>+</button>
      </div>
    </div>
  );
}

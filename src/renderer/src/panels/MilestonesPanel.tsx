import React, { useState } from 'react';
import { useApi, apiPost, apiPatch, apiDelete } from '../hooks/useApi';
import { Milestone, ProjectItem } from '../../../shared/types';
import { useWebSocket } from '../hooks/useWebSocket';
import { useTranslation } from '../i18n/LanguageContext';
import { useToast } from '../i18n/ToastContext';

const LEVEL_CONFIG = {
  minor: { emoji: '✨', label: 'Minor', color: '#3498db' },
  major: { emoji: '🎉', label: 'Major', color: '#f39c12' },
  epic: { emoji: '🏆', label: 'Epic', color: '#e74c3c' },
} as const;

type Level = keyof typeof LEVEL_CONFIG;

interface ProgressData {
  project_name: string | null;
  items: ProjectItem[];
}

export default function MilestonesPanel() {
  const { data: milestones, loading, refetch } = useApi<Milestone[]>('/milestones');
  const { data: progressData } = useApi<ProgressData>('/progress');
  const [title, setTitle] = useState('');
  const [level, setLevel] = useState<Level>('major');
  const [projectId, setProjectId] = useState<number | ''>('');
  const { t } = useTranslation();
  const { toast } = useToast();

  useWebSocket((event) => {
    if (event.startsWith('milestone-') || event.startsWith('progress-')) refetch();
  });

  const projectItems = progressData?.items || [];

  const addMilestone = async () => {
    if (!title.trim()) return;
    const result = await apiPost('/milestones', {
      title: title.trim(),
      level,
      project_id: projectId || null,
    });
    if (!result) { toast.error(t('error.action_failed')); return; }
    setTitle('');
    setProjectId('');
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

  const getProjectTitle = (pid: number | null) => {
    if (!pid) return null;
    return projectItems.find(p => p.id === pid)?.title || null;
  };

  return (
    <div className="panel milestones-panel">
      <h2>🎉 {t('milestones.title')}</h2>

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
            <div className="ms-content">
              <span className="ms-title">{ms.title}</span>
              {ms.project_id && (
                <span className="ms-project">{getProjectTitle(ms.project_id)}</span>
              )}
              {(ms.linkedTodoCount ?? 0) > 0 && (
                <span className="ms-todo-progress">
                  ☑ {ms.linkedTodoDone ?? 0}/{ms.linkedTodoCount} Todos
                </span>
              )}
            </div>
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
        <select
          className="milestone-project-select"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : '')}
        >
          <option value="">Kein Projekt</option>
          {projectItems.map((p) => (
            <option key={p.id} value={p.id}>{p.title}</option>
          ))}
        </select>
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

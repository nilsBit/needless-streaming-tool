import React, { useState } from 'react';
import { useApi, apiPost, apiPatch, apiDelete } from '../hooks/useApi';
import { Milestone } from '../../../shared/types';
import { useWebSocket } from '../hooks/useWebSocket';

const LEVEL_CONFIG = {
  minor: { emoji: '✨', label: 'Minor', color: '#3498db' },
  major: { emoji: '🎉', label: 'Major', color: '#f39c12' },
  epic: { emoji: '🏆', label: 'Epic', color: '#e74c3c' },
} as const;

type Level = keyof typeof LEVEL_CONFIG;

export default function MilestonesPanel() {
  const { data: milestones, refetch } = useApi<Milestone[]>('/milestones');
  const [title, setTitle] = useState('');
  const [level, setLevel] = useState<Level>('major');

  useWebSocket((event) => {
    if (event.startsWith('milestone-')) refetch();
  });

  const addMilestone = async () => {
    if (!title.trim()) return;
    await apiPost('/milestones', { title: title.trim(), level });
    setTitle('');
  };

  const completeMilestone = async (id: number) => {
    await apiPatch(`/milestones/${id}`, { status: 'completed' });
    refetch();
  };

  const deleteMilestone = async (id: number) => {
    await apiDelete(`/milestones/${id}`);
    refetch();
  };

  const pending = milestones?.filter((ms) => ms.status === 'pending') || [];
  const completed = milestones?.filter((ms) => ms.status === 'completed') || [];

  return (
    <div className="panel milestones-panel">
      <h2>🎉 Milestones</h2>

      <div className="milestone-list">
        {pending.length === 0 && <p className="empty">Keine offenen Milestones</p>}
        {pending.map((ms) => (
          <div key={ms.id} className="milestone-item pending">
            <button
              className="status-toggle"
              onClick={() => completeMilestone(ms.id)}
              title="Abhaken → Achievement"
            >
              ⬜
            </button>
            <span className="ms-level" style={{ color: LEVEL_CONFIG[ms.level]?.color }}>
              {LEVEL_CONFIG[ms.level]?.emoji}
            </span>
            <span className="ms-title">{ms.title}</span>
            <button className="btn-delete-small" onClick={() => deleteMilestone(ms.id)}>✕</button>
          </div>
        ))}
      </div>

      {completed.length > 0 && (
        <div className="milestone-history">
          <h3>Erledigt ({completed.length})</h3>
          {completed.map((ms) => (
            <div key={ms.id} className="milestone-item completed">
              <span className="status-toggle done">✅</span>
              <span className="ms-level">{LEVEL_CONFIG[ms.level]?.emoji}</span>
              <span className="ms-title">{ms.title}</span>
              <span className="ms-time">
                {ms.completed_at ? new Date(ms.completed_at).toLocaleDateString('de-DE') : ''}
              </span>
              <button className="btn-delete-small" onClick={() => deleteMilestone(ms.id)}>✕</button>
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

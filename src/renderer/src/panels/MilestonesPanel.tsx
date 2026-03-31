import React, { useState } from 'react';
import { useApi, apiPost, apiDelete } from '../hooks/useApi';
import { Milestone } from '../../../shared/types';
import { useWebSocket } from '../hooks/useWebSocket';

const LEVEL_CONFIG = {
  minor: { emoji: '✨', label: 'Minor', color: '#3498db' },
  major: { emoji: '🎉', label: 'Major', color: '#f39c12' },
  epic: { emoji: '🏆', label: 'Epic', color: '#e74c3c' },
} as const;

export default function MilestonesPanel() {
  const { data: milestones, refetch } = useApi<Milestone[]>('/milestones');
  const [message, setMessage] = useState('');

  useWebSocket((event) => {
    if (event.startsWith('milestone-')) refetch();
  });

  const trigger = async (level: 'minor' | 'major' | 'epic') => {
    await apiPost('/milestones', { level, message: message || undefined });
    setMessage('');
    refetch();
  };

  const deleteMilestone = async (id: number) => {
    await apiDelete(`/milestones/${id}`);
    refetch();
  };

  return (
    <div className="panel milestones-panel">
      <h2>🎉 Milestones</h2>

      <div className="milestone-input">
        <input
          type="text"
          placeholder="Nachricht (optional)..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </div>

      <div className="milestone-buttons">
        {(Object.entries(LEVEL_CONFIG) as Array<['minor' | 'major' | 'epic', typeof LEVEL_CONFIG['minor']]>).map(([level, config]) => (
          <button
            key={level}
            className="milestone-trigger"
            style={{ borderColor: config.color }}
            onClick={() => trigger(level)}
          >
            {config.emoji} {config.label}
          </button>
        ))}
      </div>

      <div className="milestone-history">
        <h3>History</h3>
        {(!milestones || milestones.length === 0) && <p className="empty">Noch keine Milestones</p>}
        {milestones?.map((ms) => (
          <div key={ms.id} className="milestone-item">
            <span className="ms-emoji">{LEVEL_CONFIG[ms.level]?.emoji}</span>
            <span className="ms-message">{ms.message || ms.level}</span>
            <span className="ms-time">{new Date(ms.created_at).toLocaleDateString('de-DE')}</span>
            <button className="btn-delete-small" onClick={() => deleteMilestone(ms.id)}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

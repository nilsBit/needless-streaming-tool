import React from 'react';
import { useApi } from '../hooks/useApi';

interface Stats {
  total_clips: number;
  today_clips: number;
  total_bugs: number;
  open_bugs: number;
  total_todos: number;
  done_todos: number;
  total_milestones: number;
  completed_milestones: number;
  total_raids: number;
  total_rewards: number;
}

interface StatCard {
  icon: string;
  value: number;
  label: string;
}

export default function StatsPanel() {
  const { data: stats, loading } = useApi<Stats>('/stats');

  if (loading || !stats) {
    return (
      <div className="panel stats-panel">
        <h2>📊 Statistiken</h2>
        <p className="panel-desc">Wird geladen...</p>
      </div>
    );
  }

  const cards: StatCard[] = [
    { icon: '🎬', value: stats.total_clips, label: 'Clips gesamt' },
    { icon: '📅', value: stats.today_clips, label: 'Clips heute' },
    { icon: '🐛', value: stats.total_bugs, label: 'Bugs gesamt' },
    { icon: '🔴', value: stats.open_bugs, label: 'Offene Bugs' },
    { icon: '✅', value: stats.done_todos, label: 'Erledigte Todos' },
    { icon: '📝', value: stats.total_todos, label: 'Todos gesamt' },
    { icon: '🏆', value: stats.completed_milestones, label: 'Erreichte Meilensteine' },
    { icon: '🎯', value: stats.total_milestones, label: 'Meilensteine gesamt' },
    { icon: '⚔️', value: stats.total_raids, label: 'Raids gesamt' },
    { icon: '🎁', value: stats.total_rewards, label: 'Belohnungen gesamt' },
  ];

  return (
    <div className="panel stats-panel">
      <h2>📊 Statistiken</h2>
      <p className="panel-desc">Überblick über alle Stream-Daten.</p>

      <div className="stats-grid">
        {cards.map((card) => (
          <div key={card.label} className="stat-card">
            <span className="stat-icon">{card.icon}</span>
            <span className="stat-value">{card.value}</span>
            <span className="stat-label">{card.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

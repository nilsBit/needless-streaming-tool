import React from 'react';
import { useApi } from '../hooks/useApi';
import { Stats } from '../../../shared/types';
import { useTranslation } from '../i18n/LanguageContext';

interface StatCard {
  icon: string;
  value: number;
  label: string;
}

export default function StatsPanel() {
  const { data: stats, loading } = useApi<Stats>('/stats');
  const { t } = useTranslation();

  if (loading || !stats) {
    return (
      <div className="panel stats-panel">
        <h2>📊 Statistiken</h2>
        <p className="panel-desc">{t('stats.loading')}</p>
      </div>
    );
  }

  const cards: StatCard[] = [
    { icon: '🎬', value: stats.total_clips, label: t('stats.total_clips') },
    { icon: '📅', value: stats.today_clips, label: t('stats.today_clips') },
    { icon: '⚠️', value: stats.total_issues, label: t('stats.total_issues') },
    { icon: '🔴', value: stats.open_issues, label: t('stats.open_issues') },
    { icon: '✅', value: stats.done_todos, label: t('stats.done_todos') },
    { icon: '📝', value: stats.total_todos, label: t('stats.total_todos') },
    { icon: '🏆', value: stats.completed_milestones, label: t('stats.completed_milestones') },
    { icon: '🎯', value: stats.total_milestones, label: t('stats.total_milestones') },
    { icon: '⚔️', value: stats.total_raids, label: t('stats.total_raids') },
    { icon: '🎁', value: stats.total_rewards, label: t('stats.total_rewards') },
  ];

  return (
    <div className="panel stats-panel">
      <h2>📊 Statistiken</h2>
      <p className="panel-desc">{t('stats.desc')}</p>

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

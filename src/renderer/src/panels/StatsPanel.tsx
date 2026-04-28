import React, { useEffect, useRef } from 'react';
import { useApi } from '../hooks/useApi';
import { useWebSocket } from '../hooks/useWebSocket';
import { Stats } from '../../../shared/types';
import { useTranslation } from '../i18n/LanguageContext';
import Sparkline from '../components/Sparkline';
import DeltaPill from '../components/DeltaPill';
import ProgressBar from '../components/ProgressBar';

const STATS_REFRESH_EVENTS = new Set([
  'clip-created', 'clip-updated', 'clip-deleted',
  'todo-updated',
  'issue-created', 'issue-updated', 'issue-deleted',
  'milestone-created', 'milestone-updated', 'milestone-deleted',
  'reward-redeemed', 'reward-updated',
]);

const THROTTLE_MS = 2000;

export default function StatsPanel() {
  const { data: stats, loading, refetch } = useApi<Stats>('/stats');
  const { t } = useTranslation();

  const lastFetchRef = useRef<number>(0);
  const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleRefetch = () => {
    const now = Date.now();
    const wait = Math.max(0, THROTTLE_MS - (now - lastFetchRef.current));
    if (pendingRef.current) return; // already scheduled
    pendingRef.current = setTimeout(() => {
      pendingRef.current = null;
      lastFetchRef.current = Date.now();
      refetch();
    }, wait);
  };

  useWebSocket((event) => {
    if (STATS_REFRESH_EVENTS.has(event)) scheduleRefetch();
  });

  useEffect(() => () => {
    if (pendingRef.current) clearTimeout(pendingRef.current);
  }, []);

  if (loading || !stats) {
    return (
      <div className="panel stats-panel">
        <h2>📊 {t('stats.title')}</h2>
        <p className="panel-desc">{t('stats.loading')}</p>
      </div>
    );
  }

  return (
    <div className="panel stats-panel">
      <h2>📊 {t('stats.title')}</h2>
      <p className="panel-desc">{t('stats.desc')}</p>

      <section className="stats-section">
        <h3 className="stats-section-title">{t('stats.section.today')}</h3>
        <div className="stats-grid stats-grid-hero">
          <HeroCard icon="🎬" value={stats.today.clips}
                    label={t('stats.today.clips')}
                    delta={stats.today.delta_clips}
                    deltaLabel={t('stats.delta.vs_yesterday')} />
          <HeroCard icon="✅" value={stats.today.todos_done}
                    label={t('stats.today.todos_done')}
                    delta={stats.today.delta_todos}
                    deltaLabel={t('stats.delta.vs_7d_avg')} />
          <HeroCard icon="⚠️" value={stats.today.new_issues}
                    label={t('stats.today.new_issues')}
                    delta={stats.today.delta_issues}
                    deltaLabel={t('stats.delta.vs_yesterday')} />
          <HeroCard icon="🏆" value={stats.today.milestones}
                    label={t('stats.today.milestones')}
                    delta={stats.today.delta_milestones}
                    deltaLabel={t('stats.delta.vs_yesterday')} />
        </div>
      </section>

      <section className="stats-section">
        <h3 className="stats-section-title">{t('stats.section.progress')}</h3>
        <div className="stats-grid">
          <ProgressCard icon="📝"
                        label={t('stats.progress.todos')}
                        value={stats.progress.todos.done}
                        total={stats.progress.todos.total} />
          <ProgressCard icon="🎯"
                        label={t('stats.progress.milestones')}
                        value={stats.progress.milestones.completed}
                        total={stats.progress.milestones.total} />
          <ProgressCard icon="⚠️"
                        label={t('stats.progress.issues')}
                        value={stats.progress.issues.open}
                        total={stats.progress.issues.total}
                        inverted />
        </div>
      </section>

      <section className="stats-section">
        <h3 className="stats-section-title">{t('stats.section.totals')}</h3>
        <div className="stats-grid">
          <TrendCard icon="🎬" value={stats.totals.clips}
                     label={t('stats.totals.clips')}   trend={stats.trends.clips} />
          <TrendCard icon="🎁" value={stats.totals.rewards}
                     label={t('stats.totals.rewards')} trend={stats.trends.rewards} />
          <TrendCard icon="📅" value={stats.totals.active_days_30d}
                     label={t('stats.totals.active_days')} trend={stats.trends.active} />
        </div>
      </section>
    </div>
  );
}

interface HeroCardProps {
  icon: string;
  value: number;
  label: string;
  delta: number;
  deltaLabel: string;
}

function HeroCard({ icon, value, label, delta, deltaLabel }: HeroCardProps) {
  return (
    <div className="stat-card stat-card-hero">
      <div className="stat-card-top">
        <span className="stat-icon">{icon}</span>
        <DeltaPill value={delta} suffix={deltaLabel} />
      </div>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

interface ProgressCardProps {
  icon: string;
  label: string;
  value: number;
  total: number;
  inverted?: boolean;
}

function ProgressCard({ icon, label, value, total, inverted }: ProgressCardProps) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="stat-card">
      <div className="stat-card-top">
        <span className="stat-icon">{icon}</span>
        <span className="stat-pct">{pct}%</span>
      </div>
      <span className="stat-value">{value} / {total}</span>
      <span className="stat-label">{label}</span>
      <ProgressBar value={value} total={total} inverted={inverted} />
    </div>
  );
}

interface TrendCardProps {
  icon: string;
  value: number;
  label: string;
  trend: number[];
}

function TrendCard({ icon, value, label, trend }: TrendCardProps) {
  return (
    <div className="stat-card">
      <div className="stat-card-top">
        <span className="stat-icon">{icon}</span>
        <Sparkline values={trend} />
      </div>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

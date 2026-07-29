import React, { useEffect, useRef } from 'react';
import { useApi } from '../hooks/useApi';
import { useWebSocket } from '../hooks/useWebSocket';
import { Stats } from '../../../shared/types';
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
        <h2>📊 Statistiken</h2>
        <p className="panel-desc">Wird geladen...</p>
      </div>
    );
  }

  return (
    <div className="panel stats-panel">
      <h2>📊 Statistiken</h2>
      <p className="panel-desc">Überblick über alle Stream-Daten.</p>

      <section className="stats-section">
        <h3 className="stats-section-title">Heute</h3>
        <div className="stats-grid stats-grid-hero">
          <HeroCard icon="🎬" value={stats.today.clips}
                    label="Clips heute"
                    delta={stats.today.delta_clips}
                    deltaLabel="vs. gestern" />
          <HeroCard icon="✅" value={stats.today.todos_done}
                    label="Todos erledigt"
                    delta={stats.today.delta_todos}
                    deltaLabel="vs. 7-Tage-Ø" />
          <HeroCard icon="⚠️" value={stats.today.new_issues}
                    label="Neue Einträge"
                    delta={stats.today.delta_issues}
                    deltaLabel="vs. gestern" />
          <HeroCard icon="🏆" value={stats.today.milestones}
                    label="Milestones heute"
                    delta={stats.today.delta_milestones}
                    deltaLabel="vs. gestern" />
        </div>
      </section>

      <section className="stats-section">
        <h3 className="stats-section-title">Fortschritt</h3>
        <div className="stats-grid">
          <ProgressCard icon="📝"
                        label="Todos"
                        value={stats.progress.todos.done}
                        total={stats.progress.todos.total} />
          <ProgressCard icon="🎯"
                        label="Milestones"
                        value={stats.progress.milestones.completed}
                        total={stats.progress.milestones.total} />
          <ProgressCard icon="⚠️"
                        label="Offen"
                        value={stats.progress.issues.open}
                        total={stats.progress.issues.total}
                        inverted />
        </div>
      </section>

      <section className="stats-section">
        <h3 className="stats-section-title">Gesamt & Trend</h3>
        <div className="stats-grid">
          <TrendCard icon="🎬" value={stats.totals.clips}
                     label="Clips gesamt"   trend={stats.trends.clips} />
          <TrendCard icon="🎁" value={stats.totals.rewards}
                     label="Belohnungen gesamt" trend={stats.trends.rewards} />
          <TrendCard icon="📅" value={stats.totals.active_days_30d}
                     label="Aktive Tage (30d)" trend={stats.trends.active} />
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

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

const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

// "Statistik" under Nach dem Stream: first a sentence about today, then the
// numbers — today, the state of the lists, the run of the last two weeks.
export default function StatsPanel() {
  const { data: stats, loading, refetch } = useApi<Stats>('/stats');

  const lastFetchRef = useRef<number>(0);
  const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRefetch = () => {
    const wait = Math.max(0, THROTTLE_MS - (Date.now() - lastFetchRef.current));
    if (pendingRef.current) return;
    pendingRef.current = setTimeout(() => {
      pendingRef.current = null;
      lastFetchRef.current = Date.now();
      refetch();
    }, wait);
  };
  useWebSocket((event) => { if (STATS_REFRESH_EVENTS.has(event)) scheduleRefetch(); });
  useEffect(() => () => { if (pendingRef.current) clearTimeout(pendingRef.current); }, []);

  if (loading || !stats) return <div className="panel card-slim"><p className="empty">Laden …</p></div>;

  const t = stats.today;
  const nothingToday = t.clips === 0 && t.todos_done === 0 && t.new_issues === 0 && t.milestones === 0;
  const sentence = nothingToday
    ? 'Heute ist noch nichts passiert – kein Moment gemerkt, keine Aufgabe abgehakt.'
    : `Heute: ${n(t.clips, 'Moment', 'Momente')} gemerkt, ${n(t.todos_done, 'Aufgabe', 'Aufgaben')} abgehakt, ${n(t.new_issues, 'neues Thema', 'neue Themen')} fürs Glücksrad, ${n(t.milestones, 'Meilenstein', 'Meilensteine')} geschafft.`;

  return (
    <div className="panel card-slim stats">
      <p className="stats-sentence">{sentence}</p>

      <section className="appearance-section">
        <h3 className="dialog-section">Heute</h3>
        <div className="stats-grid stats-grid-hero">
          <Hero value={t.clips} label="Momente gemerkt" delta={t.delta_clips} deltaLabel="zu gestern" />
          <Hero value={t.todos_done} label="Aufgaben abgehakt" delta={t.delta_todos} deltaLabel="zum 7-Tage-Schnitt" />
          <Hero value={t.new_issues} label="Neue Themen" delta={t.delta_issues} deltaLabel="zu gestern" />
          <Hero value={t.milestones} label="Meilensteine" delta={t.delta_milestones} deltaLabel="zu gestern" />
        </div>
      </section>

      <section className="appearance-section">
        <h3 className="dialog-section">Stand der Listen</h3>
        <div className="stats-grid">
          <Progress label="Aufgaben erledigt" value={stats.progress.todos.done} total={stats.progress.todos.total} />
          <Progress label="Meilensteine geschafft" value={stats.progress.milestones.completed} total={stats.progress.milestones.total} />
          <Progress label="Themen noch offen" value={stats.progress.issues.open} total={stats.progress.issues.total} inverted />
        </div>
      </section>

      <section className="appearance-section">
        <h3 className="dialog-section">Gesamt und Verlauf · letzte 14 Tage</h3>
        <div className="stats-grid">
          <Trend value={stats.totals.clips} label="Momente gemerkt, gesamt" trend={stats.trends.clips} />
          <Trend value={stats.totals.rewards} label="Kanalpunkte eingelöst, gesamt" trend={stats.trends.rewards} />
          <Trend value={stats.totals.active_days_30d} label="Stream-Tage in 30 Tagen" trend={stats.trends.active} />
        </div>
      </section>
    </div>
  );
}

function Hero({ value, label, delta, deltaLabel }: { value: number; label: string; delta: number; deltaLabel: string }) {
  return (
    <div className="stat-card stat-card-hero">
      <div className="stat-card-top"><span className="stat-value">{value}</span><DeltaPill value={delta} suffix={deltaLabel} /></div>
      <span className="stat-label">{label}</span>
    </div>
  );
}

function Progress({ label, value, total, inverted }: { label: string; value: number; total: number; inverted?: boolean }) {
  return (
    <div className="stat-card">
      <div className="stat-card-top"><span className="stat-label">{label}</span><span className="stat-value stat-value-small">{value} von {total}</span></div>
      <ProgressBar value={value} total={total} inverted={inverted} />
    </div>
  );
}

function Trend({ value, label, trend }: { value: number; label: string; trend: number[] }) {
  return (
    <div className="stat-card">
      <div className="stat-card-top"><span className="stat-value">{value}</span><Sparkline values={trend} /></div>
      <span className="stat-label">{label}</span>
    </div>
  );
}

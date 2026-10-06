import React, { useEffect } from 'react';
import { useApi } from '../../hooks/useApi';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useNavigate } from '../../NavigationContext';
import type { AreaKey } from '../../navigation';

interface ReadinessItem {
  id: string;
  ok: boolean | null;
  severity: 'error' | 'hint';
  title: string;
  problem: string;
  consequence: string;
  target: { area: AreaKey; subTab?: string };
}

interface Readiness { ready: boolean; items: ReadinessItem[] }

// Shown at the top of "Im Stream" only while something is missing. Each line
// says what is wrong, what that means on stream, and takes you to the fix.
export default function ReadinessBanner() {
  const go = useNavigate();
  const { data, refetch } = useApi<Readiness>('/readiness');

  useWebSocket((event) => {
    if (event === 'bot-status' || event === 'obs-status') refetch();
  });
  useEffect(() => {
    const timer = setInterval(() => refetch(), 30_000);
    return () => clearInterval(timer);
  }, [refetch]);

  const missing = data?.items.filter((item) => item.ok === false) ?? [];
  if (missing.length === 0) return null;
  const errors = missing.filter((item) => item.severity === 'error');

  return (
    <section className={`readiness ${errors.length ? 'readiness-error' : 'readiness-hint'}`} aria-label="Bereit für den Stream?">
      <div className="readiness-title">
        {errors.length ? 'Noch nicht bereit für den Stream' : 'Bereit – ein Hinweis noch'}
      </div>
      <ul className="readiness-list">
        {missing.map((item) => (
          <li key={item.id} className={`readiness-item ${item.severity}`}>
            <span className="readiness-dot" aria-hidden="true" />
            <div className="readiness-text">
              <div className="readiness-problem">{item.problem}</div>
              <div className="readiness-consequence">{item.consequence}</div>
            </div>
            <button type="button" className="readiness-go" onClick={() => go(item.target)}>Dorthin</button>
          </li>
        ))}
      </ul>
    </section>
  );
}

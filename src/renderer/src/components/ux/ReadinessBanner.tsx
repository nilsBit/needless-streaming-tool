import React, { useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useVisibleInterval } from '../../hooks/useVisibleInterval';
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

// Shown at the top of "Im Stream" only while something is missing — as one
// line, so the page stays calm. "Anzeigen" unfolds what is wrong, what that
// means on stream, and a button to the fix.
export default function ReadinessBanner() {
  const go = useNavigate();
  const { data, refetch } = useApi<Readiness>('/readiness');
  const [open, setOpen] = useState(false);

  useWebSocket((event) => {
    if (event === 'bot-status' || event === 'obs-status') refetch();
  });
  useVisibleInterval(refetch, 30_000);

  const missing = data?.items.filter((item) => item.ok === false) ?? [];
  if (missing.length === 0) return null;
  const errors = missing.filter((item) => item.severity === 'error');
  const hints = missing.length - errors.length;

  const summary = [
    ...errors.map((item) => item.problem.replace(/[.–].*$/, '').trim()),
    ...(hints ? [`${hints} ${hints === 1 ? 'Hinweis' : 'Hinweise'}`] : []),
  ].join(' · ');

  return (
    <section className={`readiness ${errors.length ? 'readiness-error' : 'readiness-hint'} ${open ? 'open' : ''}`} aria-label="Bereit für den Stream?">
      <div className="readiness-line">
        <span className="readiness-title">{errors.length ? 'Noch nicht bereit:' : 'Bereit, ein Hinweis:'}</span>
        <span className="readiness-summary">{summary}</span>
        <button type="button" className="card-link" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? 'Zuklappen' : 'Anzeigen'}
        </button>
      </div>
      {open && (
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
      )}
    </section>
  );
}

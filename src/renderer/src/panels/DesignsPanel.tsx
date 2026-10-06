import React, { useState } from 'react';
import { useApi, apiPost, apiPatch, apiDelete } from '../hooks/useApi';
import { Design } from '../../../shared/types';
import { useWebSocket } from '../hooks/useWebSocket';
import { useToast } from '../contexts/ToastContext';
import { useCountdown } from '../hooks/useCountdown';
import Dialog from '../components/ux/Dialog';

interface ActiveVote {
  active?: boolean;
  title?: string;
  options?: string[];
  counts?: Record<string, number>;
  total?: number;
  remaining?: number;
}

const DURATIONS = [[30, '30 Sekunden'], [60, '60 Sekunden'], [120, '2 Minuten'], [300, '5 Minuten']] as const;

// "Abstimmung" on "Im Stream": collect proposals, let the chat vote. The card
// holds the field and the start button; the collected and finished proposals
// sit behind "Vorschläge verwalten".
export default function DesignsPanel() {
  const { toast } = useToast();
  const { data: designs, loading, refetch } = useApi<Design[]>('/designs');
  const { data: vote, refetch: refetchVote } = useApi<ActiveVote>('/voting');
  const [title, setTitle] = useState('');
  const [voteDuration, setVoteDuration] = useState(60);
  const [managing, setManaging] = useState(false);
  const countdown = useCountdown(vote?.remaining ?? 0, refetchVote);

  useWebSocket((event) => {
    if (event === 'design-created' || event === 'design-updated' || event === 'design-deleted') refetch();
    if (event === 'design-vote-started' || event === 'design-vote-ended' || event === 'poll-update' || event === 'poll-close' || event === 'vote-result') refetchVote();
  });

  const addDesign = async () => {
    if (!title.trim()) return;
    const result = await apiPost('/designs', { title: title.trim(), type: 'general' });
    if (!result) { toast.error('Vorschlag nicht gespeichert'); return; }
    setTitle('');
    refetch();
  };
  const completeDesign = async (id: number) => {
    const result = await apiPatch(`/designs/${id}`, { status: 'completed' });
    if (!result) { toast.error('Aktion fehlgeschlagen'); return; }
    refetch();
  };
  const deleteDesign = async (id: number) => {
    const ok = await apiDelete(`/designs/${id}`);
    if (!ok) { toast.error('Aktion fehlgeschlagen'); return; }
    refetch();
  };

  const active = designs?.filter((d) => d.status === 'active') ?? [];
  const completed = designs?.filter((d) => d.status === 'completed') ?? [];
  const hasActiveVote = !!vote && vote.active !== false && !!vote.options;

  const startVote = async () => {
    if (active.length < 2) return;
    const result = await apiPost('/voting/start', { title: 'Abstimmung', options: active.map((d) => d.title), duration: voteDuration });
    if (!result) { toast.error('Abstimmung nicht gestartet'); return; }
    refetchVote();
  };
  const endVote = async () => {
    const result = await apiPost('/voting/end', {});
    if (!result) { toast.error('Aktion fehlgeschlagen'); return; }
    refetchVote();
  };
  const cancelVote = async () => {
    const result = await apiPost('/voting/cancel', {});
    if (!result) { toast.error('Aktion fehlgeschlagen'); return; }
    refetchVote();
  };

  if (loading && !designs) return <div className="panel"><p className="empty">Laden …</p></div>;

  if (hasActiveVote && vote) {
    return (
      <div className="panel card-slim">
        <div className="card-line">
          <span className="card-goal-title">Abstimmung läuft</span>
          <span className="card-timer">{countdown} s</span>
        </div>
        <div className="vote-results">
          {vote.options!.map((opt) => {
            const count = vote.counts?.[opt] || 0;
            const total = vote.total || 1;
            const pct = Math.round((count / total) * 100) || 0;
            return (
              <div key={opt} className="vote-bar-row">
                <span className="vote-label">{opt}</span>
                <div className="vote-bar-bg"><div className="vote-bar-fill" style={{ width: `${pct}%` }} /></div>
                <span className="vote-count">{count}</span>
              </div>
            );
          })}
        </div>
        <div className="card-row">
          <button type="button" className="card-primary" onClick={endVote}>Beenden</button>
          <button type="button" className="card-link" onClick={cancelVote}>Abbrechen</button>
        </div>
      </div>
    );
  }

  const status = active.length === 0
    ? 'Noch keine Vorschläge · ab zwei geht es los'
    : active.length === 1 ? '1 Vorschlag · noch einer, dann geht es los' : `${active.length} Vorschläge bereit`;

  return (
    <div className="panel card-slim">
      <div className="card-row">
        <input
          type="text"
          placeholder="Vorschlag hinzufügen"
          aria-label="Neuer Vorschlag"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addDesign()}
        />
        <button type="button" className="card-secondary" onClick={addDesign} disabled={!title.trim()}>Hinzufügen</button>
      </div>
      <div className="card-row">
        <select className="card-select" aria-label="Dauer" value={voteDuration} onChange={(e) => setVoteDuration(Number(e.target.value))}>
          {DURATIONS.map(([s, label]) => <option key={s} value={s}>{label}</option>)}
        </select>
        <button type="button" className="card-primary card-grow" onClick={startVote} disabled={active.length < 2}>Abstimmung starten</button>
      </div>
      <div className="card-status"><span>{status}</span></div>
      <div className="card-links">
        <button type="button" className="card-link" onClick={() => setManaging(true)}>Vorschläge verwalten</button>
      </div>

      {managing && (
        <Dialog
          title="Vorschläge verwalten"
          sentence="Was zur Wahl steht und was schon entschieden ist."
          onClose={() => setManaging(false)}
        >
          <h3 className="dialog-section">Zur Wahl ({active.length})</h3>
          {active.length === 0 && <p className="dialog-empty">Kein Vorschlag. Oben auf der Karte kommt einer dazu.</p>}
          <ul className="dialog-list">
            {active.map((d) => (
              <li key={d.id}>
                <span className="dialog-list-text">{d.title}</span>
                <button type="button" className="card-secondary" onClick={() => completeDesign(d.id)}>Entschieden</button>
                <button type="button" className="card-link" onClick={() => deleteDesign(d.id)}>Löschen</button>
              </li>
            ))}
          </ul>
          {completed.length > 0 && (
            <>
              <h3 className="dialog-section">Entschieden ({completed.length})</h3>
              <ul className="dialog-list muted">
                {completed.map((d) => (
                  <li key={d.id}>
                    <span className="dialog-list-text">{d.title}</span>
                    <button type="button" className="card-link" onClick={() => deleteDesign(d.id)}>Löschen</button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Dialog>
      )}
    </div>
  );
}

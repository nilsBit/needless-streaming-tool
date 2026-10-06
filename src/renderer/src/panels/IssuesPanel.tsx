import React, { useEffect, useState } from 'react';
import { useApi, apiPost, apiPatch, apiDelete, apiFetch } from '../hooks/useApi';
import { Issue } from '../../../shared/types';
import { useWebSocket } from '../hooks/useWebSocket';
import { useToast } from '../contexts/ToastContext';
import { useCountdown } from '../hooks/useCountdown';
import Dialog from '../components/ux/Dialog';

// The Lucky Wheel card on "Im Stream": one field, one button, one line of
// state. Everything else — the open and fixed Issues, the wheel's name in the
// overlay — sits behind "Themen verwalten" in a dialog.
export default function IssuesPanel() {
  const { toast } = useToast();
  const { data: issues, loading, refetch } = useApi<Issue[]>('/issues');
  const [newIssue, setNewIssue] = useState('');
  const [cooldownServer, setCooldownServer] = useState(0);
  const cooldown = useCountdown(cooldownServer);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<Issue | null>(null);
  const [managing, setManaging] = useState(false);

  // What the wheel is called in the overlay — saved when the field is left.
  const { data: titleInfo } = useApi<{ title: string; default: string; max: number }>('/actions/roulette-title');
  const [title, setTitle] = useState<string | null>(null);
  useEffect(() => { if (titleInfo && title === null) setTitle(titleInfo.title); }, [titleInfo, title]);
  const saveTitle = async () => {
    if (title === null) return;
    const res = await apiFetch('/actions/roulette-title', { method: 'POST', body: JSON.stringify({ title }) });
    if (!res.ok) { toast.error('Name nicht gespeichert'); return; }
    setTitle(((await res.json()) as { title: string }).title);
  };

  useWebSocket((event, data) => {
    if (event === 'issue-created' || event === 'issue-updated' || event === 'issue-deleted') refetch();
    if (event === 'roulette-cooldown') setCooldownServer((data as { remaining_seconds: number }).remaining_seconds);
    if (event === 'roulette-result') {
      const result = data as { title: string; id: number };
      setWinner(issues?.find((i) => i.id === result.id) ?? { id: result.id, title: result.title, status: 'open' } as Issue);
      setSpinning(false);
    }
  });

  const open = issues?.filter((i) => i.status === 'open') ?? [];
  const fixed = issues?.filter((i) => i.status === 'fixed') ?? [];

  const addIssue = async () => {
    if (!newIssue.trim()) return;
    const result = await apiPost('/issues', { title: newIssue.trim() });
    if (!result) { toast.error('Thema nicht gespeichert'); return; }
    setNewIssue('');
    refetch();
  };
  const fixIssue = async (id: number) => {
    const result = await apiPatch(`/issues/${id}`, { status: 'fixed' });
    if (!result) { toast.error('Aktion fehlgeschlagen'); return; }
    refetch();
  };
  const deleteIssue = async (id: number) => {
    const ok = await apiDelete(`/issues/${id}`);
    if (!ok) { toast.error('Aktion fehlgeschlagen'); return; }
    refetch();
  };
  const spin = async () => {
    if (open.length === 0) return;
    setSpinning(true);
    setWinner(null);
    const result = await apiPost('/actions/roulette', {});
    if (!result) { toast.error('Das Rad dreht nicht'); setSpinning(false); }
    // The winner arrives over the WebSocket as 'roulette-result'.
  };

  if (loading && !issues) return <div className="panel"><p className="empty">Laden …</p></div>;

  const spinLabel = spinning ? 'Dreht …' : cooldown > 0 ? `Noch ${cooldown} s` : 'Rad drehen';
  const status = open.length === 0
    ? 'Noch keine Themen'
    : `${open.length} ${open.length === 1 ? 'Thema' : 'Themen'} offen${fixed.length ? ` · ${fixed.length} erledigt` : ''}`;

  return (
    <div className="panel card-slim">
      <div className="card-row">
        <input
          type="text"
          placeholder="Thema hinzufügen"
          aria-label="Neues Thema"
          value={newIssue}
          onChange={(e) => setNewIssue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addIssue()}
        />
        <button type="button" className="card-secondary" onClick={addIssue} disabled={!newIssue.trim()}>Hinzufügen</button>
      </div>
      <button type="button" className="card-primary" onClick={spin} disabled={spinning || open.length === 0 || cooldown > 0}>
        {spinLabel}
      </button>
      <div className="card-status">
        <span>{status}</span>
        {winner && !spinning && <span className="card-result">Dran: <strong>{winner.title}</strong></span>}
      </div>
      <div className="card-links">
        <button type="button" className="card-link" onClick={() => setManaging(true)}>Themen verwalten</button>
      </div>

      {managing && (
        <Dialog
          title="Themen verwalten"
          sentence="Was im Rad steckt, was erledigt ist, und wie das Rad im Overlay heißt."
          onClose={() => setManaging(false)}
        >
          <div className="dialog-field">
            <label htmlFor="wheel-title">Name des Rads im Overlay</label>
            <input
              id="wheel-title"
              type="text"
              placeholder={titleInfo?.default ?? 'Glücksrad'}
              maxLength={titleInfo?.max ?? 30}
              value={title ?? ''}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
            <span className="dialog-hint">Leer lassen heißt „Glücksrad“.</span>
          </div>

          <h3 className="dialog-section">Offen ({open.length})</h3>
          {open.length === 0 && <p className="dialog-empty">Kein offenes Thema. Oben auf der Karte kommt eines dazu.</p>}
          <ul className="dialog-list">
            {open.map((issue) => (
              <li key={issue.id}>
                <span className="dialog-list-text">{issue.title}</span>
                <button type="button" className="card-secondary" onClick={() => fixIssue(issue.id)}>Erledigt</button>
                <button type="button" className="card-link" onClick={() => deleteIssue(issue.id)}>Löschen</button>
              </li>
            ))}
          </ul>

          {fixed.length > 0 && (
            <>
              <h3 className="dialog-section">Erledigt ({fixed.length})</h3>
              <ul className="dialog-list muted">
                {fixed.map((issue) => (
                  <li key={issue.id}>
                    <span className="dialog-list-text">{issue.title}</span>
                    <button type="button" className="card-link" onClick={() => deleteIssue(issue.id)}>Löschen</button>
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

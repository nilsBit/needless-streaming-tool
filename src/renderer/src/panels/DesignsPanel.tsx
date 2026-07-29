import React, { useState } from 'react';
import { useApi, apiPost, apiPatch, apiDelete } from '../hooks/useApi';
import { Design } from '../../../shared/types';
import { useWebSocket } from '../hooks/useWebSocket';
import ChatCommands from '../components/ChatCommands';
import { useToast } from '../contexts/ToastContext';
import { useCountdown } from '../hooks/useCountdown';

interface ActiveVote {
  active?: boolean;
  title?: string;
  options?: string[];
  counts?: Record<string, number>;
  total?: number;
  remaining?: number;
}

export default function DesignsPanel() {
  const { toast } = useToast();
  const { data: designs, loading, refetch } = useApi<Design[]>('/designs');
  const { data: vote, refetch: refetchVote } = useApi<ActiveVote>('/voting');
  const [title, setTitle] = useState('');
  const [voteDuration, setVoteDuration] = useState(60);
  const countdown = useCountdown(vote?.remaining ?? 0, refetchVote);

  useWebSocket((event) => {
    if (event === 'design-created' || event === 'design-updated' || event === 'design-deleted') refetch();
    if (event === 'design-vote-started' || event === 'design-vote-ended' || event === 'poll-update' || event === 'poll-close' || event === 'vote-result') refetchVote();
  });

  const addDesign = async () => {
    if (!title.trim()) return;
    const result = await apiPost('/designs', { title: title.trim(), type: 'general' });
    if (!result) { toast.error('Aktion fehlgeschlagen'); return; }
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

  // Start vote using active designs as options
  const startVoteFromDesigns = async () => {
    if (active.length < 2) return;
    const options = active.map(d => d.title);
    const result = await apiPost('/voting/start', { title: `🗳️ Abstimmungen`, options, duration: voteDuration });
    if (!result) { toast.error('Aktion fehlgeschlagen'); return; }
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

  if (loading && !designs) {
    return <div className="panel"><p className="empty">Laden...</p></div>;
  }

  const active = designs?.filter((d) => d.status === 'active') || [];
  const completed = designs?.filter((d) => d.status === 'completed') || [];
  const hasActiveVote = vote && vote.active !== false && vote.options;

  return (
    <div className="panel designs-panel">
      <h2>🗳️ Abstimmungen</h2>
      <p className="panel-desc">Sammle Vorschläge und lass den Chat abstimmen.</p>

      {/* Step 1: Collect design proposals */}
      <div className="design-create">
        <input
          type="text"
          placeholder="Neuer Vorschlag..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addDesign()}
        />
        <button onClick={addDesign}>+</button>
      </div>

      <div className="design-list">
        {active.length === 0 && !hasActiveVote && <p className="empty">Keine Vorschläge</p>}
        {active.map((d) => (
          <div key={d.id} className="design-item active">
            <span>🎨 {d.title}</span>
            <div className="design-actions">
              <button onClick={() => completeDesign(d.id)} title="Bestätigen">✅</button>
              <button title="Löschen" onClick={() => deleteDesign(d.id)}>🗑️</button>
            </div>
          </div>
        ))}
      </div>

      {/* Step 2: Start vote from collected designs */}
      <div className="vote-section">
        {hasActiveVote ? (
          <div className="vote-active">
            <h3>🗳️ Abstimmung läuft — {countdown}s</h3>
            <div className="vote-results">
              {vote.options!.map((opt) => {
                const count = vote.counts?.[opt] || 0;
                const total = vote.total || 1;
                const pct = Math.round((count / total) * 100) || 0;
                return (
                  <div key={opt} className="vote-bar-row">
                    <span className="vote-label">{opt}</span>
                    <div className="vote-bar-bg">
                      <div className="vote-bar-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="vote-count">{count}</span>
                  </div>
                );
              })}
            </div>
            <div className="vote-controls">
              <button onClick={endVote}>🏆 Beenden</button>
              <button onClick={cancelVote}>✖ Abbrechen</button>
            </div>
          </div>
        ) : (
          <div className="vote-start">
            <div className="vote-start-row">
              <select value={voteDuration} onChange={(e) => setVoteDuration(Number(e.target.value))}>
                <option value={30}>30s</option>
                <option value={60}>60s</option>
                <option value={120}>2 Min</option>
                <option value={300}>5 Min</option>
              </select>
              <button onClick={startVoteFromDesigns} disabled={active.length < 2}>
                🗳️ Abstimmung starten ({active.length})
              </button>
            </div>
          </div>
        )}
      </div>

      {completed.length > 0 && (
        <div className="design-list">
          <h3>Abgeschlossen ({completed.length})</h3>
          {completed.slice(0, 5).map((d) => (
            <div key={d.id} className="design-item done">
              <span>🎨 {d.title}</span>
              <button title="Löschen" onClick={() => deleteDesign(d.id)}>🗑️</button>
            </div>
          ))}
        </div>
      )}

      <ChatCommands commands={[
        { cmd: '!vote <option>', desc: 'Für eine Option stimmen' },
        { cmd: '!design end', desc: 'Abstimmung beenden' },
        { cmd: '!design status', desc: 'Aktueller Stand' },
      ]} />
    </div>
  );
}

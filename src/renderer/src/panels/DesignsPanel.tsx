import React, { useState, useEffect } from 'react';
import { useApi, apiPost, apiPatch, apiDelete } from '../hooks/useApi';
import { Design } from '../../../shared/types';

interface ActiveVote {
  active?: boolean;
  title?: string;
  options?: string[];
  counts?: Record<string, number>;
  total?: number;
  remaining?: number;
}

const TYPE_EMOJI: Record<string, string> = {
  enemy: '👾',
  weapon: '🗡️',
  upgrade: '⬆️',
};

export default function DesignsPanel() {
  const { data: designs, refetch } = useApi<Design[]>('/designs');
  const { data: vote, refetch: refetchVote } = useApi<ActiveVote>('/voting');
  const [title, setTitle] = useState('');
  const [type, setType] = useState('enemy');
  const [voteOptionInput, setVoteOptionInput] = useState('');
  const [voteOptionsList, setVoteOptionsList] = useState<string[]>([]);
  const [voteDuration, setVoteDuration] = useState(60);

  // Poll vote status every 2s when active
  useEffect(() => {
    if (!vote || vote.active === false) return;
    const interval = setInterval(refetchVote, 2000);
    return () => clearInterval(interval);
  }, [vote, refetchVote]);

  const createDesign = async () => {
    if (!title.trim()) return;
    await apiPost('/designs', { title, type });
    setTitle('');
    refetch();
  };

  const completeDesign = async (id: number) => {
    await apiPatch(`/designs/${id}`, { status: 'completed' });
    refetch();
  };

  const deleteDesign = async (id: number) => {
    await apiDelete(`/designs/${id}`);
    refetch();
  };

  const addVoteOption = () => {
    const opt = voteOptionInput.trim().toLowerCase();
    if (!opt || voteOptionsList.includes(opt)) return;
    setVoteOptionsList([...voteOptionsList, opt]);
    setVoteOptionInput('');
  };

  const removeVoteOption = (opt: string) => {
    setVoteOptionsList(voteOptionsList.filter((o) => o !== opt));
  };

  const startVote = async () => {
    if (voteOptionsList.length < 2) return;
    await apiPost('/voting/start', { title: '🎨 Chat Design', options: voteOptionsList, duration: voteDuration });
    setVoteOptionsList([]);
    refetchVote();
  };

  const endVote = async () => {
    await apiPost('/voting/end', {});
    refetchVote();
  };

  const cancelVote = async () => {
    await apiPost('/voting/cancel', {});
    refetchVote();
  };

  const active = designs?.filter((d) => d.status === 'active') || [];
  const completed = designs?.filter((d) => d.status === 'completed') || [];
  const hasActiveVote = vote && vote.active !== false && vote.options;

  return (
    <div className="panel designs-panel">
      <h2>🎨 Chat Designs</h2>
      <p className="panel-desc">1x im Monat designed der Chat ein Feature. Erstell ein Design und lass abstimmen.</p>

      <div className="design-create">
        <input
          type="text"
          placeholder="Design-Titel..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && createDesign()}
        />
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="enemy">👾 Enemy</option>
          <option value="weapon">🗡️ Weapon</option>
          <option value="upgrade">⬆️ Upgrade</option>
        </select>
        <button onClick={createDesign}>+</button>
      </div>

      {/* Voting Section */}
      <div className="vote-section">
        {hasActiveVote ? (
          <div className="vote-active">
            <h3>🗳️ Abstimmung läuft — {vote.remaining}s</h3>
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
            <div className="vote-option-input">
              <input
                type="text"
                placeholder="Option hinzufügen..."
                value={voteOptionInput}
                onChange={(e) => setVoteOptionInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addVoteOption()}
              />
              <button onClick={addVoteOption}>+</button>
            </div>
            {voteOptionsList.length > 0 && (
              <div className="vote-options-list">
                {voteOptionsList.map((opt) => (
                  <span key={opt} className="vote-option-tag">
                    {opt}
                    <button onClick={() => removeVoteOption(opt)}>×</button>
                  </span>
                ))}
              </div>
            )}
            <div className="vote-start-row">
              <select value={voteDuration} onChange={(e) => setVoteDuration(Number(e.target.value))}>
                <option value={30}>30s</option>
                <option value={60}>60s</option>
                <option value={120}>2 Min</option>
                <option value={300}>5 Min</option>
              </select>
              <button onClick={startVote} disabled={voteOptionsList.length < 2}>🗳️ Abstimmung starten</button>
            </div>
          </div>
        )}
      </div>

      <div className="design-list">
        {active.length === 0 && <p className="empty">Kein aktives Design</p>}
        {active.map((d) => (
          <div key={d.id} className="design-item active">
            <span>{TYPE_EMOJI[d.type] || '❓'} {d.title}</span>
            <div className="design-actions">
              <button onClick={() => completeDesign(d.id)}>✅</button>
              <button onClick={() => deleteDesign(d.id)}>🗑️</button>
            </div>
          </div>
        ))}

        {completed.length > 0 && (
          <>
            <h3>Abgeschlossen ({completed.length})</h3>
            {completed.slice(0, 5).map((d) => (
              <div key={d.id} className="design-item done">
                <span>{TYPE_EMOJI[d.type]} {d.title}</span>
                <button onClick={() => deleteDesign(d.id)}>🗑️</button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

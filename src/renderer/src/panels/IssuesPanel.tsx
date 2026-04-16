import React, { useState, useEffect } from 'react';
import { useApi, apiPost, apiPatch, apiDelete } from '../hooks/useApi';
import { Issue } from '../../../shared/types';
import { useWebSocket } from '../hooks/useWebSocket';
import ChatCommands from '../components/ChatCommands';

export default function IssuesPanel() {
  const { data: bugs, refetch } = useApi<Issue[]>('/issues');
  const [newIssue, setNewIssue] = useState('');
  const [cooldown, setCooldown] = useState(0);

  const [spinning, setSpinning] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);

  useWebSocket((event, data) => {
    if (event === 'issue-created' || event === 'issue-updated' || event === 'issue-deleted') refetch();
    if (event === 'roulette-cooldown') setCooldown((data as { remaining_seconds: number }).remaining_seconds);
    if (event === 'roulette-result') {
      const result = data as { title: string; id: number };
      const found = bugs?.find((b) => b.id === result.id);
      if (found) setSelectedIssue(found);
      setSpinning(false);
    }
  });

  // Cooldown countdown
  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown > 0]);

  const addIssue = async () => {
    if (!newIssue.trim()) return;
    await apiPost('/issues', { title: newIssue });
    setNewIssue('');
    refetch();
  };

  const fixIssue = async (id: number) => {
    await apiPatch(`/issues/${id}`, { status: 'fixed' });
    refetch();
  };

  const deleteIssue = async (id: number) => {
    await apiDelete(`/issues/${id}`);
    refetch();
  };

  const spinRoulette = async () => {
    const openIssues = bugs?.filter((b) => b.status === 'open') || [];
    if (openIssues.length === 0) return;

    setSpinning(true);
    setSelectedIssue(null);

    const result = await apiPost<{ winner: { id: number; title: string } }>('/actions/roulette', {});
    if (!result) {
      setSpinning(false);
    }
    // Result comes back via WebSocket 'roulette-result' event
  };

  const openIssues = bugs?.filter((b) => b.status === 'open') || [];
  const fixedIssues = bugs?.filter((b) => b.status === 'fixed') || [];

  return (
    <div className="panel issues-panel">
      <h2>🎯 Glücksrad</h2>
      <p className="panel-desc">Issues sammeln, Rad drehen, Chat entscheidet was dran kommt.</p>

      <div className="issue-input">
        <input
          type="text"
          placeholder="Neues Issue..."
          value={newIssue}
          onChange={(e) => setNewIssue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addIssue()}
        />
        <button onClick={addIssue}>+</button>
      </div>

      <button
        className="btn-roulette"
        onClick={spinRoulette}
        disabled={spinning || openIssues.length === 0 || cooldown > 0}
      >
        {spinning ? '🎰 Spinning...' : cooldown > 0 ? `⏳ Cooldown ${cooldown}s` : '🎰 Drehen!'}
      </button>

      {selectedIssue && !spinning && (
        <div className="roulette-result">
          ➡️ <strong>{selectedIssue.title}</strong>
        </div>
      )}

      <div className="issue-list">
        <h3>Offen ({openIssues.length})</h3>
        {openIssues.map((bug) => (
          <div key={bug.id} className="issue-item">
            <span>{bug.title}</span>
            <div className="issue-actions">
              <button onClick={() => fixIssue(bug.id)}>✅</button>
              <button onClick={() => deleteIssue(bug.id)}>🗑️</button>
            </div>
          </div>
        ))}
        {fixedIssues.length > 0 && (
          <>
            <h3>Gefixt ({fixedIssues.length})</h3>
            {fixedIssues.map((bug) => (
              <div key={bug.id} className="issue-item fixed">
                <span>{bug.title}</span>
              </div>
            ))}
          </>
        )}
      </div>
      <ChatCommands commands={[
        { cmd: '!issues', desc: 'Zeigt offene Issues' },
      ]} />
    </div>
  );
}

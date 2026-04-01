import React, { useState, useEffect } from 'react';
import { useApi, apiPost, apiPatch, apiDelete } from '../hooks/useApi';
import { Bug } from '../../../shared/types';
import { useWebSocket } from '../hooks/useWebSocket';
import ChatCommands from '../components/ChatCommands';

export default function BugsPanel() {
  const { data: bugs, refetch } = useApi<Bug[]>('/bugs');
  const [newBug, setNewBug] = useState('');
  const [cooldown, setCooldown] = useState(0);

  const [spinning, setSpinning] = useState(false);
  const [selectedBug, setSelectedBug] = useState<Bug | null>(null);

  useWebSocket((event, data) => {
    if (event === 'bug-created' || event === 'bug-updated' || event === 'bug-deleted') refetch();
    if (event === 'roulette-cooldown') setCooldown((data as { remaining_seconds: number }).remaining_seconds);
    if (event === 'roulette-result') {
      const result = data as { title: string; id: number };
      const found = bugs?.find((b) => b.id === result.id);
      if (found) setSelectedBug(found);
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

  const addBug = async () => {
    if (!newBug.trim()) return;
    await apiPost('/bugs', { title: newBug });
    setNewBug('');
    refetch();
  };

  const fixBug = async (id: number) => {
    await apiPatch(`/bugs/${id}`, { status: 'fixed' });
    refetch();
  };

  const deleteBug = async (id: number) => {
    await apiDelete(`/bugs/${id}`);
    refetch();
  };

  const spinRoulette = async () => {
    const openBugs = bugs?.filter((b) => b.status === 'open') || [];
    if (openBugs.length === 0) return;

    setSpinning(true);
    setSelectedBug(null);

    const result = await apiPost<{ winner: { id: number; title: string } }>('/actions/roulette', {});
    if (!result) {
      setSpinning(false);
    }
    // Result comes back via WebSocket 'roulette-result' event
  };

  const openBugs = bugs?.filter((b) => b.status === 'open') || [];
  const fixedBugs = bugs?.filter((b) => b.status === 'fixed') || [];

  return (
    <div className="panel bugs-panel">
      <h2>🐛 Bug-Roulette</h2>
      <p className="panel-desc">Bugs sammeln, Rad drehen, Chat entscheidet was gefixt wird.</p>

      <div className="bug-input">
        <input
          type="text"
          placeholder="Neuer Bug..."
          value={newBug}
          onChange={(e) => setNewBug(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addBug()}
        />
        <button onClick={addBug}>+</button>
      </div>

      <button
        className="btn-roulette"
        onClick={spinRoulette}
        disabled={spinning || openBugs.length === 0 || cooldown > 0}
      >
        {spinning ? '🎰 Spinning...' : cooldown > 0 ? `⏳ Cooldown ${cooldown}s` : '🎰 Drehen!'}
      </button>

      {selectedBug && !spinning && (
        <div className="roulette-result">
          ➡️ <strong>{selectedBug.title}</strong>
        </div>
      )}

      <div className="bug-list">
        <h3>Offen ({openBugs.length})</h3>
        {openBugs.map((bug) => (
          <div key={bug.id} className="bug-item">
            <span>{bug.title}</span>
            <div className="bug-actions">
              <button onClick={() => fixBug(bug.id)}>✅</button>
              <button onClick={() => deleteBug(bug.id)}>🗑️</button>
            </div>
          </div>
        ))}
        {fixedBugs.length > 0 && (
          <>
            <h3>Gefixt ({fixedBugs.length})</h3>
            {fixedBugs.map((bug) => (
              <div key={bug.id} className="bug-item fixed">
                <span>{bug.title}</span>
              </div>
            ))}
          </>
        )}
      </div>
      <ChatCommands commands={[
        { cmd: '!bugs', desc: 'Zeigt offene Bugs' },
      ]} />
    </div>
  );
}

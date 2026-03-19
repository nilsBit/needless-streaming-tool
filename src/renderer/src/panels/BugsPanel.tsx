import React, { useState } from 'react';
import { useApi, apiPost, apiPatch, apiDelete } from '../hooks/useApi';
import { Bug } from '../../../shared/types';
import { useWebSocket } from '../hooks/useWebSocket';
import ChatCommands from '../components/ChatCommands';

export default function BugsPanel() {
  const { data: bugs, refetch } = useApi<Bug[]>('/bugs');
  const [newBug, setNewBug] = useState('');

  useWebSocket((event) => {
    if (event === 'bug-created' || event === 'bug-updated' || event === 'bug-deleted') refetch();
  });
  const [spinning, setSpinning] = useState(false);
  const [selectedBug, setSelectedBug] = useState<Bug | null>(null);

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

  const spinRoulette = () => {
    const openBugs = bugs?.filter((b) => b.status === 'open') || [];
    if (openBugs.length === 0) return;

    setSpinning(true);
    setSelectedBug(null);

    let count = 0;
    const spin = () => {
      const random = openBugs[Math.floor(Math.random() * openBugs.length)];
      setSelectedBug(random);
      count++;
      if (count > 15) {
        setSpinning(false);
        return;
      }
      setTimeout(spin, 100 + count * 30);
    };
    spin();
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
        disabled={spinning || openBugs.length === 0}
      >
        {spinning ? '🎰 Spinning...' : '🎰 Drehen!'}
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

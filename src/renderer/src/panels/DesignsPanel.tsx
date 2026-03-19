import React, { useState } from 'react';
import { useApi, apiPost, apiPatch, apiDelete } from '../hooks/useApi';

interface Design {
  id: number;
  title: string;
  type: string;
  poll_data: string | null;
  status: string;
  created_at: string;
}

const TYPE_EMOJI: Record<string, string> = {
  enemy: '👾',
  weapon: '🗡️',
  upgrade: '⬆️',
};

export default function DesignsPanel() {
  const { data: designs, refetch } = useApi<Design[]>('/designs');
  const [title, setTitle] = useState('');
  const [type, setType] = useState('enemy');

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

  const active = designs?.filter((d) => d.status === 'active') || [];
  const completed = designs?.filter((d) => d.status === 'completed') || [];

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

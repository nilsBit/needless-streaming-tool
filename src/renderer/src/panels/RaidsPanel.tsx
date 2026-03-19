import React, { useState } from 'react';
import { useApi, apiPatch } from '../hooks/useApi';
import { Raid } from '../../../shared/types';
import ChatCommands from '../components/ChatCommands';

const TIER_EMOJI: Record<string, string> = {
  mob: '🗡️',
  elite: '⚔️',
  'mini-boss': '💀',
  boss: '👑',
};

export default function RaidsPanel() {
  const { data: raids, refetch } = useApi<Raid[]>('/raids');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [enemyName, setEnemyName] = useState('');

  const setRaidStatus = async (id: number, status: string) => {
    await apiPatch(`/raids/${id}`, { status });
    refetch();
  };

  const saveEnemyName = async (id: number) => {
    await apiPatch(`/raids/${id}`, { enemy_name: enemyName });
    setEditingId(null);
    setEnemyName('');
    refetch();
  };

  const pending = raids?.filter((r) => r.status === 'pending') || [];
  const built = raids?.filter((r) => r.status !== 'pending') || [];

  return (
    <div className="panel raids-panel">
      <h2>⚔️ Raid-Boss Queue</h2>
      <p className="panel-desc">Raids werden automatisch getrackt. Jeder Raider wird zum Enemy im Spiel.</p>

      <div className="raid-list">
        {pending.length === 0 && <p className="empty">Keine Raids in der Queue</p>}
        {pending.map((raid) => (
          <div key={raid.id} className="raid-item">
            <div className="raid-info">
              <span className="raid-tier">{TIER_EMOJI[raid.enemy_tier] || '❓'}</span>
              <span className="raid-name">{raid.streamer_name}</span>
              <span className="raid-viewers">{raid.viewer_count} Viewer</span>
              <span className="raid-tier-label">{raid.enemy_tier}</span>
            </div>

            {editingId === raid.id ? (
              <div className="raid-edit">
                <input
                  type="text"
                  placeholder="Enemy-Name..."
                  value={enemyName}
                  onChange={(e) => setEnemyName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && saveEnemyName(raid.id)}
                />
                <button onClick={() => saveEnemyName(raid.id)}>💾</button>
              </div>
            ) : (
              <div className="raid-actions">
                {raid.enemy_name && <span className="enemy-name">→ {raid.enemy_name}</span>}
                <button onClick={() => { setEditingId(raid.id); setEnemyName(raid.enemy_name || ''); }}>✏️</button>
                <button onClick={() => setRaidStatus(raid.id, 'built')}>🔨</button>
                <button onClick={() => setRaidStatus(raid.id, 'in-game')}>🎮</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {built.length > 0 && (
        <div className="raid-built">
          <h3>Erledigt ({built.length})</h3>
          {built.map((raid) => (
            <div key={raid.id} className="raid-item done">
              <span>{TIER_EMOJI[raid.enemy_tier]} {raid.streamer_name}</span>
              <span className="enemy-name">{raid.enemy_name || '—'}</span>
              <span className="raid-status-label">{raid.status}</span>
            </div>
          ))}
        </div>
      )}
      <ChatCommands commands={[
        { cmd: '!raid-stats', desc: 'Zeigt Raid-Boss Queue' },
      ]} />
    </div>
  );
}

import React from 'react';
import { useApi, apiPatch, apiDelete } from '../hooks/useApi';
import { Reward } from '../../../shared/types';
import { useWebSocket } from '../hooks/useWebSocket';
import ChatCommands from '../components/ChatCommands';

const REWARD_LABELS: Record<string, string> = {
  spawn_enemys: '💥 Spawn 50 Enemys',
  name_enemy: '📛 Enemy benennen',
  bug_roulette: '🎰 Bug-Roulette',
  feature_request: '💡 Feature Request',
  change_music: '🎵 Musik wechseln',
};

export default function RewardsPanel() {
  const { data: rewards, refetch } = useApi<Reward[]>('/rewards');

  // Live-Update wenn neuer Reward reinkommt
  useWebSocket((event) => {
    if (event === 'reward-redeemed' || event === 'reward-updated') {
      refetch();
    }
  });

  const markDone = async (id: number) => {
    await apiPatch(`/rewards/${id}`, { status: 'done' });
    refetch();
  };

  const clearDone = async () => {
    await apiDelete('/rewards/clear-done');
    refetch();
  };

  const pending = rewards?.filter((r) => r.status === 'pending') || [];
  const done = rewards?.filter((r) => r.status === 'done') || [];

  return (
    <div className="panel rewards-panel">
      <h2>🎁 Rewards</h2>
      <p className="panel-desc">Channel Point Rewards die eingelöst wurden. Abhaken wenn erledigt.</p>

      <div className="reward-list">
        {pending.length === 0 && <p className="empty">Keine offenen Rewards</p>}
        {pending.map((r) => {
          const parsed = r.data ? JSON.parse(r.data) : {};
          const userInput = parsed.user_input || '';
          return (
            <div key={r.id} className="reward-item">
              <div className="reward-info">
                <span className="reward-user">{r.user_name}</span>
                <span className="reward-type">{REWARD_LABELS[r.reward_type] || r.reward_type}</span>
                {userInput && <span className="reward-input">"{userInput}"</span>}
              </div>
              <button onClick={() => markDone(r.id)}>✅</button>
            </div>
          );
        })}

        {done.length > 0 && (
          <>
            <h3>Erledigt ({done.length})</h3>
            <button onClick={clearDone}>🗑️ Erledigte löschen</button>
            {done.slice(0, 10).map((r) => (
              <div key={r.id} className="reward-item done">
                <span>{r.user_name}</span>
                <span>{REWARD_LABELS[r.reward_type] || r.reward_type}</span>
              </div>
            ))}
          </>
        )}
      </div>
      <ChatCommands commands={[
        { cmd: '500 CP', desc: 'Spawn 50 Enemys' },
        { cmd: '1.000 CP', desc: 'Enemy nach mir benennen' },
        { cmd: '2.000 CP', desc: 'Bug-Roulette drehen' },
        { cmd: '5.000 CP', desc: 'Feature Request' },
        { cmd: '200 CP', desc: 'Musik wechseln' },
      ]} />
    </div>
  );
}

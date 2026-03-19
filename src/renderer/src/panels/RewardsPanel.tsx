import React from 'react';
import { useApi, apiPatch } from '../hooks/useApi';

interface Reward {
  id: number;
  user_name: string;
  reward_type: string;
  data: string | null;
  status: string;
  created_at: string;
}

const REWARD_LABELS: Record<string, string> = {
  spawn_enemys: '💥 Spawn 50 Enemys',
  name_enemy: '📛 Enemy benennen',
  bug_roulette: '🎰 Bug-Roulette',
  feature_request: '💡 Feature Request',
  change_music: '🎵 Musik wechseln',
};

export default function RewardsPanel() {
  const { data: rewards, refetch } = useApi<Reward[]>('/rewards');

  const markDone = async (id: number) => {
    await apiPatch(`/rewards/${id}`, { status: 'done' });
    refetch();
  };

  const pending = rewards?.filter((r) => r.status === 'pending') || [];
  const done = rewards?.filter((r) => r.status === 'done') || [];

  return (
    <div className="panel rewards-panel">
      <h2>🎁 Rewards</h2>

      <div className="reward-list">
        {pending.length === 0 && <p className="empty">Keine offenen Rewards</p>}
        {pending.map((r) => (
          <div key={r.id} className="reward-item">
            <div className="reward-info">
              <span className="reward-user">{r.user_name}</span>
              <span className="reward-type">{REWARD_LABELS[r.reward_type] || r.reward_type}</span>
            </div>
            <button onClick={() => markDone(r.id)}>✅</button>
          </div>
        ))}

        {done.length > 0 && (
          <>
            <h3>Erledigt ({done.length})</h3>
            {done.slice(0, 10).map((r) => (
              <div key={r.id} className="reward-item done">
                <span>{r.user_name}</span>
                <span>{REWARD_LABELS[r.reward_type] || r.reward_type}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

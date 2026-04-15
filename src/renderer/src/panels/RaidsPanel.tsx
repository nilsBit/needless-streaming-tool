import React from 'react';
import { useApi } from '../hooks/useApi';
import { useWebSocket } from '../hooks/useWebSocket';

interface Raid {
  id: number;
  streamer_name: string;
  viewer_count: number;
  enemy_tier: string;
  enemy_name: string | null;
  status: string;
  created_at: string;
}

export default function RaidsPanel() {
  const { data: raids, refetch } = useApi<Raid[]>('/raids');

  useWebSocket((event) => {
    if (event === 'raid-created' || event === 'raid-deleted') refetch();
  });

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="panel raids-panel">
      <h2>⚔️ Raids</h2>
      <p className="panel-desc">Übersicht aller eingegangenen Raids.</p>

      <div className="raids-list">
        {(!raids || raids.length === 0) && <p className="empty">Noch keine Raids</p>}
        {raids?.map((r) => (
          <div key={r.id} className="raid-item">
            <span className="raid-streamer">{r.streamer_name}</span>
            <span className="raid-viewers">{r.viewer_count} Zuschauer</span>
            <span className="raid-time">{formatTime(r.created_at)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

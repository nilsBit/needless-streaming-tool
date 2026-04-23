import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useApi, apiGet } from '../hooks/useApi';
import { useWebSocket } from '../hooks/useWebSocket';

interface StatRow {
  user_name: string;
  reward_type?: string;
  count: number;
  last_redeemed_at: string;
}

interface LogRow {
  id: number;
  user_name: string;
  reward_type: string;
  reward_title: string;
  user_input: string;
  created_at: string;
}

interface LogResponse {
  items: LogRow[];
  total: number;
}

type View = 'leaderboard' | 'log';

const DEBOUNCE_MS = 2000;

export default function RewardStatsPanel() {
  const [view, setView] = useState<View>('leaderboard');
  const [typeFilter, setTypeFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [logOffset, setLogOffset] = useState(0);
  const [logData, setLogData] = useState<LogResponse | null>(null);
  const [types, setTypes] = useState<string[]>([]);
  const [sortField, setSortField] = useState<'count' | 'last_redeemed_at' | 'user_name'>('count');
  const [sortAsc, setSortAsc] = useState(false);

  // Leaderboard data
  const leaderboardUrl = typeFilter
    ? `/reward-stats?type=${encodeURIComponent(typeFilter)}&limit=50`
    : '/reward-stats?limit=50';
  const { data: leaderboard, loading, refetch } = useApi<StatRow[]>(leaderboardUrl);

  // Debounced refetch on reward events
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useWebSocket((event) => {
    if (event === 'reward-redeemed') {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        refetch();
        if (view === 'log') fetchLog();
      }, DEBOUNCE_MS);
    }
  });

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  // Fetch available reward types for the filter dropdown
  useEffect(() => {
    apiGet<string[]>('/reward-stats/types').then((res) => {
      if (res) setTypes(res);
    });
  }, []);

  // Fetch log data
  const fetchLog = useCallback(() => {
    const params = new URLSearchParams();
    if (userFilter) params.set('user', userFilter);
    if (typeFilter) params.set('type', typeFilter);
    params.set('offset', String(logOffset));
    params.set('limit', '50');
    apiGet<LogResponse>(`/reward-stats/log?${params}`).then((res) => {
      if (res) setLogData(res);
    });
  }, [userFilter, typeFilter, logOffset]);

  useEffect(() => {
    if (view === 'log') fetchLog();
  }, [view, fetchLog]);

  const showUserLog = (username: string) => {
    setUserFilter(username);
    setLogOffset(0);
    setView('log');
  };

  return (
    <div className="panel reward-stats-panel">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2>🏆 Reward Stats</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className={`tab-btn ${view === 'leaderboard' ? 'active' : ''}`}
            onClick={() => setView('leaderboard')}
          >
            Leaderboard
          </button>
          <button
            className={`tab-btn ${view === 'log' ? 'active' : ''}`}
            onClick={() => { setView('log'); setLogOffset(0); }}
          >
            Log
          </button>
        </div>
      </div>

      {/* Type filter */}
      <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setLogOffset(0); }}
          style={{ padding: '4px 8px', background: '#1a1a1a', border: '1px solid #333', borderRadius: 4, color: '#ccc', fontSize: 12 }}
        >
          <option value="">Alle Typen</option>
          {types.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        {view === 'log' && (
          <input
            type="text"
            placeholder="Username suchen..."
            value={userFilter}
            onChange={(e) => { setUserFilter(e.target.value); setLogOffset(0); }}
            style={{ padding: '4px 8px', background: '#1a1a1a', border: '1px solid #333', borderRadius: 4, color: '#ccc', fontSize: 12, flex: 1 }}
          />
        )}
      </div>

      {view === 'leaderboard' && (() => {
        const sorted = leaderboard ? [...leaderboard].sort((a, b) => {
          let cmp = 0;
          if (sortField === 'count') cmp = a.count - b.count;
          else if (sortField === 'user_name') cmp = a.user_name.localeCompare(b.user_name);
          else if (sortField === 'last_redeemed_at') cmp = new Date(a.last_redeemed_at).getTime() - new Date(b.last_redeemed_at).getTime();
          return sortAsc ? cmp : -cmp;
        }) : null;

        const toggleSort = (field: typeof sortField) => {
          if (sortField === field) setSortAsc(!sortAsc);
          else { setSortField(field); setSortAsc(false); }
        };

        const sortIcon = (field: typeof sortField) => sortField === field ? (sortAsc ? ' ▲' : ' ▼') : '';
        const thStyle = { padding: '6px 8px', cursor: 'pointer', userSelect: 'none' as const };

        return (
        <div>
          {loading ? (
            <p style={{ color: '#666' }}>Laden...</p>
          ) : !sorted || sorted.length === 0 ? (
            <p style={{ color: '#666' }}>Noch keine Reward-Daten vorhanden.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #333', color: '#888' }}>
                  <th style={{ textAlign: 'left', padding: '6px 8px' }}>#</th>
                  <th style={{ textAlign: 'left', ...thStyle }} onClick={() => toggleSort('user_name')}>User{sortIcon('user_name')}</th>
                  {typeFilter && <th style={{ textAlign: 'left', padding: '6px 8px' }}>Typ</th>}
                  <th style={{ textAlign: 'right', ...thStyle }} onClick={() => toggleSort('count')}>Anzahl{sortIcon('count')}</th>
                  <th style={{ textAlign: 'right', ...thStyle }} onClick={() => toggleSort('last_redeemed_at')}>Letztes Mal{sortIcon('last_redeemed_at')}</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((row, i) => (
                  <tr key={row.user_name + (row.reward_type || '')} style={{ borderBottom: '1px solid #222' }}>
                    <td style={{ padding: '6px 8px', color: '#666' }}>{i + 1}</td>
                    <td style={{ padding: '6px 8px' }}>
                      <button
                        onClick={() => showUserLog(row.user_name)}
                        style={{ background: 'none', border: 'none', color: '#e67e22', cursor: 'pointer', padding: 0, fontSize: 12 }}
                      >
                        {row.user_name}
                      </button>
                    </td>
                    {typeFilter && <td style={{ padding: '6px 8px', color: '#888' }}>{row.reward_type}</td>}
                    <td style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600 }}>{row.count}</td>
                    <td style={{ textAlign: 'right', padding: '6px 8px', color: '#888' }}>
                      {new Date(row.last_redeemed_at).toLocaleDateString('de-DE')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        );
      })()}

      {view === 'log' && (
        <div>
          {!logData ? (
            <p style={{ color: '#666' }}>Laden...</p>
          ) : logData.items.length === 0 ? (
            <p style={{ color: '#666' }}>Keine Einträge gefunden.</p>
          ) : (
            <>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #333', color: '#888' }}>
                    <th style={{ textAlign: 'left', padding: '6px 8px' }}>Zeit</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px' }}>User</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px' }}>Reward</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px' }}>Input</th>
                  </tr>
                </thead>
                <tbody>
                  {logData.items.map((row) => (
                    <tr key={row.id} style={{ borderBottom: '1px solid #222' }}>
                      <td style={{ padding: '6px 8px', color: '#888', whiteSpace: 'nowrap' }}>
                        {new Date(row.created_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td style={{ padding: '6px 8px' }}>{row.user_name}</td>
                      <td style={{ padding: '6px 8px', color: '#888' }}>{row.reward_title}</td>
                      <td style={{ padding: '6px 8px', color: '#666', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row.user_input || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, fontSize: 11, color: '#666' }}>
                <span>{logData.total} Einträge</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    disabled={logOffset === 0}
                    onClick={() => setLogOffset(Math.max(0, logOffset - 50))}
                    style={{ padding: '2px 8px', background: '#1a1a1a', border: '1px solid #333', borderRadius: 4, color: '#ccc', cursor: 'pointer', fontSize: 11 }}
                  >
                    ← Zurück
                  </button>
                  <button
                    disabled={logOffset + 50 >= logData.total}
                    onClick={() => setLogOffset(logOffset + 50)}
                    style={{ padding: '2px 8px', background: '#1a1a1a', border: '1px solid #333', borderRadius: 4, color: '#ccc', cursor: 'pointer', fontSize: 11 }}
                  >
                    Weiter →
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

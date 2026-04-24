import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useApi, apiGet, apiPost, apiDelete } from '../hooks/useApi';
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
  const [showAddForm, setShowAddForm] = useState(false);
  const [addUser, setAddUser] = useState('');
  const [addType, setAddType] = useState('');
  const [addCount, setAddCount] = useState('');
  const [editingRow, setEditingRow] = useState<{ user_name: string; reward_type: string } | null>(null);
  const [editCount, setEditCount] = useState('');

  // Leaderboard data
  const leaderboardUrl = typeFilter
    ? `/reward-stats?type=${encodeURIComponent(typeFilter)}&limit=50`
    : '/reward-stats?limit=50';
  const { data: leaderboard, loading, refetch } = useApi<StatRow[]>(leaderboardUrl);

  const fetchTypes = useCallback(() => {
    apiGet<string[]>('/reward-stats/types').then((res) => {
      if (res) setTypes(res);
    });
  }, []);

  useEffect(() => { fetchTypes(); }, [fetchTypes]);

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

  const viewRef = useRef(view);
  viewRef.current = view;
  const fetchLogRef = useRef(fetchLog);
  fetchLogRef.current = fetchLog;

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useWebSocket((event) => {
    if (event === 'reward-redeemed') {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        refetch();
        fetchTypes();
        if (viewRef.current === 'log') fetchLogRef.current();
      }, DEBOUNCE_MS);
    }
  });

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  useEffect(() => {
    if (view === 'log') fetchLog();
  }, [view, fetchLog]);

  const sorted = useMemo(() => {
    if (!leaderboard) return null;
    return [...leaderboard].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'count') cmp = a.count - b.count;
      else if (sortField === 'user_name') cmp = a.user_name.localeCompare(b.user_name);
      else if (sortField === 'last_redeemed_at') cmp = new Date(a.last_redeemed_at).getTime() - new Date(b.last_redeemed_at).getTime();
      return sortAsc ? cmp : -cmp;
    });
  }, [leaderboard, sortField, sortAsc]);

  const toggleSort = useCallback((field: typeof sortField) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(false); }
  }, [sortField, sortAsc]);

  const sortIcon = (field: 'count' | 'last_redeemed_at' | 'user_name') => sortField === field ? (sortAsc ? ' ▲' : ' ▼') : '';

  const showUserLog = (username: string) => {
    setUserFilter(username);
    setLogOffset(0);
    setView('log');
  };

  const handleAdd = async () => {
    if (!addUser.trim() || !addType.trim() || !addCount.trim()) return;
    await apiPost('/reward-stats', { user_name: addUser.trim(), reward_type: addType.trim(), count: Number(addCount) });
    setAddUser(''); setAddType(''); setAddCount('');
    setShowAddForm(false);
    refetch(); fetchTypes();
  };

  const handleEdit = async (userName: string, rewardType: string) => {
    if (!editCount.trim()) return;
    await apiPost('/reward-stats', { user_name: userName, reward_type: rewardType, count: Number(editCount) });
    setEditingRow(null); setEditCount('');
    refetch();
  };

  const handleDelete = async (userName: string, rewardType: string) => {
    await apiDelete(`/reward-stats/${encodeURIComponent(userName)}/${encodeURIComponent(rewardType)}`);
    refetch(); fetchTypes();
  };

  const thStyle = { padding: '6px 8px', cursor: 'pointer', userSelect: 'none' as const };

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
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            style={{ padding: '4px 10px', background: showAddForm ? '#333' : '#1a1a1a', border: '1px solid #444', borderRadius: 4, color: '#ccc', cursor: 'pointer', fontSize: 12 }}
          >
            + Nachtragen
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

      {showAddForm && (
        <div style={{ marginBottom: 12, padding: 10, background: '#1a1a1a', border: '1px solid #333', borderRadius: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Username"
            value={addUser}
            onChange={(e) => setAddUser(e.target.value)}
            style={{ padding: '4px 8px', background: '#111', border: '1px solid #333', borderRadius: 4, color: '#ccc', fontSize: 12, width: 140 }}
          />
          <input
            type="text"
            placeholder="Reward-Typ"
            value={addType}
            onChange={(e) => setAddType(e.target.value)}
            list="reward-types"
            style={{ padding: '4px 8px', background: '#111', border: '1px solid #333', borderRadius: 4, color: '#ccc', fontSize: 12, width: 140 }}
          />
          <datalist id="reward-types">
            {types.map((t) => <option key={t} value={t} />)}
          </datalist>
          <input
            type="number"
            placeholder="Anzahl"
            value={addCount}
            onChange={(e) => setAddCount(e.target.value)}
            min="0"
            style={{ padding: '4px 8px', background: '#111', border: '1px solid #333', borderRadius: 4, color: '#ccc', fontSize: 12, width: 80 }}
          />
          <button
            onClick={handleAdd}
            disabled={!addUser.trim() || !addType.trim() || !addCount.trim()}
            style={{ padding: '4px 12px', background: '#2d5a27', border: '1px solid #3a7a33', borderRadius: 4, color: '#ccc', cursor: 'pointer', fontSize: 12 }}
          >
            Speichern
          </button>
        </div>
      )}

      {view === 'leaderboard' && (
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
                  {typeFilter && <th style={{ textAlign: 'right', padding: '6px 8px' }}></th>}
                </tr>
              </thead>
              <tbody>
                {sorted.map((row, i) => {
                  const isEditing = editingRow && editingRow.user_name === row.user_name && editingRow.reward_type === (row.reward_type || '');
                  return (
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
                    <td style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600 }}>
                      {isEditing ? (
                        <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                          <input
                            type="number"
                            value={editCount}
                            onChange={(e) => setEditCount(e.target.value)}
                            autoFocus
                            onKeyDown={(e) => { if (e.key === 'Enter') handleEdit(row.user_name, row.reward_type || ''); if (e.key === 'Escape') setEditingRow(null); }}
                            style={{ width: 60, padding: '2px 4px', background: '#111', border: '1px solid #444', borderRadius: 3, color: '#ccc', fontSize: 12, textAlign: 'right' }}
                          />
                          <button onClick={() => handleEdit(row.user_name, row.reward_type || '')} style={{ background: 'none', border: 'none', color: '#4caf50', cursor: 'pointer', fontSize: 12 }}>✓</button>
                          <button onClick={() => setEditingRow(null)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 12 }}>✕</button>
                        </span>
                      ) : row.count}
                    </td>
                    <td style={{ textAlign: 'right', padding: '6px 8px', color: '#888' }}>
                      {new Date(row.last_redeemed_at).toLocaleDateString('de-DE')}
                    </td>
                    {typeFilter && (
                      <td style={{ textAlign: 'right', padding: '6px 8px', whiteSpace: 'nowrap' }}>
                        <button
                          onClick={() => { setEditingRow({ user_name: row.user_name, reward_type: row.reward_type || '' }); setEditCount(String(row.count)); }}
                          style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 11, marginRight: 4 }}
                          title="Bearbeiten"
                        >✎</button>
                        <button
                          onClick={() => { if (confirm(`"${row.user_name}" (${row.reward_type}) wirklich löschen?`)) handleDelete(row.user_name, row.reward_type || ''); }}
                          style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 11 }}
                          title="Löschen"
                        >🗑</button>
                      </td>
                    )}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

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

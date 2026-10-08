import React, { useMemo, useRef, useState } from 'react';
import { useApi, apiPost, apiPatch, apiDelete } from '../hooks/useApi';
import { useWebSocket } from '../hooks/useWebSocket';
import { useToast } from '../contexts/ToastContext';
import Dialog from '../components/ux/Dialog';
import LeaderboardQuestPath from '../components/quests/paths/LeaderboardQuestPath';

interface Leaderboard { key: string; title: string; reward_id: string; reward_title: string; viewers: number }
interface Row { user_name: string; count: number; last_redeemed_at: string }
interface TwitchReward { id: string; title: string }

const day = (iso: string) => new Date(iso.includes('T') ? iso : iso + 'Z').toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

// "Bestenlisten" under Overlays & Alerts: every list as a row — name,
// reward, how many viewers — and, opened, its ranking with corrections.
// A list hangs on one Twitch reward, chosen from the channel's rewards and
// kept by its id; a reward gone from Twitch is said so until another is chosen.
export default function LeaderboardsPanel() {
  const { data: lists, refetch: refetchLists } = useApi<Leaderboard[]>('/leaderboards');
  const { data: rewardsData } = useApi<{ rewards: TwitchReward[]; error?: string }>('/auth/twitch/rewards');
  const { data: botStatus } = useApi<{ connected: boolean }>('/settings/bot-status');
  const [openKey, setOpenKey] = useState<string | null>(null);
  // New lists are made on a Quest-Pfad.
  const [path, setPath] = useState(false);

  const rewards = rewardsData?.rewards ?? [];
  const listLoaded = !!botStatus?.connected && !!rewardsData && !rewardsData.error;
  const gone = (l: Leaderboard) => listLoaded && !rewards.some((r) => r.id === l.reward_id);
  const taken = new Set((lists ?? []).map((l) => l.reward_id));

  const open = (lists ?? []).find((l) => l.key === openKey) ?? null;

  return (
    <div className="panel card-slim rewards">
      <div className="card-line card-wrap">
        <p className="dialog-hint" style={{ margin: 0 }}>Jede Liste zählt die Einlösungen einer Belohnung. Die Overlays dazu stehen unter Overlays, je Liste eine Bestenliste und ein Rangwechsel.</p>
        <button type="button" className="card-primary" onClick={() => setPath(true)} disabled={!listLoaded} title={listLoaded ? undefined : 'Mit Twitch verbinden, um eine Liste anzulegen'}>+ Bestenliste</button>
      </div>
      {!listLoaded && <p className="dialog-hint" style={{ margin: 0 }}>Twitch ist nicht verbunden – Listen anlegen und Belohnungen wählen geht erst dann.</p>}
      {lists && lists.length === 0 && <p className="dialog-empty">Noch keine Bestenliste. Lege eine an und wähle die Belohnung, die zählen soll.</p>}

      <section className="rewards-ranking" aria-label="Bestenlisten">
        {(lists ?? []).map((l) => (
          <div key={l.key} className="rewards-row">
            <div className="rewards-who">
              <div className="rewards-name">{l.title}</div>
              <div className="dialog-hint">Belohnung „{l.reward_title}“{gone(l) ? ' – gibt es in Twitch nicht mehr' : ''}</div>
            </div>
            <div className="rewards-total"><div className="rewards-total-n">{l.viewers}</div><div className="dialog-hint">Zuschauer</div></div>
            <button type="button" className="card-secondary" onClick={() => setOpenKey(l.key)}>Öffnen</button>
          </div>
        ))}
      </section>

      {path && <LeaderboardQuestPath taken={taken} onClose={() => setPath(false)} onCreated={refetchLists} />}

      {open && (
        <ListDialog
          list={open}
          rewards={rewards}
          listLoaded={listLoaded}
          gone={gone(open)}
          taken={taken}
          onClose={() => setOpenKey(null)}
          onChanged={refetchLists}
        />
      )}
    </div>
  );
}

function ListDialog({ list, rewards, listLoaded, gone, taken, onClose, onChanged }: {
  list: Leaderboard; rewards: TwitchReward[]; listLoaded: boolean; gone: boolean; taken: Set<string>; onClose: () => void; onChanged: () => void;
}) {
  const { toast } = useToast();
  const { data: rows, refetch } = useApi<Row[]>(`/leaderboards/${encodeURIComponent(list.key)}/board`);
  const [search, setSearch] = useState('');
  const [title, setTitle] = useState<string | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);
  const [countEdit, setCountEdit] = useState('');
  const [adding, setAdding] = useState<{ user: string; count: string } | null>(null);

  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useWebSocket((event) => {
    if (event !== 'leaderboard-point') return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => { refetch(); onChanged(); }, 1500);
  });

  const viewers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows ?? []).filter((v) => !q || v.user_name.toLowerCase().includes(q));
  }, [rows, search]);

  const rename = async () => {
    if (title === null || !title.trim()) return;
    const result = await apiPatch(`/leaderboards/${encodeURIComponent(list.key)}`, { title: title.trim() });
    if (!result) { toast.error('Nicht umbenannt'); return; }
    toast.success('Umbenannt'); setTitle(null); onChanged();
  };
  const chooseReward = async (id: string) => {
    const reward = rewards.find((r) => r.id === id);
    if (!reward) return;
    const result = await apiPatch(`/leaderboards/${encodeURIComponent(list.key)}`, { reward });
    if (!result) { toast.error('Nicht gespeichert'); return; }
    toast.success(`„${reward.title}“ zählt jetzt für ${list.title}`); onChanged();
  };
  const remove = async () => {
    if (!window.confirm(`Die Bestenliste „${list.title}“ löschen? Die Zählung von ${n(list.viewers, 'Zuschauer', 'Zuschauern')} geht mit.`)) return;
    const ok = await apiDelete(`/leaderboards/${encodeURIComponent(list.key)}`);
    if (!ok) { toast.error('Nicht gelöscht'); return; }
    toast.success('Gelöscht'); onClose(); onChanged();
  };

  const openEdit = (v: Row) => { setEditing(v); setCountEdit(String(v.count)); };
  const saveCount = async () => {
    if (!editing) return;
    const count = Number(countEdit);
    if (!Number.isInteger(count) || count < 0) { toast.error('Eine Anzahl ist eine ganze Zahl.'); return; }
    const result = await apiPost('/reward-stats', { user_name: editing.user_name, reward_type: list.key, count });
    if (!result) { toast.error('Nicht gespeichert'); return; }
    toast.success('Gespeichert'); setEditing({ ...editing, count }); refetch(); onChanged();
  };
  const removeEntry = async () => {
    if (!editing) return;
    if (!window.confirm(`${editing.user_name} aus „${list.title}“ nehmen?`)) return;
    const ok = await apiDelete(`/reward-stats/${encodeURIComponent(editing.user_name)}/${encodeURIComponent(list.key)}`);
    if (!ok) { toast.error('Löschen fehlgeschlagen'); return; }
    setEditing(null); refetch(); onChanged();
  };
  const forget = async () => {
    if (!editing) return;
    if (!window.confirm(`${editing.user_name} vergessen? Alles, was unter diesem Namen gespeichert ist – in jeder Bestenliste, Songwünsche –, wird gelöscht.`)) return;
    const result = await apiPost('/reward-stats/forget', { user_name: editing.user_name });
    if (!result) { toast.error('Nicht gelöscht'); return; }
    toast.success(`${editing.user_name} vergessen`); setEditing(null); refetch(); onChanged();
  };
  const add = async () => {
    if (!adding || !adding.user.trim() || adding.count.trim() === '') return;
    const count = Number(adding.count);
    if (!Number.isInteger(count) || count < 0) { toast.error('Eine Anzahl ist eine ganze Zahl.'); return; }
    const result = await apiPost('/reward-stats', { user_name: adding.user.trim(), reward_type: list.key, count });
    if (!result) { toast.error('Nicht gespeichert'); return; }
    toast.success('Eingetragen'); setAdding(null); refetch(); onChanged();
  };

  return (
    <Dialog
      title={list.title}
      sentence="Die Rangliste, genau so wie das Overlay sie zeigt. Wer ein Jahr nicht einlöst, fällt heraus."
      onClose={onClose}
      width={640}
      footer={<>
        <button type="button" className="card-link" onClick={remove}>Liste löschen</button>
        <span style={{ flex: 1 }} />
        <button type="button" className="card-primary" onClick={onClose}>Fertig</button>
      </>}
    >
      <div className="card-row card-wrap">
        <label htmlFor="lb-rename" className="dialog-field-label">Name</label>
        <input id="lb-rename" type="text" maxLength={45} value={title ?? list.title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && rename()} style={{ width: 180 }} />
        {title !== null && title.trim() !== list.title && <button type="button" className="card-secondary" onClick={rename}>Umbenennen</button>}
      </div>
      <div className="card-row card-wrap">
        <label htmlFor="lb-choose" className="dialog-field-label">Belohnung in Twitch</label>
        <select id="lb-choose" value={list.reward_id} onChange={(e) => chooseReward(e.target.value)} disabled={!listLoaded} style={{ width: 220 }}>
          {!listLoaded && <option value={list.reward_id}>{list.reward_title}</option>}
          {gone && <option value={list.reward_id} disabled>{list.reward_title} (gibt es nicht mehr)</option>}
          {listLoaded && rewards.map((r) => <option key={r.id} value={r.id} disabled={taken.has(r.id) && r.id !== list.reward_id}>{r.title}</option>)}
        </select>
      </div>
      {gone && <p className="dialog-hint" role="alert">Die Belohnung „{list.reward_title}“ gibt es in Twitch nicht mehr – bitte eine andere wählen. Bis dahin zählt diese Liste nichts.</p>}
      {!listLoaded && <p className="dialog-hint">Mit Twitch verbinden, um eine andere Belohnung zu wählen.</p>}

      <div className="card-row card-wrap" style={{ justifyContent: 'space-between' }}>
        <input type="text" placeholder="Zuschauer suchen" aria-label="Zuschauer suchen" value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: '0 0 220px', width: 220 }} />
        <button type="button" className="card-secondary" onClick={() => setAdding({ user: '', count: '' })}>+ Eintrag von Hand</button>
      </div>
      {viewers.length === 0 && <p className="dialog-empty">{rows && rows.length ? 'Niemand passt zur Suche.' : 'Noch hat niemand eingelöst.'}</p>}
      {viewers.map((v, i) => (
        <div key={v.user_name} className="rewards-row">
          <span className="rewards-rank">{i + 1}</span>
          <div className="rewards-who">
            <div className="rewards-name">{v.user_name}</div>
            <div className="dialog-hint">zuletzt {day(v.last_redeemed_at)}</div>
          </div>
          <div className="rewards-total"><div className="rewards-total-n">{v.count}</div><div className="dialog-hint">{v.count === 1 ? 'Einlösung' : 'Einlösungen'}</div></div>
          <button type="button" className="card-secondary" onClick={() => openEdit(v)}>Bearbeiten</button>
        </div>
      ))}

      {editing && (
        <Dialog
          title={editing.user_name}
          sentence="Zahl korrigieren, oder alles zu dieser Person löschen."
          onClose={() => setEditing(null)}
          width={520}
          footer={<>
            <button type="button" className="card-link" onClick={forget}>Zuschauer vergessen</button>
            <span style={{ flex: 1 }} />
            <button type="button" className="card-primary" onClick={() => setEditing(null)}>Fertig</button>
          </>}
        >
          <ul className="dialog-list">
            <li>
              <span className="dialog-list-text">Einlösungen</span>
              <input type="number" min={0} aria-label="Anzahl" value={countEdit} onChange={(e) => setCountEdit(e.target.value)} style={{ width: 90 }} />
              <button type="button" className="card-secondary" onClick={saveCount}>Speichern</button>
              <button type="button" className="card-link" onClick={removeEntry}>Aus der Liste</button>
            </li>
          </ul>
        </Dialog>
      )}

      {adding && (
        <Dialog
          title="Eintrag von Hand"
          sentence="Einlösungen setzen, die das Tool nicht mitbekommen hat."
          onClose={() => setAdding(null)}
          width={520}
          footer={<>
            <button type="button" className="card-secondary" onClick={() => setAdding(null)}>Abbrechen</button>
            <button type="button" className="card-primary" onClick={add} disabled={!adding.user.trim() || adding.count.trim() === ''}>Eintragen</button>
          </>}
        >
          <div className="dialog-grid">
            <div className="dialog-field"><label htmlFor="lb-user">Zuschauer (Twitch-Login)</label><input id="lb-user" type="text" value={adding.user} onChange={(e) => setAdding({ ...adding, user: e.target.value })} autoFocus /></div>
            <div className="dialog-field"><label htmlFor="lb-count">Einlösungen</label><input id="lb-count" type="number" min={0} value={adding.count} onChange={(e) => setAdding({ ...adding, count: e.target.value })} style={{ width: 120 }} /></div>
          </div>
        </Dialog>
      )}
    </Dialog>
  );
}

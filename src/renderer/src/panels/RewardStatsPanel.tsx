import React, { useMemo, useRef, useState } from 'react';
import { useApi, apiPost, apiDelete } from '../hooks/useApi';
import { useWebSocket } from '../hooks/useWebSocket';
import { useToast } from '../contexts/ToastContext';
import Dialog from '../components/ux/Dialog';

interface FlexRow { user_name: string; count: number; last_redeemed_at: string; credits: number }

const day = (iso: string) => new Date(iso.includes('T') ? iso : iso + 'Z').toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

// "Bestenliste" under Nach dem Stream: who flexed most. A "Flex" reward in
// Twitch unlocks a flex, !flex in chat spends it — only that counts, in the
// same order the Bestenliste overlay shows. Corrections, a flex by hand and
// "Zuschauer vergessen" live in dialogs.
export default function RewardStatsPanel() {
  const { toast } = useToast();
  const { data: rows, refetch } = useApi<FlexRow[]>('/reward-stats/breakdown');
  const { data: settings, refetch: refetchSettings } = useApi<{ reward: string }>('/reward-stats/flex-settings');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<FlexRow | null>(null);
  const [countEdit, setCountEdit] = useState('');
  const [adding, setAdding] = useState<{ user: string; count: string } | null>(null);
  const [reward, setReward] = useState<string | null>(null);

  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useWebSocket((event) => {
    if (event !== 'flex' && event !== 'flex-credit' && event !== 'reward-redeemed') return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => refetch(), 1500);
  });

  const viewers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows ?? []).filter((v) => !q || v.user_name.toLowerCase().includes(q));
  }, [rows, search]);

  const saveReward = async () => {
    if (reward === null) return;
    const result = await apiPost<{ reward: string }>('/reward-stats/flex-settings', { reward });
    if (!result) { toast.error('Nicht gespeichert – 1 bis 45 Zeichen'); return; }
    toast.success(`Belohnungen mit „${result.reward}“ im Namen schalten einen Flex frei`);
    setReward(null);
    refetchSettings();
  };

  const openEdit = (v: FlexRow) => { setEditing(v); setCountEdit(String(v.count)); };
  const saveCount = async () => {
    if (!editing) return;
    const count = Number(countEdit);
    if (!Number.isInteger(count) || count < 0) { toast.error('Eine Anzahl ist eine ganze Zahl.'); return; }
    const result = await apiPost('/reward-stats', { user_name: editing.user_name, reward_type: 'flex', count });
    if (!result) { toast.error('Nicht gespeichert'); return; }
    toast.success('Gespeichert');
    setEditing({ ...editing, count });
    refetch();
  };
  const grant = async (login: string) => {
    const result = await apiPost<{ credits: number }>('/reward-stats/flex/credit', { user_name: login });
    if (!result) { toast.error('Nicht freigeschaltet'); return; }
    toast.success(`${login} hat jetzt ${n(result.credits, 'Flex', 'Flexe')} offen`);
    if (editing) setEditing({ ...editing, credits: result.credits });
    refetch();
  };
  const removeEntry = async () => {
    if (!editing) return;
    if (!window.confirm(`Die Flexe von ${editing.user_name} auf null setzen?`)) return;
    const ok = await apiDelete(`/reward-stats/${encodeURIComponent(editing.user_name)}/flex`);
    if (!ok) { toast.error('Löschen fehlgeschlagen'); return; }
    setEditing(null);
    refetch();
  };
  const forget = async () => {
    if (!editing) return;
    if (!window.confirm(`${editing.user_name} vergessen? Alles, was unter diesem Namen gespeichert ist – Flexe, offene Flexe, Songwünsche –, wird gelöscht.`)) return;
    const result = await apiPost('/reward-stats/forget', { user_name: editing.user_name });
    if (!result) { toast.error('Nicht gelöscht'); return; }
    toast.success(`${editing.user_name} vergessen`);
    setEditing(null);
    refetch();
  };
  const add = async () => {
    if (!adding || !adding.user.trim() || adding.count.trim() === '') return;
    const count = Number(adding.count);
    if (!Number.isInteger(count) || count < 0) { toast.error('Eine Anzahl ist eine ganze Zahl.'); return; }
    const result = await apiPost('/reward-stats', { user_name: adding.user.trim(), reward_type: 'flex', count });
    if (!result) { toast.error('Nicht gespeichert'); return; }
    toast.success('Eingetragen');
    setAdding(null);
    refetch();
  };

  const rewardValue = reward ?? settings?.reward ?? '';

  return (
    <div className="panel card-slim rewards">
      <div className="card-line card-wrap">
        <div className="card-row card-wrap">
          <label htmlFor="flex-reward" className="dialog-field-label">Belohnung in Twitch, die einen Flex freischaltet</label>
          <input id="flex-reward" type="text" maxLength={45} value={rewardValue} onChange={(e) => setReward(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveReward()} style={{ width: 180 }} aria-describedby="flex-reward-hint" />
          {reward !== null && reward !== (settings?.reward ?? '') && <button type="button" className="card-primary" onClick={saveReward}>Speichern</button>}
        </div>
        <button type="button" className="card-secondary" onClick={() => setAdding({ user: '', count: '' })}>+ Eintrag von Hand</button>
      </div>
      <p id="flex-reward-hint" className="dialog-hint" style={{ margin: 0 }}>
        Jede Belohnung, die dieses Wort im Namen trägt, schaltet für die Person einen Flex frei. Eingelöst wird er mit !flex im Chat – erst das zählt. Alle anderen Belohnungen zählen hier nicht.
      </p>

      <section className="rewards-ranking" aria-label="Rangliste">
        <div className="card-row card-wrap" style={{ justifyContent: 'space-between' }}>
          <h3 className="alert-card-name" style={{ margin: 0 }}>Rangliste</h3>
          <input type="text" placeholder="Zuschauer suchen" aria-label="Zuschauer suchen" value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: '0 0 220px', width: 220 }} />
        </div>
        <p className="dialog-hint">Genau so steht sie als Bestenliste im Stream. Wer ein Jahr nicht flext, fällt heraus.</p>
        {viewers.length === 0 && <p className="dialog-empty">{rows && rows.length ? 'Niemand passt zur Suche.' : 'Noch hat niemand geflext. Sobald jemand die Belohnung einlöst und !flex tippt, steht er hier.'}</p>}
        {viewers.map((v, i) => (
          <div key={v.user_name} className="rewards-row">
            <span className="rewards-rank">{v.count > 0 ? i + 1 : '–'}</span>
            <div className="rewards-who">
              <div className="rewards-name">{v.user_name}</div>
              <div className="dialog-hint">{v.credits > 0 ? `${n(v.credits, 'Flex', 'Flexe')} offen · ` : ''}zuletzt {day(v.last_redeemed_at)}</div>
            </div>
            <div className="rewards-total"><div className="rewards-total-n">{v.count}</div><div className="dialog-hint">{v.count === 1 ? 'Flex' : 'Flexe'}</div></div>
            <button type="button" className="card-secondary" onClick={() => openEdit(v)}>Bearbeiten</button>
          </div>
        ))}
      </section>

      {editing && (
        <Dialog
          title={editing.user_name}
          sentence="Zahl korrigieren, einen Flex freischalten, oder alles zu dieser Person löschen."
          onClose={() => setEditing(null)}
          width={560}
          footer={<>
            <button type="button" className="card-link" onClick={forget}>Zuschauer vergessen</button>
            <span style={{ flex: 1 }} />
            <button type="button" className="card-primary" onClick={() => setEditing(null)}>Fertig</button>
          </>}
        >
          <ul className="dialog-list">
            <li>
              <span className="dialog-list-text">Flexe</span>
              <input type="number" min={0} aria-label="Anzahl Flexe" value={countEdit} onChange={(e) => setCountEdit(e.target.value)} style={{ width: 90 }} />
              <button type="button" className="card-secondary" onClick={saveCount}>Speichern</button>
              <button type="button" className="card-link" onClick={removeEntry}>Auf null</button>
            </li>
            <li>
              <span className="dialog-list-text">Offene Flexe <span className="dialog-hint">· {editing.credits}</span></span>
              <button type="button" className="card-secondary" onClick={() => grant(editing.user_name)}>Einen freischalten</button>
            </li>
          </ul>
        </Dialog>
      )}

      {adding && (
        <Dialog
          title="Eintrag von Hand"
          sentence="Flexe setzen, die das Tool nicht mitbekommen hat."
          onClose={() => setAdding(null)}
          width={520}
          footer={<>
            <button type="button" className="card-secondary" onClick={() => setAdding(null)}>Abbrechen</button>
            <button type="button" className="card-primary" onClick={add} disabled={!adding.user.trim() || adding.count.trim() === ''}>Eintragen</button>
          </>}
        >
          <div className="dialog-grid">
            <div className="dialog-field"><label htmlFor="fx-user">Zuschauer (Twitch-Login)</label><input id="fx-user" type="text" value={adding.user} onChange={(e) => setAdding({ ...adding, user: e.target.value })} autoFocus /></div>
            <div className="dialog-field"><label htmlFor="fx-count">Flexe</label><input id="fx-count" type="number" min={0} value={adding.count} onChange={(e) => setAdding({ ...adding, count: e.target.value })} style={{ width: 120 }} /></div>
          </div>
        </Dialog>
      )}
    </div>
  );
}

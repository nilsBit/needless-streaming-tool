import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApi, apiGet, apiPost, apiDelete } from '../hooks/useApi';
import { useWebSocket } from '../hooks/useWebSocket';
import { useToast } from '../contexts/ToastContext';
import Dialog from '../components/ux/Dialog';

interface BreakdownRow { user_name: string; reward_type: string; count: number; last_redeemed_at: string }

interface Viewer { name: string; total: number; last: string; byType: Array<{ type: string; count: number }> }

const TYPE_LABELS: Record<string, string> = { roulette: 'Glücksrad drehen', feature_request: 'Vorschlag einreichen', change_music: 'Musik ändern', scene_change: 'Szene wechseln' };
const typeLabel = (t: string) => TYPE_LABELS[t] ?? t;
const day = (iso: string) => new Date(iso.includes('T') ? iso : iso + 'Z').toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });

// "Kanalpunkte" under Nach dem Stream: who redeemed what, as a ranking per
// viewer — the same order the Bestenliste overlay shows. Only counts are
// kept, no log of who typed what when. Corrections by hand live in dialogs;
// "Zuschauer vergessen" removes everything stored under a login.
export default function RewardStatsPanel() {
  const { toast } = useToast();
  const { data: rows, refetch } = useApi<BreakdownRow[]>('/reward-stats/breakdown');
  const [types, setTypes] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [editing, setEditing] = useState<Viewer | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState<{ user: string; type: string; count: string } | null>(null);

  const fetchTypes = useCallback(() => { apiGet<string[]>('/reward-stats/types').then((r) => { if (r) setTypes(r); }); }, []);
  useEffect(() => { fetchTypes(); }, [fetchTypes]);

  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useWebSocket((event) => {
    if (event !== 'reward-redeemed') return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => { refetch(); fetchTypes(); }, 2000);
  });
  useEffect(() => () => { if (debounce.current) clearTimeout(debounce.current); }, []);

  const viewers = useMemo<Viewer[]>(() => {
    const map = new Map<string, Viewer>();
    for (const r of rows ?? []) {
      if (typeFilter && r.reward_type !== typeFilter) continue;
      const v = map.get(r.user_name) ?? { name: r.user_name, total: 0, last: r.last_redeemed_at, byType: [] };
      v.total += r.count;
      if (new Date(r.last_redeemed_at) > new Date(v.last)) v.last = r.last_redeemed_at;
      v.byType.push({ type: r.reward_type, count: r.count });
      map.set(r.user_name, v);
    }
    const q = search.trim().toLowerCase();
    return [...map.values()]
      .filter((v) => !q || v.name.toLowerCase().includes(q))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'de'));
  }, [rows, typeFilter, search]);

  const openEdit = (v: Viewer) => { setEditing(v); setEdits(Object.fromEntries(v.byType.map((t) => [t.type, String(t.count)]))); };
  const saveEdit = async (type: string) => {
    if (!editing) return;
    const count = Number(edits[type]);
    if (!Number.isInteger(count) || count < 0) { toast.error('Eine Anzahl ist eine ganze Zahl.'); return; }
    const result = await apiPost('/reward-stats', { user_name: editing.name, reward_type: type, count });
    if (!result) { toast.error('Nicht gespeichert'); return; }
    toast.success('Gespeichert');
    refetch();
  };
  const deleteEntry = async (type: string) => {
    if (!editing) return;
    if (!window.confirm(`„${typeLabel(type)}“ bei ${editing.name} löschen?`)) return;
    const ok = await apiDelete(`/reward-stats/${encodeURIComponent(editing.name)}/${encodeURIComponent(type)}`);
    if (!ok) { toast.error('Löschen fehlgeschlagen'); return; }
    setEditing((v) => (v ? { ...v, byType: v.byType.filter((t) => t.type !== type) } : v));
    refetch(); fetchTypes();
  };
  const forget = async () => {
    if (!editing) return;
    if (!window.confirm(`${editing.name} vergessen? Alles, was unter diesem Namen gespeichert ist – Zählungen, Songwünsche –, wird gelöscht.`)) return;
    const result = await apiPost('/reward-stats/forget', { user_name: editing.name });
    if (!result) { toast.error('Nicht gelöscht'); return; }
    toast.success(`${editing.name} vergessen`);
    setEditing(null);
    refetch(); fetchTypes();
  };
  const add = async () => {
    if (!adding || !adding.user.trim() || !adding.type.trim() || adding.count.trim() === '') return;
    const result = await apiPost('/reward-stats', { user_name: adding.user.trim(), reward_type: adding.type.trim(), count: Number(adding.count) });
    if (!result) { toast.error('Nicht gespeichert'); return; }
    toast.success('Eingetragen');
    setAdding(null);
    refetch(); fetchTypes();
  };

  return (
    <div className="panel card-slim rewards">
      <div className="card-line card-wrap">
        <div className="card-row card-wrap">
          <input type="text" placeholder="Zuschauer suchen" aria-label="Zuschauer suchen" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 220 }} />
          <select className="card-select" aria-label="Belohnung" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">Alle Belohnungen</option>
            {types.map((t) => <option key={t} value={t}>{typeLabel(t)}</option>)}
          </select>
        </div>
        <button type="button" className="card-secondary" onClick={() => setAdding({ user: '', type: types[0] ?? '', count: '' })}>+ Eintrag von Hand</button>
      </div>

      <section className="rewards-ranking" aria-label="Rangliste">
        <h3 className="alert-card-name">Rangliste</h3>
        <p className="dialog-hint">Wer am meisten eingelöst hat. Genau so steht sie als Bestenliste im Stream. Gezählt wird jede eigene Belohnung deines Kanals; wer ein Jahr nichts einlöst, fällt heraus.</p>
        {viewers.length === 0 && <p className="dialog-empty">{rows && rows.length ? 'Niemand passt zur Suche.' : 'Noch hat niemand Kanalpunkte eingelöst. Belohnungen legst du in Twitch an, das Tool zählt sie.'}</p>}
        {viewers.map((v, i) => (
          <div key={v.name} className="rewards-row">
            <span className="rewards-rank">{i + 1}</span>
            <div className="rewards-who">
              <div className="rewards-name">{v.name}</div>
              <div className="dialog-hint">{v.byType.map((t) => `${t.count} × ${typeLabel(t.type)}`).join(' · ')} · zuletzt {day(v.last)}</div>
            </div>
            <div className="rewards-total"><div className="rewards-total-n">{v.total}</div><div className="dialog-hint">{v.total === 1 ? 'Einlösung' : 'Einlösungen'}</div></div>
            <button type="button" className="card-secondary" onClick={() => openEdit(v)}>Bearbeiten</button>
          </div>
        ))}
      </section>

      {editing && (
        <Dialog
          title={editing.name}
          sentence="Zahlen korrigieren oder einen Eintrag entfernen, etwa nach einem Fehlgriff im Chat."
          onClose={() => setEditing(null)}
          width={560}
          footer={<>
            <button type="button" className="card-link" onClick={forget}>Zuschauer vergessen</button>
            <span style={{ flex: 1 }} />
            <button type="button" className="card-primary" onClick={() => setEditing(null)}>Fertig</button>
          </>}
        >
          {editing.byType.length === 0 && <p className="dialog-empty">Keine Einträge mehr.</p>}
          <ul className="dialog-list">
            {editing.byType.map((t) => (
              <li key={t.type}>
                <span className="dialog-list-text">{typeLabel(t.type)}</span>
                <input type="number" min={0} aria-label={`Anzahl ${typeLabel(t.type)}`} value={edits[t.type] ?? ''} onChange={(e) => setEdits({ ...edits, [t.type]: e.target.value })} style={{ width: 90 }} />
                <button type="button" className="card-secondary" onClick={() => saveEdit(t.type)}>Speichern</button>
                <button type="button" className="card-link" onClick={() => deleteEntry(t.type)}>Löschen</button>
              </li>
            ))}
          </ul>
        </Dialog>
      )}

      {adding && (
        <Dialog
          title="Eintrag von Hand"
          sentence="Für Einlösungen, die das Tool nicht mitbekommen hat."
          onClose={() => setAdding(null)}
          width={560}
          footer={<>
            <button type="button" className="card-secondary" onClick={() => setAdding(null)}>Abbrechen</button>
            <button type="button" className="card-primary" onClick={add} disabled={!adding.user.trim() || !adding.type.trim() || adding.count.trim() === ''}>Eintragen</button>
          </>}
        >
          <div className="dialog-grid">
            <div className="dialog-field"><label htmlFor="rw-user">Zuschauer</label><input id="rw-user" type="text" value={adding.user} onChange={(e) => setAdding({ ...adding, user: e.target.value })} autoFocus /></div>
            <div className="dialog-field"><label htmlFor="rw-type">Belohnung</label><input id="rw-type" type="text" list="rw-types" value={adding.type} onChange={(e) => setAdding({ ...adding, type: e.target.value })} /><datalist id="rw-types">{types.map((t) => <option key={t} value={t} />)}</datalist></div>
          </div>
          <div className="dialog-field"><label htmlFor="rw-count">Anzahl</label><input id="rw-count" type="number" min={0} value={adding.count} onChange={(e) => setAdding({ ...adding, count: e.target.value })} style={{ width: 120 }} /></div>
        </Dialog>
      )}
    </div>
  );
}

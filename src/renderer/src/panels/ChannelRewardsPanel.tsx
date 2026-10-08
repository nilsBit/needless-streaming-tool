import React, { useEffect, useState } from 'react';
import { apiFetch, apiDelete, useApi } from '../hooks/useApi';
import { useToast } from '../contexts/ToastContext';
import Dialog from '../components/ux/Dialog';
import SearchField, { matchesSearch } from '../components/ux/SearchField';

type Action = 'roulette' | 'feature_request' | 'change_music' | 'scene' | 'alert';
interface Reward {
  id: string; title: string; cost: number; prompt: string; input_required: boolean; enabled: boolean;
  manageable: boolean; action: Action | null; scene_name: string | null; by_name: Action | null;
}
interface SceneMapping { reward_title: string; scene_name: string }
type Draft = Omit<Reward, 'id' | 'manageable' | 'action' | 'by_name'> & { id?: string; action: Action };

const ACTIONS: Record<Action, string> = {
  alert: 'Nur ein Alert',
  roulette: 'Glücksrad drehen',
  feature_request: 'Vorschlag einreichen',
  change_music: 'Musik wechseln',
  scene: 'Szene wechseln',
};

const emptyDraft = (): Draft => ({ title: '', cost: 500, prompt: '', input_required: false, enabled: true, action: 'alert', scene_name: null });

// "Kanalpunkte" under Chat & Bot (#24): the channel's Twitch rewards. Those
// made here can be edited and carry an action; those from the Creator
// Dashboard are shown read-only and keep working by their name.
export default function ChannelRewardsPanel() {
  const { toast } = useToast();
  const [rewards, setRewards] = useState<Reward[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [search, setSearch] = useState('');

  const load = async () => {
    const res = await apiFetch('/channel-rewards');
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { setError(body.error ?? 'Twitch konnte nicht gefragt werden.'); setRewards([]); return; }
    setError(null); setRewards(body);
  };
  useEffect(() => { void load(); }, []);

  const shown = (rewards ?? []).filter((r) => matchesSearch(search, r.title, r.prompt, r.action ? ACTIONS[r.action] : '', r.by_name ? ACTIONS[r.by_name] : ''));
  const own = shown.filter((r) => r.manageable);
  const dashboard = shown.filter((r) => !r.manageable);

  const row = (r: Reward) => (
    <div key={r.id} className="rewards-row">
      <div className="rewards-who">
        <div className="rewards-name">{r.title}{r.enabled ? '' : ' (aus)'}</div>
        <div className="dialog-hint">
          {r.manageable
            ? <>{r.action ? ACTIONS[r.action] : 'Ohne Aktion'}{r.action === 'scene' && r.scene_name ? ` „${r.scene_name}“` : ''}{r.input_required ? ' · mit Text' : ''}</>
            : r.by_name ? `Am Namen erkannt: ${ACTIONS[r.by_name]}${r.by_name === 'scene' ? ' (eine freigegebene Szene)' : ''}` : 'Löst nur einen Alert aus'}
        </div>
      </div>
      <div className="rewards-total"><div className="rewards-total-n">{r.cost}</div><div className="dialog-hint">Kanalpunkte</div></div>
      {r.manageable
        ? <button type="button" className="card-secondary" onClick={() => setDraft({ ...r, action: r.action ?? 'alert' })}>Bearbeiten</button>
        : <span className="dialog-hint" style={{ width: 96, textAlign: 'center' }}>nur ansehen</span>}
    </div>
  );

  return (
    <div className="panel card-slim rewards">
      <div className="card-line card-wrap">
        <p className="dialog-hint" style={{ margin: 0 }}>Kanalpunkte gibt es mit Affiliate oder Partner. Twitch lässt das Tool nur Belohnungen ändern, die es selbst angelegt hat.</p>
        <div className="card-row card-wrap">
          {(rewards?.length ?? 0) > 0 && <SearchField value={search} onChange={setSearch} label="Belohnungen suchen" />}
          <button type="button" className="card-primary" onClick={() => setDraft(emptyDraft())} disabled={!!error}>+ Belohnung</button>
        </div>
      </div>
      {error && <p className="dialog-hint" role="alert">{error}</p>}
      {rewards && !error && rewards.length === 0 && <p className="dialog-empty">Noch keine Belohnung in deinem Kanal. Lege hier eine an – sie erscheint sofort bei den Zuschauern.</p>}
      {rewards && rewards.length > 0 && shown.length === 0 && <p className="dialog-empty">Keine Belohnung passt zu „{search.trim()}“.</p>}

      {own.length > 0 && <section aria-label="Aus dem Tool"><h3 className="dialog-section">Aus dem Tool</h3><div className="rewards-ranking">{own.map(row)}</div></section>}
      {dashboard.length > 0 && (
        <section aria-label="In Twitch angelegt">
          <h3 className="dialog-section">In Twitch angelegt</h3>
          <p className="dialog-hint">Ändern und löschen nur im Creator-Dashboard. Was sie tun, erkennt das Tool am Namen: „Roulette“, „Feature“, „Musik“ oder „Song“, „Szene“ oder „Scene“. Soll eine davon etwas anderes tun, lege sie hier neu an.</p>
          <div className="rewards-ranking">{dashboard.map(row)}</div>
        </section>
      )}

      {draft && <RewardDialog draft={draft} onClose={() => setDraft(null)} onSaved={() => { setDraft(null); void load(); toast.success('Gespeichert'); }} />}
    </div>
  );
}

function RewardDialog({ draft: initial, onClose, onSaved }: { draft: Draft; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const { data: mappings } = useApi<SceneMapping[]>('/obs/mappings');
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const scenes = [...new Set((mappings ?? []).map((m) => m.scene_name))];
  const isNew = draft.id === undefined;

  const save = async () => {
    setBusy(true);
    const body = { title: draft.title, cost: Number(draft.cost), prompt: draft.prompt, input_required: draft.input_required, enabled: draft.enabled, action: draft.action, scene_name: draft.scene_name };
    const res = await apiFetch(isNew ? '/channel-rewards' : `/channel-rewards/${encodeURIComponent(draft.id!)}`, { method: isNew ? 'POST' : 'PATCH', body: JSON.stringify(body) });
    setBusy(false);
    if (!res.ok) { toast.error((await res.json().catch(() => ({}))).error ?? 'Nicht gespeichert'); return; }
    onSaved();
  };
  const remove = async () => {
    if (!window.confirm(`„${initial.title}“ in Twitch löschen? Zuschauer sehen die Belohnung danach nicht mehr.`)) return;
    if (!(await apiDelete(`/channel-rewards/${encodeURIComponent(draft.id!)}`))) { toast.error('Nicht gelöscht'); return; }
    onSaved();
  };

  return (
    <Dialog
      title={isNew ? 'Belohnung in Twitch anlegen' : initial.title}
      sentence="So erscheint sie bei deinen Zuschauern unter den Kanalpunkten. Was beim Einlösen passiert, entscheidest du hier."
      onClose={onClose}
      width={560}
      footer={<>
        {!isNew && <button type="button" className="card-link" onClick={remove}>In Twitch löschen</button>}
        <span style={{ flex: 1 }} />
        <button type="button" className="card-secondary" onClick={onClose}>Abbrechen</button>
        <button type="button" className="card-primary" onClick={save} disabled={busy || !draft.title.trim() || (draft.action === 'scene' && !draft.scene_name)}>{busy ? 'Speichert …' : isNew ? 'Anlegen' : 'Speichern'}</button>
      </>}
    >
      <div className="dialog-grid">
        <div className="dialog-field"><label htmlFor="cr-title">Name</label><input id="cr-title" type="text" maxLength={45} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} autoFocus /></div>
        <div className="dialog-field"><label htmlFor="cr-cost">Preis (Kanalpunkte)</label><input id="cr-cost" type="number" min={1} value={String(draft.cost)} onChange={(e) => setDraft({ ...draft, cost: Number(e.target.value) })} style={{ width: 140 }} /></div>
        <div className="dialog-field">
          <label htmlFor="cr-action">Was passiert</label>
          <select id="cr-action" value={draft.action} onChange={(e) => setDraft({ ...draft, action: e.target.value as Action })}>
            {(Object.keys(ACTIONS) as Action[]).map((a) => <option key={a} value={a}>{ACTIONS[a]}</option>)}
          </select>
          <span className="dialog-hint">Klappt es nicht – etwa weil OBS nicht verbunden ist –, bekommt der Zuschauer seine Kanalpunkte zurück.</span>
        </div>
        {draft.action === 'scene' && (
          <div className="dialog-field">
            <label htmlFor="cr-scene">Szene</label>
            <select id="cr-scene" value={draft.scene_name ?? ''} onChange={(e) => setDraft({ ...draft, scene_name: e.target.value || null })}>
              <option value="">{scenes.length ? 'Szene wählen …' : 'Keine Szene freigegeben'}</option>
              {scenes.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <span className="dialog-hint">Nur Szenen, die unter Overlays &amp; Alerts → Szenen in OBS für Belohnungen freigegeben sind.</span>
          </div>
        )}
        <div className="dialog-field"><label htmlFor="cr-prompt">Text für Zuschauer (optional)</label><input id="cr-prompt" type="text" maxLength={200} value={draft.prompt} onChange={(e) => setDraft({ ...draft, prompt: e.target.value })} /></div>
        <label className="card-check"><input type="checkbox" checked={draft.input_required} onChange={(e) => setDraft({ ...draft, input_required: e.target.checked })} /><span>Zuschauer muss etwas dazuschreiben</span></label>
        <label className="card-check"><input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} /><span>An</span></label>
      </div>
    </Dialog>
  );
}

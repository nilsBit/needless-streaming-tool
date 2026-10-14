import React, { useEffect, useState } from 'react';
import { apiFetch, useApi } from '../hooks/useApi';
import { useToast } from '../contexts/ToastContext';
import Dialog from '../components/ux/Dialog';
import RewardSteps, { type Step } from '../components/rewards/RewardSteps';
import RewardStart from '../components/rewards/RewardStart';
import RewardQuestPath, { type RewardDraft } from '../components/rewards/RewardQuestPath';
import ScenePicker from '../components/rewards/ScenePicker';
import BlockFields from '../components/rewards/BlockFields';
import { BLOCKS, type Block } from '../components/rewards/rewardBlocks';
import { useQuestPath } from '../components/quests/questStart';
import { useFeatures } from '../contexts/FeaturesContext';
import type { FeatureKey } from '../../../shared/features';

type Action = Block;
interface Reward {
  id: string; title: string; cost: number; prompt: string; input_required: boolean; enabled: boolean;
  manageable: boolean; action: Action | null; scene_name: string | null; scene_seconds: number | null; by_name: Action | null;
  task: string | null; minutes: number | null; sound: string | null;
}
type Draft = Omit<Reward, 'id' | 'manageable' | 'action' | 'by_name'> & { id?: string; action: Action };

const ACTIONS = Object.fromEntries(BLOCKS.map((b) => [b.value, b.title])) as Record<Action, string>;


const POINTS = new Intl.NumberFormat('de-DE');

// Kanalpunkte under Chat & Bot → Belohnungen (#24): the channel's Twitch rewards. Those
// made here can be edited and carry an action; those from the Creator
// Dashboard are shown read-only and keep working by their name.
export default function ChannelRewardsPanel() {
  const { toast } = useToast();
  const { isOn } = useFeatures();
  const [rewards, setRewards] = useState<Reward[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Listing needs only the read right; creating answers 401 until the login is renewed.
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);

  const load = async () => {
    const res = await apiFetch('/channel-rewards');
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { setError(body.error ?? 'Twitch konnte nicht gefragt werden.'); setNeedsReconnect(res.status === 401 || res.status === 503); setRewards([]); return; }
    setError(null); setRewards(body);
  };
  useEffect(() => { void load(); }, []);

  const reconnect = async () => {
    try { await apiFetch('/auth/twitch/open', { method: 'POST' }); toast.success('Twitch ist im Browser offen – bestätigen, dann diese Seite neu öffnen.'); }
    catch { toast.error('Twitch ließ sich nicht öffnen'); }
  };

  // New rewards start from a template sheet; an own one goes step by step on a Quest-Pfad.
  const [path, setPath] = useState<{ initial?: Partial<RewardDraft> } | null>(null);
  const [start, setStart] = useState(false);
  useQuestPath(['channelReward'], () => setPath({}));

  const ownCount = (rewards ?? []).filter((r) => r.manageable && r.enabled).length;
  // The steps and templates help to start; once one reward is made here, the list comes first.
  const starting = rewards !== null && !rewards.some((r) => r.manageable);
  const steps: Step[] = [
    {
      title: 'Verbinden',
      text: 'Das Tool braucht das Recht, in deinem Kanal Belohnungen anzulegen. Kanalpunkte gibt es mit Affiliate oder Partner.',
      state: needsReconnect ? 'Recht fehlt – einmal neu verbinden' : error ? 'Twitch antwortet nicht' : 'Verbunden',
      done: !needsReconnect && !error,
      action: needsReconnect || error ? { label: 'Neu mit Twitch verbinden', onClick: reconnect } : undefined,
    },
    {
      title: 'Belohnung anlegen',
      text: 'Sie erscheint sofort bei deinen Zuschauern. Fang mit einer Vorlage an.',
      state: ownCount ? `${ownCount} aus dem Tool an` : 'Noch keine aus dem Tool',
      done: ownCount > 0,
    },
    {
      title: 'Zuschauer lösen ein',
      text: 'Im Kanalpunkte-Fenster unter dem Chat. Klappt die Aktion nicht, gibt es die Punkte zurück.',
      state: ownCount ? 'Bereit' : 'Wartet auf Schritt 2',
      done: ownCount > 0,
    },
  ];

  // Made here first, then those from the Creator Dashboard, which can only be looked at.
  const list = [...(rewards ?? []).filter((r) => r.manageable), ...(rewards ?? []).filter((r) => !r.manageable)];
  const fromDashboard = list.some((r) => !r.manageable);

  const row = (r: Reward) => (
    <li key={r.id} className={`chat-row reward-line ${r.enabled ? '' : 'off'}`}>
      <span className="chat-row-name">{r.title}{r.enabled ? '' : ' (aus)'}</span>
      <span className="reward-line-cost">{POINTS.format(r.cost)} Punkte</span>
      <span className="chat-row-text">
        {r.manageable
          ? <>{r.action ? ACTIONS[r.action] : 'Ohne Aktion'}{r.action === 'scene' && r.scene_name ? ` „${r.scene_name}“${r.scene_seconds ? `, ${r.scene_seconds} s` : ''}` : ''}{r.action === 'timer' && r.minutes ? ` „${r.task}“, ${r.minutes} Min` : ''}{r.action === 'sound' && r.sound ? ` – ${r.sound.replace(/\.[a-z0-9]+$/i, '')}` : ''}{r.input_required ? ' · mit Text' : ''}</>
          : r.by_name ? `Im Creator-Dashboard angelegt · am Namen erkannt: ${ACTIONS[r.by_name]}` : 'Im Creator-Dashboard angelegt · nur ein Alert'}
      </span>
      {r.manageable
        ? <button type="button" className="card-secondary" onClick={() => setDraft({ ...r, action: r.action ?? 'alert' })}>Bearbeiten</button>
        : <span className="chat-row-kind">nur ansehen</span>}
    </li>
  );

  return (
    <div className="panel card-slim rewards">
      {starting && <RewardSteps steps={steps} label="So laufen die Kanalpunkte" />}

      {needsReconnect && (
        <div className="reward-banner" role="alert">
          <span>Dem Twitch-Login fehlt das Recht, Belohnungen anzulegen. Ein Klick, dann bestätigst du bei Twitch.</span>
          <button type="button" className="card-primary" onClick={reconnect}>Neu mit Twitch verbinden</button>
        </div>
      )}

      <div className="chat-list-head">
        <h2>Belohnungen</h2>
        <button type="button" className="card-primary" onClick={() => setStart(true)} disabled={!!error && !needsReconnect}>+ Neue Belohnung</button>
      </div>
      {error && !needsReconnect && <p className="dialog-hint" role="alert">{error}</p>}
      {rewards && !error && rewards.length === 0 && <p className="dialog-empty">Noch keine Belohnung in deinem Kanal. Lege hier eine an – sie erscheint sofort bei den Zuschauern.</p>}
      {list.length > 0 && <ul className="chat-list" aria-label="Belohnungen">{list.map(row)}</ul>}
      {fromDashboard && <p className="dialog-hint">Was im Creator-Dashboard angelegt ist, änderst und löschst du nur dort. Was es tut, erkennt das Tool am Namen: „Roulette“, „Feature“, „Musik“ oder „Song“, „Szene“ oder „Scene“. Soll eine davon etwas anderes tun, lege sie hier neu an.</p>}

      {start && <RewardStart mode="twitch" currency="Kanalpunkte" existing={(rewards ?? []).map((r) => r.title)} isOn={(f) => isOn(f as FeatureKey)}
        onClose={() => setStart(false)} onCreated={() => { setStart(false); void load(); }} onOwn={() => { setStart(false); setPath({}); }} onNeedsReconnect={() => setNeedsReconnect(true)} />}
      {path && <RewardQuestPath mode="twitch" currency="Kanalpunkte" initial={path.initial} onClose={() => setPath(null)} onCreated={() => void load()} onNeedsReconnect={() => setNeedsReconnect(true)} />}
      {draft && <RewardDialog draft={draft} onClose={() => setDraft(null)} onSaved={() => { setDraft(null); void load(); toast.success('Gespeichert'); }} />}
    </div>
  );
}

function RewardDialog({ draft: initial, onClose, onSaved }: { draft: Draft; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const isNew = draft.id === undefined;

  const save = async () => {
    setBusy(true);
    const body = { title: draft.title, cost: Number(draft.cost), action: draft.action, scene_name: draft.scene_name, scene_seconds: draft.scene_seconds, task: draft.task, minutes: draft.minutes, sound: draft.sound, input_required: draft.action === 'alert' && draft.input_required, enabled: draft.enabled };
    const res = await apiFetch(isNew ? '/channel-rewards' : `/channel-rewards/${encodeURIComponent(draft.id!)}`, { method: isNew ? 'POST' : 'PATCH', body: JSON.stringify(body) });
    setBusy(false);
    if (!res.ok) { toast.error((await res.json().catch(() => ({}))).error ?? 'Nicht gespeichert'); return; }
    onSaved();
  };
  const remove = async () => {
    if (!window.confirm(`„${initial.title}“ in Twitch löschen? Zuschauer sehen die Belohnung danach nicht mehr.`)) return;
    const res = await apiFetch(`/channel-rewards/${encodeURIComponent(draft.id!)}`, { method: 'DELETE' });
    if (!res.ok) { toast.error((await res.json().catch(() => ({}))).error ?? 'Nicht gelöscht'); return; }
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
        <button type="button" className="card-primary" onClick={save} disabled={busy || !draft.title.trim() || (draft.action === 'scene' && !draft.scene_name) || (draft.action === 'sound' && !draft.sound) || (draft.action === 'timer' && !(draft.task ?? '').trim())}>{busy ? 'Speichert …' : isNew ? 'Anlegen' : 'Speichern'}</button>
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
          <ScenePicker scene={draft.scene_name} seconds={draft.scene_seconds} onChange={(scene, seconds) => setDraft({ ...draft, scene_name: scene, scene_seconds: seconds })} onLeave={onClose} />
        )}
        {(draft.action === 'timer' || draft.action === 'sound') && <BlockFields block={draft.action} task={draft.task ?? ''} minutes={draft.minutes ?? 5} sound={draft.sound} onChange={(p) => setDraft({ ...draft, ...p })} />}
        {draft.action === 'alert' && <label className="card-check"><input type="checkbox" checked={draft.input_required} onChange={(e) => setDraft({ ...draft, input_required: e.target.checked })} /><span>Zuschauer schreibt etwas dazu – steht im Alert</span></label>}
        <label className="card-check"><input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} /><span>An</span></label>
      </div>
    </Dialog>
  );
}

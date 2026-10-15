import React, { useEffect, useRef, useState } from 'react';
import { useApi, apiFetch, apiPost } from '../hooks/useApi';
import { useWebSocket } from '../hooks/useWebSocket';
import { useToast } from '../contexts/ToastContext';
import Dialog from '../components/ux/Dialog';
import SearchField from '../components/ux/SearchField';
import RewardCards, { blockDetail, type RewardCard } from '../components/rewards/RewardCards';
import RewardStart from '../components/rewards/RewardStart';
import RewardQuestPath, { type RewardDraft } from '../components/rewards/RewardQuestPath';
import ScenePicker from '../components/rewards/ScenePicker';
import BlockFields from '../components/rewards/BlockFields';
import { BLOCKS, type Block } from '../components/rewards/rewardBlocks';
import { useQuestPath } from '../components/quests/questStart';
import { useFeatures } from '../contexts/FeaturesContext';
import type { FeatureKey } from '../../../shared/features';

interface Config {
  currency: string; watch_points: number; watch_minutes: number; chat_points: number;
  follow_points: number; sub_points: number; raid_points: number; bits_per_point: number; bots: string[];
}
type Action = Block;
interface Reward { id: number; name: string; cost: number; action: Action; scene_name: string | null; scene_seconds: number | null; task: string | null; minutes: number | null; sound: string | null; needs_input: boolean; cooldown_seconds: number; enabled: boolean }
interface Viewer { user_name: string; display_name: string; balance: number; total: number; stream_total: number; rank: number }

const ACTIONS = Object.fromEntries(BLOCKS.map((b) => [b.value, b.title])) as Record<Action, string>;

/** The earning numbers, in the order and words of the settings card. */
const RATES: Array<[keyof Config, string, string]> = [
  ['watch_points', 'Zuschauen', 'je Takt, für jeden im Chat'],
  ['watch_minutes', 'Takt', 'Minuten'],
  ['chat_points', 'Chatten', 'je Nachricht, höchstens einmal je Minute'],
  ['follow_points', 'Follow', 'einmal'],
  ['sub_points', 'Sub', 'je Sub, auch verschenkt'],
  ['raid_points', 'Raid', 'für den Raider'],
  ['bits_per_point', 'Bits', 'Bits für einen Punkt'],
];


// Eigene Punkte under Chat & Bot → Belohnungen: the tool's own points next to
// Twitch channel points (spec 2026-10-08-eigene-punkte): how points are earned,
// the rewards as tiles (15.10., the three steps are gone), who contributed and
// a corner to try it out — with give, take and "Für jemanden einlösen" on each
// viewer.
export default function PointsPanel() {
  const { toast } = useToast();
  const { isOn } = useFeatures();
  const { data: config, refetch: refetchConfig } = useApi<Config>('/points/config');
  const { data: rewards, refetch: refetchRewards } = useApi<Reward[]>('/points/rewards');
  const { data: status } = useApi<{ live: boolean; channel: string | null }>('/points/status');
  const [editingConfig, setEditingConfig] = useState(false);
  const [editingReward, setEditingReward] = useState<(Omit<Reward, 'id'> & { id?: number }) | null>(null);
  const [openViewer, setOpenViewer] = useState<Viewer | null>(null);
  const [tried, setTried] = useState<number | null>(null);
  const [viewersKey, setViewersKey] = useState(0);
  const currency = config?.currency ?? 'Punkte';
  const firstReward = rewards?.find((r) => r.enabled);

  // New rewards start from a template sheet; an own one goes step by step on a Quest-Pfad.
  const [path, setPath] = useState<{ initial?: Partial<RewardDraft> } | null>(null);
  const [start, setStart] = useState(false);
  useQuestPath(['pointReward'], () => setPath({}));
  const tryReward = async (name: string) => {
    await giveMyself();
    toast.success(`Du hast jetzt Punkte. Schreib im Chat: !einlösen ${name}`);
    setPath(null);
  };

  const giveMyself = async () => {
    if (!status?.channel) return;
    const result = await apiPost<Viewer>(`/points/viewers/${encodeURIComponent(status.channel)}/adjust`, { amount: 500 });
    if (!result) { toast.error('Nicht gegeben'); return; }
    setTried(result.balance);
    setViewersKey((k) => k + 1);
  };

  const cards: RewardCard[] = (rewards ?? []).map((r) => ({
    key: r.id, name: r.name, cost: `${POINTS.format(r.cost)} ${currency}`, block: r.action, enabled: r.enabled,
    detail: blockDetail({ ...r, withText: r.needs_input, cooldown: r.cooldown_seconds }),
    onOpen: () => setEditingReward(r),
  }));

  return (
    <div className="panel card-slim rewards">
      {config && (
        <div className="chat-box-row">
          <div><b>Verdienen</b> <span>· {earning(config)}{status?.live ? ' – läuft gerade' : ' – nur, solange du live bist'}</span></div>
          <button type="button" className="card-secondary" onClick={() => setEditingConfig(true)}>Ändern</button>
        </div>
      )}

      {rewards && <RewardCards cards={cards} onNew={() => setStart(true)} />}

      <div className="reward-columns">
        <div className="reward-main"><ViewerList key={viewersKey} currency={currency} onOpen={setOpenViewer} /></div>
        <aside className="reward-side reward-try" aria-label="Selbst ausprobieren">
          <h3>Selbst ausprobieren</h3>
          <p className="dialog-hint" style={{ margin: 0 }}>Gib dir {currency} und löse eine Belohnung im Chat ein – auch ohne live zu sein.</p>
          <button type="button" className="card-primary" data-quest-target="pointTry" onClick={giveMyself} disabled={!status?.channel} title={status?.channel ? undefined : 'Erst mit Twitch verbinden'}>500 {currency} an dich</button>
          {tried !== null && (
            <p className="dialog-hint" role="status" style={{ margin: 0 }}>
              Du hast jetzt {tried} {currency}. {firstReward ? <>Schreib im Chat: <code>!einlösen {firstReward.name}</code></> : 'Leg oben eine Belohnung an, dann schreib im Chat: !einlösen <Name>'}
            </p>
          )}
        </aside>
      </div>

      {editingConfig && config && <ConfigDialog config={config} onClose={() => setEditingConfig(false)} onSaved={refetchConfig} />}
      {start && <RewardStart mode="points" currency={currency} existing={(rewards ?? []).map((r) => r.name)} isOn={(f) => isOn(f as FeatureKey)}
        onClose={() => setStart(false)} onCreated={() => { setStart(false); void refetchRewards(); }} onOwn={() => { setStart(false); setPath({}); }} />}
      {path && <RewardQuestPath mode="points" currency={currency} initial={path.initial} onClose={() => setPath(null)} onCreated={refetchRewards} onTry={tryReward} />}
      {editingReward && <RewardDialog reward={editingReward} currency={currency} onClose={() => setEditingReward(null)} onSaved={refetchRewards} />}
      {openViewer && <ViewerDialog viewer={openViewer} currency={currency} rewards={rewards ?? []} onClose={() => setOpenViewer(null)} />}
    </div>
  );
}

const POINTS = new Intl.NumberFormat('de-DE');

/** How points are earned, in one line; a source set to 0 is left out. */
function earning(c: Config): string {
  const parts = [
    c.watch_points > 0 && `${c.watch_points} pro ${c.watch_minutes} Minuten zuschauen`,
    c.chat_points > 0 && `${c.chat_points} pro Nachricht`,
    c.follow_points > 0 && `${c.follow_points} für einen Follow`,
    c.sub_points > 0 && `${c.sub_points} pro Sub`,
    c.raid_points > 0 && `${c.raid_points} für einen Raid`,
  ].filter(Boolean);
  return parts.length ? `${parts.join(' · ')}` : 'Gerade gibt es für nichts Punkte.';
}

function ViewerList({ currency, onOpen }: { currency: string; onOpen: (v: Viewer) => void }) {
  const [search, setSearch] = useState('');
  const { data: viewers, refetch } = useApi<Viewer[]>(`/points/viewers${search.trim() ? `?q=${encodeURIComponent(search.trim())}` : ''}`);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The list follows the Beitrag overlays, at most every few seconds.
  useWebSocket((event, data) => {
    if (event !== 'reward-leaderboard-update' || (data as { type?: string })?.type !== 'beitrag') return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(refetch, 3000);
  });

  return (
    <section aria-label="Zuschauer">
      <div className="card-line card-wrap" style={{ justifyContent: 'space-between' }}>
        <div className="rewards-name">Wer am meisten beiträgt</div>
        <SearchField value={search} onChange={setSearch} label="Zuschauer suchen" width={220} />
      </div>
      {viewers && viewers.length === 0 && <p className="dialog-empty">{search.trim() ? 'Niemand passt zur Suche.' : `Noch hat niemand ${currency}. Sie kommen im nächsten Stream.`}</p>}
      <div className="rewards-ranking">
        {(viewers ?? []).map((v) => (
          <div key={v.user_name} className="rewards-row">
            <span className="rewards-rank">{v.rank}</span>
            <div className="rewards-who">
              <div className="rewards-name">{v.display_name}</div>
              <div className="dialog-hint">Guthaben {v.balance} · heute {v.stream_total}</div>
            </div>
            <div className="rewards-total"><div className="rewards-total-n">{v.total}</div><div className="dialog-hint">Beitrag</div></div>
            <button type="button" className="card-secondary" onClick={() => onOpen(v)}>Öffnen</button>
          </div>
        ))}
      </div>
    </section>
  );
}

function ConfigDialog({ config, onClose, onSaved }: { config: Config; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [draft, setDraft] = useState({ ...config, bots: config.bots.join(', ') });
  const save = async () => {
    const body: Record<string, unknown> = { currency: draft.currency, bots: draft.bots.split(/[\s,]+/).filter(Boolean) };
    for (const [key] of RATES) body[key] = Number(draft[key]);
    const res = await apiFetch('/points/config', { method: 'PUT', body: JSON.stringify(body) });
    if (!res.ok) { toast.error(`Nicht gespeichert – ${(await res.json().catch(() => ({}))).error ?? 'Fehler'}`); return; }
    toast.success('Gespeichert'); onSaved(); onClose();
  };
  return (
    <Dialog
      title="Verdienen einstellen"
      sentence="Was es wofür gibt. 0 schaltet eine Quelle ab. Verdient wird nur, solange du live bist."
      onClose={onClose}
      width={560}
      footer={<>
        <button type="button" className="card-secondary" onClick={onClose}>Abbrechen</button>
        <button type="button" className="card-primary" onClick={save}>Speichern</button>
      </>}
    >
      <div className="dialog-grid">
        <div className="dialog-field"><label htmlFor="pt-currency">Name der Währung</label><input id="pt-currency" type="text" maxLength={30} value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value })} /></div>
        {RATES.map(([key, label, hint]) => (
          <div key={key} className="dialog-field">
            <label htmlFor={`pt-${key}`}>{label}</label>
            <input id={`pt-${key}`} type="number" min={0} value={String(draft[key])} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} style={{ width: 110 }} />
            <span className="dialog-hint">{hint}</span>
          </div>
        ))}
        <div className="dialog-field"><label htmlFor="pt-bots">Bots, die nichts bekommen</label><input id="pt-bots" type="text" value={draft.bots} onChange={(e) => setDraft({ ...draft, bots: e.target.value })} /><span className="dialog-hint">Twitch-Logins, mit Komma getrennt. Dein Kanal und dein Bot zählen nie.</span></div>
      </div>
      <p className="dialog-hint">Fürs Zuschauen braucht das Tool das Twitch-Recht, die Zuschauer im Chat zu sehen. Eine Anmeldung von vor dem 08.10. hat es noch nicht – dann einmal neu mit Twitch verbinden.</p>
    </Dialog>
  );
}

function RewardDialog({ reward, currency, onClose, onSaved }: {
  reward: Omit<Reward, 'id'> & { id?: number }; currency: string; onClose: () => void; onSaved: () => void;
}) {
  const { toast } = useToast();
  const [draft, setDraft] = useState(reward);
  const isNew = draft.id === undefined;

  const save = async () => {
    const body = { name: draft.name, cost: Number(draft.cost), action: draft.action, scene_name: draft.scene_name, scene_seconds: draft.scene_seconds, task: draft.task, minutes: draft.minutes, sound: draft.sound, needs_input: draft.action === 'alert' && draft.needs_input, cooldown_seconds: Number(draft.cooldown_seconds), enabled: draft.enabled };
    const res = await apiFetch(isNew ? '/points/rewards' : `/points/rewards/${draft.id}`, { method: isNew ? 'POST' : 'PATCH', body: JSON.stringify(body) });
    if (!res.ok) { toast.error(`Nicht gespeichert – ${(await res.json().catch(() => ({}))).error ?? 'Fehler'}`); return; }
    toast.success(isNew ? `„${draft.name.trim()}“ angelegt` : 'Gespeichert'); onSaved(); onClose();
  };
  const remove = async () => {
    if (!window.confirm(`Die Belohnung „${reward.name}“ löschen?`)) return;
    const res = await apiFetch(`/points/rewards/${draft.id}`, { method: 'DELETE' });
    if (!res.ok) { toast.error((await res.json().catch(() => ({}))).error ?? 'Nicht gelöscht'); return; }
    toast.success('Gelöscht'); onSaved(); onClose();
  };

  return (
    <Dialog
      title={isNew ? 'Belohnung anlegen' : reward.name}
      sentence={`Was Zuschauer mit ${currency} einlösen: !einlösen ${draft.name.trim() || '<Name>'}`}
      onClose={onClose}
      width={560}
      footer={<>
        {!isNew && <button type="button" className="card-link" onClick={remove}>Löschen</button>}
        <span style={{ flex: 1 }} />
        <button type="button" className="card-secondary" onClick={onClose}>Abbrechen</button>
        <button type="button" className="card-primary" onClick={save} disabled={!draft.name.trim() || (draft.action === 'scene' && !draft.scene_name) || (draft.action === 'sound' && !draft.sound) || (draft.action === 'timer' && !(draft.task ?? '').trim())}>{isNew ? 'Anlegen' : 'Speichern'}</button>
      </>}
    >
      <div className="dialog-grid">
        <div className="dialog-field"><label htmlFor="pr-name">Name</label><input id="pr-name" type="text" maxLength={40} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoFocus /></div>
        <div className="dialog-field"><label htmlFor="pr-cost">Preis ({currency})</label><input id="pr-cost" type="number" min={1} value={String(draft.cost)} onChange={(e) => setDraft({ ...draft, cost: Number(e.target.value) })} style={{ width: 120 }} /></div>
        <div className="dialog-field">
          <label htmlFor="pr-action">Was passiert</label>
          <select id="pr-action" value={draft.action} onChange={(e) => setDraft({ ...draft, action: e.target.value as Action })}>
            {(Object.keys(ACTIONS) as Action[]).map((a) => <option key={a} value={a}>{ACTIONS[a]}</option>)}
          </select>
        </div>
        {draft.action === 'scene' && (
          <ScenePicker scene={draft.scene_name} seconds={draft.scene_seconds} onChange={(scene, seconds) => setDraft({ ...draft, scene_name: scene, scene_seconds: seconds })} onLeave={onClose} />
        )}
        {(draft.action === 'timer' || draft.action === 'sound') && <BlockFields block={draft.action} task={draft.task ?? ''} minutes={draft.minutes ?? 5} sound={draft.sound} onChange={(p) => setDraft({ ...draft, ...p })} />}
        <div className="dialog-field"><label htmlFor="pr-cooldown">Sperre je Zuschauer (Sekunden)</label><input id="pr-cooldown" type="number" min={0} value={String(draft.cooldown_seconds)} onChange={(e) => setDraft({ ...draft, cooldown_seconds: Number(e.target.value) })} style={{ width: 120 }} /></div>
        {draft.action === 'alert' && <label className="card-check"><input type="checkbox" checked={draft.needs_input} onChange={(e) => setDraft({ ...draft, needs_input: e.target.checked })} /><span>Zuschauer schreibt einen Text dazu (erscheint im Alert)</span></label>}
        <label className="card-check"><input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} /><span>An</span></label>
      </div>
    </Dialog>
  );
}

function ViewerDialog({ viewer, currency, rewards, onClose }: { viewer: Viewer; currency: string; rewards: Reward[]; onClose: () => void }) {
  const { toast } = useToast();
  const [current, setCurrent] = useState(viewer);
  const [amount, setAmount] = useState('');
  const [rewardId, setRewardId] = useState('');
  const [input, setInput] = useState('');
  useEffect(() => setCurrent(viewer), [viewer]);
  const reward = rewards.find((r) => String(r.id) === rewardId);

  const adjust = async (sign: 1 | -1) => {
    const n = Number(amount);
    if (!Number.isInteger(n) || n <= 0) { toast.error('Eine Anzahl ist eine ganze Zahl über 0.'); return; }
    const result = await apiPost<Viewer>(`/points/viewers/${encodeURIComponent(current.user_name)}/adjust`, { amount: sign * n });
    if (!result) { toast.error('Nicht gespeichert'); return; }
    setCurrent({ ...current, ...result }); setAmount('');
    toast.success(`${sign > 0 ? '+' : '−'}${n} ${currency}`);
  };
  const redeem = async () => {
    if (!reward) return;
    const res = await apiFetch(`/points/viewers/${encodeURIComponent(current.user_name)}/redeem`, { method: 'POST', body: JSON.stringify({ reward: reward.name, input }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(body.message ?? 'Nicht eingelöst'); return; }
    setCurrent({ ...current, ...body.standing }); setInput('');
    toast.success(`„${reward.name}“ eingelöst`);
  };
  const forget = async () => {
    if (!window.confirm(`${current.display_name} vergessen? Alles, was unter diesem Namen gespeichert ist – Punkte, Bestenlisten, Songwünsche, Zählungen in den Streams –, wird gelöscht.`)) return;
    if (!(await apiPost('/reward-stats/forget', { user_name: current.user_name }))) { toast.error('Nicht gelöscht'); return; }
    toast.success(`${current.display_name} vergessen`); onClose();
  };

  return (
    <Dialog
      title={current.display_name}
      sentence={`Platz ${current.rank} · Beitrag ${current.total} · Guthaben ${current.balance} ${currency} · heute ${current.stream_total}`}
      onClose={onClose}
      width={560}
      footer={<>
        <button type="button" className="card-link" onClick={forget}>Zuschauer vergessen</button>
        <span style={{ flex: 1 }} />
        <button type="button" className="card-primary" onClick={onClose}>Fertig</button>
      </>}
    >
      <ul className="dialog-list">
        <li>
          <span className="dialog-list-text">{currency}</span>
          <input type="number" min={1} aria-label="Anzahl" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 90 }} />
          <button type="button" className="card-secondary" onClick={() => adjust(1)}>Geben</button>
          <button type="button" className="card-secondary" onClick={() => adjust(-1)}>Nehmen</button>
        </li>
      </ul>
      <p className="dialog-hint">Geben zählt wie Verdienen. Nehmen ist eine Korrektur und senkt auch den Beitrag.</p>
      <div className="dialog-grid">
        <div className="dialog-field">
          <label htmlFor="pv-reward">Für {current.display_name} einlösen</label>
          <select id="pv-reward" value={rewardId} onChange={(e) => setRewardId(e.target.value)}>
            <option value="">{rewards.length ? 'Belohnung wählen …' : 'Noch keine Belohnung'}</option>
            {rewards.filter((r) => r.enabled).map((r) => <option key={r.id} value={r.id}>{r.name} ({r.cost} {currency})</option>)}
          </select>
        </div>
        {reward?.needs_input && <div className="dialog-field"><label htmlFor="pv-input">Text</label><input id="pv-input" type="text" maxLength={200} value={input} onChange={(e) => setInput(e.target.value)} /></div>}
      </div>
      <button type="button" className="card-secondary" onClick={redeem} disabled={!reward || (reward.needs_input && !input.trim())}>Einlösen</button>
    </Dialog>
  );
}

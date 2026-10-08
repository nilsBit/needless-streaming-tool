import React, { useEffect, useRef, useState } from 'react';
import { useApi, apiFetch, apiPost, apiDelete } from '../hooks/useApi';
import { useWebSocket } from '../hooks/useWebSocket';
import { useToast } from '../contexts/ToastContext';
import Dialog from '../components/ux/Dialog';
import SearchField from '../components/ux/SearchField';
import RewardSteps, { type Step } from '../components/rewards/RewardSteps';
import RewardTemplates, { type RewardTemplate } from '../components/rewards/RewardTemplates';
import RewardQuestPath, { type RewardDraft } from '../components/rewards/RewardQuestPath';
import { useQuestPath } from '../components/quests/questStart';
import { useFeatures } from '../contexts/FeaturesContext';
import type { FeatureKey } from '../../../shared/features';

interface Config {
  currency: string; watch_points: number; watch_minutes: number; chat_points: number;
  follow_points: number; sub_points: number; raid_points: number; bits_per_point: number; bots: string[];
}
type Action = 'roulette' | 'feature_request' | 'change_music' | 'scene' | 'alert';
interface Reward { id: number; name: string; cost: number; action: Action; scene_name: string | null; needs_input: boolean; cooldown_seconds: number; enabled: boolean }
interface Viewer { user_name: string; display_name: string; balance: number; total: number; stream_total: number; rank: number }
interface SceneMapping { reward_title: string; scene_name: string }

const ACTIONS: Record<Action, string> = {
  alert: 'Nur ein Alert',
  roulette: 'Glücksrad drehen',
  feature_request: 'Vorschlag einreichen',
  change_music: 'Musik wechseln',
  scene: 'Szene wechseln',
};

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


// "Punkte" under Chat & Bot: the tool's own points next to Twitch channel
// points (spec 2026-10-08-eigene-punkte), laid out as design B (08.10.):
// three steps that say where the streamer stands, templates to start from,
// the rewards, how points are earned, who contributed and a corner to try
// it out — with give, take and "Für jemanden einlösen" on each viewer.
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
  const count = rewards?.filter((r) => r.enabled).length ?? 0;
  const firstReward = rewards?.find((r) => r.enabled);

  // New rewards are made on a Quest-Pfad; a template opens it filled in.
  const [path, setPath] = useState<{ initial?: Partial<RewardDraft> } | null>(null);
  const applyTemplate = (t: RewardTemplate) => setPath({ initial: { action: t.action, name: t.name, cost: t.cost } });
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

  const steps: Step[] = [
    {
      title: 'Verdienen',
      text: `Zuschauen, Chatten, Follow, Sub, Raid und Bits bringen ${currency} – nur, solange du live bist.`,
      state: status?.live ? 'Läuft gerade – du bist live' : 'Läuft in deinem nächsten Stream',
      done: true,
      action: { label: 'Einstellen', onClick: () => setEditingConfig(true) },
    },
    {
      title: 'Belohnungen anlegen',
      text: 'Was es dafür gibt. Fang mit einer Vorlage an.',
      state: count ? `${count} ${count === 1 ? 'Belohnung' : 'Belohnungen'} an` : 'Noch keine – unten eine Vorlage wählen',
      done: count > 0,
    },
    {
      title: 'Im Chat einlösen',
      text: 'Zuschauer schreiben !einlösen Name. !belohnungen zeigt die Liste, !punkte den eigenen Stand.',
      state: count ? 'Bereit' : 'Wartet auf Schritt 2',
      done: count > 0,
    },
  ];

  return (
    <div className="panel card-slim rewards">
      <RewardSteps steps={steps} label="So laufen die Punkte" />

      <RewardTemplates unit={currency} existing={(rewards ?? []).map((r) => r.name)} isOn={(f) => isOn(f as FeatureKey)} onUse={applyTemplate} />

      <section aria-label="Deine Belohnungen">
        <div className="card-line card-wrap">
          <div className="rewards-name">Deine Belohnungen</div>
          <button type="button" className="card-primary" onClick={() => setPath({})}>+ Eigene Belohnung</button>
        </div>
        {rewards && rewards.length === 0 && <p className="dialog-empty">Noch keine. Eine Vorlage oben ist der schnellste Anfang.</p>}
        <div className="rewards-ranking">
          {(rewards ?? []).map((r) => (
            <div key={r.id} className="rewards-row">
              <div className="rewards-who">
                <div className="rewards-name">{r.name}{r.enabled ? '' : ' (aus)'}</div>
                <div className="dialog-hint">{ACTIONS[r.action]}{r.action === 'scene' && r.scene_name ? ` „${r.scene_name}“` : ''}{r.needs_input ? ' · mit Text' : ''}{r.cooldown_seconds ? ` · Sperre ${r.cooldown_seconds} s` : ''}</div>
              </div>
              <div className="rewards-total"><div className="rewards-total-n">{r.cost}</div><div className="dialog-hint">{currency}</div></div>
              <button type="button" className="card-secondary" onClick={() => setEditingReward(r)}>Bearbeiten</button>
            </div>
          ))}
        </div>
      </section>

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
      {path && <RewardQuestPath mode="points" currency={currency} initial={path.initial} onClose={() => setPath(null)} onCreated={refetchRewards} onTry={tryReward} />}
      {editingReward && <RewardDialog reward={editingReward} currency={currency} onClose={() => setEditingReward(null)} onSaved={refetchRewards} />}
      {openViewer && <ViewerDialog viewer={openViewer} currency={currency} rewards={rewards ?? []} onClose={() => setOpenViewer(null)} />}
    </div>
  );
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
  const { data: mappings } = useApi<SceneMapping[]>('/obs/mappings');
  const [draft, setDraft] = useState(reward);
  const scenes = [...new Set((mappings ?? []).map((m) => m.scene_name))];
  const isNew = draft.id === undefined;

  const save = async () => {
    const body = { name: draft.name, cost: Number(draft.cost), action: draft.action, scene_name: draft.scene_name, needs_input: draft.needs_input, cooldown_seconds: Number(draft.cooldown_seconds), enabled: draft.enabled };
    const res = await apiFetch(isNew ? '/points/rewards' : `/points/rewards/${draft.id}`, { method: isNew ? 'POST' : 'PATCH', body: JSON.stringify(body) });
    if (!res.ok) { toast.error(`Nicht gespeichert – ${(await res.json().catch(() => ({}))).error ?? 'Fehler'}`); return; }
    toast.success(isNew ? `„${draft.name.trim()}“ angelegt` : 'Gespeichert'); onSaved(); onClose();
  };
  const remove = async () => {
    if (!window.confirm(`Die Belohnung „${reward.name}“ löschen?`)) return;
    if (!(await apiDelete(`/points/rewards/${draft.id}`))) { toast.error('Nicht gelöscht'); return; }
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
        <button type="button" className="card-primary" onClick={save} disabled={!draft.name.trim() || (draft.action === 'scene' && !draft.scene_name)}>{isNew ? 'Anlegen' : 'Speichern'}</button>
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
          <div className="dialog-field">
            <label htmlFor="pr-scene">Szene</label>
            <select id="pr-scene" value={draft.scene_name ?? ''} onChange={(e) => setDraft({ ...draft, scene_name: e.target.value || null })}>
              <option value="">{scenes.length ? 'Szene wählen …' : 'Keine Szene freigegeben'}</option>
              {scenes.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <span className="dialog-hint">Nur Szenen, die unter Overlays &amp; Alerts → Szenen in OBS für Belohnungen freigegeben sind.</span>
          </div>
        )}
        <div className="dialog-field"><label htmlFor="pr-cooldown">Sperre je Zuschauer (Sekunden)</label><input id="pr-cooldown" type="number" min={0} value={String(draft.cooldown_seconds)} onChange={(e) => setDraft({ ...draft, cooldown_seconds: Number(e.target.value) })} style={{ width: 120 }} /></div>
        <label className="card-check"><input type="checkbox" checked={draft.needs_input} onChange={(e) => setDraft({ ...draft, needs_input: e.target.checked })} /><span>Zuschauer schreibt einen Text dazu (erscheint im Alert)</span></label>
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
    if (!window.confirm(`${current.display_name} vergessen? Alles, was unter diesem Namen gespeichert ist – Punkte, Bestenlisten, Songwünsche –, wird gelöscht.`)) return;
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

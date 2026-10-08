import React, { useState } from 'react';
import { apiFetch } from '../../hooks/useApi';
import ScenePicker, { SCENE_DURATIONS } from './ScenePicker';
import { useToast } from '../../contexts/ToastContext';
import QuestPath, { ChoiceCards, PathDone } from '../quests/QuestPath';
import { useQuests } from '../quests/useQuests';

// Creating a reward as a Quest-Pfad (spec 2026-10-08-quests-design, design B
// on the canvas): Wirkung · Name & Preis · Vorschau · Geschafft. A scene
// change has a step of its own after Wirkung: the scene and how long (08.10.). One path for
// both kinds — the tool's own points (`points`) and Twitch channel points
// (`twitch`); they differ in where it is saved and how it is redeemed.

export type RewardAction = 'alert' | 'roulette' | 'feature_request' | 'change_music' | 'scene';

const ACTIONS: Array<{ value: RewardAction; title: string; text: string; icon: string; names: string[] }> = [
  { value: 'alert', title: 'Nur ein Alert', text: 'Eine Meldung im Stream – du reagierst darauf.', icon: 'M12 3a6 6 0 016 6v4l2 3H4l2-3V9a6 6 0 016-6zM10 19a2 2 0 004 0', names: ['Licht aus', 'Tanz!', 'Hallo sagen'] },
  { value: 'roulette', title: 'Glücksrad drehen', text: 'Das Rad wählt ein Thema für dich.', icon: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 3v9l6 4', names: ['Glücksrad drehen', 'Schicksal', 'Rad!'] },
  { value: 'feature_request', title: 'Idee einreichen', text: 'Der Zuschauer schreibt eine Idee dazu.', icon: 'M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9V16h7v-2.1A6 6 0 0012 3z', names: ['Idee einreichen', 'Mein Vorschlag', 'Weltidee'] },
  { value: 'change_music', title: 'Musik wechseln', text: 'Ein Alert – du wechselst den Song.', icon: 'M9 18V5l11-2v13M9 18a3 3 0 11-6 0 3 3 0 016 0zM20 16a3 3 0 11-6 0 3 3 0 016 0z', names: ['Musik wechseln', 'Nächster Song', 'DJ-Wunsch'] },
  { value: 'scene', title: 'Szene wechseln', text: 'Kurz eine andere Szene zeigen.', icon: 'M3 5h18v12H3zM8 21h8', names: ['Kamera groß', 'Karte zeigen', 'Szene wechseln'] },
];

const TIERS = {
  points: [{ value: 'klein', cost: 100, title: 'Klein', text: 'Öfter einlösbar' }, { value: 'mittel', cost: 300, title: 'Mittel', text: 'Etwas Besonderes' }, { value: 'gross', cost: 1000, title: 'Groß', text: 'Selten, für Treue' }],
  twitch: [{ value: 'klein', cost: 500, title: 'Klein', text: 'Öfter einlösbar' }, { value: 'mittel', cost: 2000, title: 'Mittel', text: 'Etwas Besonderes' }, { value: 'gross', cost: 10000, title: 'Groß', text: 'Selten, für Treue' }],
} as const;

export interface RewardDraft { action: RewardAction; name: string; cost: number; scene: string | null; sceneSeconds?: number }

interface Props {
  mode: 'points' | 'twitch';
  /** The name of the currency for points; channel points are called so. */
  currency: string;
  /** From a template: the path starts at "Name & Preis" with this filled in. */
  initial?: Partial<RewardDraft>;
  onClose: () => void;
  onCreated: () => void;
  /** Points only: give the streamer points to try the reward at once. */
  onTry?: (name: string) => void;
  /** Twitch only: the login lacks the right to create rewards. */
  onNeedsReconnect?: () => void;
}

export default function RewardQuestPath({ mode, currency, initial, onClose, onCreated, onTry, onNeedsReconnect }: Props) {
  const { toast } = useToast();
  const { quests } = useQuests();
  const tiers = TIERS[mode];
  const unit = mode === 'points' ? currency : 'Kanalpunkte';

  const [action, setAction] = useState<RewardAction>(initial?.action ?? 'alert');
  const [name, setName] = useState(initial?.name ?? ACTIONS.find((a) => a.value === (initial?.action ?? 'alert'))!.names[0]);
  const [cost, setCost] = useState<number>(initial?.cost ?? tiers[1].cost);
  const [scene, setScene] = useState<string | null>(initial?.scene ?? null);
  const [sceneSeconds, setSceneSeconds] = useState(initial?.sceneSeconds ?? 30);
  const [touchedName, setTouchedName] = useState(!!initial?.name);

  const act = ACTIONS.find((a) => a.value === action)!;
  const questKey = mode === 'points' ? 'pointReward' : 'channelReward';
  const questOpen = quests?.open.find((q) => q.key === questKey) ?? null;

  const pickAction = (v: RewardAction) => {
    setAction(v);
    if (!touchedName) setName(ACTIONS.find((a) => a.value === v)!.names[0]);
  };

  const create = async (): Promise<boolean> => {
    const res = mode === 'points'
      ? await apiFetch('/points/rewards', { method: 'POST', body: JSON.stringify({ name: name.trim(), cost, action, scene_name: scene, scene_seconds: sceneSeconds, needs_input: action === 'feature_request', cooldown_seconds: 0, enabled: true }) })
      : await apiFetch('/channel-rewards', { method: 'POST', body: JSON.stringify({ title: name.trim(), cost, action, scene_name: scene, scene_seconds: sceneSeconds, prompt: action === 'feature_request' ? 'Schreib deine Idee dazu.' : '', input_required: action === 'feature_request', enabled: true }) });
    if (res.status === 401 && mode === 'twitch') { onNeedsReconnect?.(); toast.error('Dem Twitch-Login fehlt das Recht, Belohnungen anzulegen.'); return false; }
    if (!res.ok) { toast.error((await res.json().catch(() => ({}))).error ?? 'Nicht angelegt'); return false; }
    onCreated();
    return true;
  };

  const redeemLine = mode === 'points'
    ? <><span className="preview-who viewer">kartograph:</span> !einlösen {name.trim()}<br /><span className="preview-who bot">Bot:</span> @kartograph löst „{name.trim()}“ ein (−{cost} {unit}, noch 140).</>
    : <><span className="preview-who viewer">kartograph</span> hat „{name.trim()}“ für {cost} Kanalpunkte eingelöst.</>;

  return (
    <QuestPath
      title={mode === 'points' ? `Belohnung für ${currency}` : 'Belohnung für Kanalpunkte'}
      sentence={mode === 'points' ? 'Was deine Zuschauer mit deinen Punkten im Chat einlösen.' : 'Erscheint bei deinen Zuschauern im Kanalpunkte-Fenster von Twitch.'}
      startAt={initial ? 1 : 0}
      finishLabel="Anlegen"
      onFinish={create}
      onClose={onClose}
      steps={[
        {
          label: 'Wirkung',
          content: (
            <>
              <h3 className="quest-step-title">Was soll passieren, wenn jemand sie einlöst?</h3>
              <ChoiceCards label="Wirkung" options={ACTIONS} value={action} onChange={pickAction} />
            </>
          ),
        },
        ...(action === 'scene' ? [{
          label: 'Szene',
          ready: !!scene,
          content: (
            <>
              <h3 className="quest-step-title">Welche Szene zeigt sie, und wie lange?</h3>
              <ScenePicker scene={scene} seconds={sceneSeconds} onChange={(s, sec) => { setScene(s); setSceneSeconds(sec); }} onLeave={onClose} />
            </>
          ),
        }] : []),
        {
          label: 'Name & Preis',
          ready: !!name.trim() && cost > 0 && (action !== 'scene' || !!scene),
          content: (
            <>
              <h3 className="quest-step-title">Wie heißt sie, und was kostet sie?</h3>
              <div className="dialog-field">
                <label htmlFor="rq-name">{mode === 'points' ? 'Name – so schreibt der Chat ihn: !einlösen Name' : 'Name'}</label>
                <input id="rq-name" type="text" maxLength={mode === 'points' ? 40 : 45} value={name} onChange={(e) => { setName(e.target.value); setTouchedName(true); }} className="quest-input" autoFocus />
                <div className="card-row card-wrap">
                  <span className="dialog-hint">Vorschläge:</span>
                  {act.names.map((n) => <button key={n} type="button" className="pill" onClick={() => { setName(n); setTouchedName(true); }}>{n}</button>)}
                </div>
              </div>
              <ChoiceCards
                label="Preis"
                options={[
                  ...tiers.map((t) => ({ value: String(t.cost), title: `${t.cost} ${unit}`, text: `${t.title} · ${t.text}` })),
                  // A template's own price stays a choice next to the three.
                  ...(initial?.cost && !tiers.some((t) => t.cost === initial.cost) ? [{ value: String(initial.cost), title: `${initial.cost} ${unit}`, text: 'Vorschlag der Vorlage' }] : []),
                ]}
                value={String(cost)}
                onChange={(v) => setCost(Number(v))}
              />
              {mode === 'points' && <p className="dialog-hint" style={{ margin: 0 }}>Zum Vergleich: Wer zwei Stunden zuschaut und mitchattet, sammelt etwa 90 {unit}.</p>}
            </>
          ),
        },
        {
          label: 'Vorschau',
          content: (
            <>
              <h3 className="quest-step-title">So sieht es für deine Zuschauer aus</h3>
              <span className="quest-kicker">{mode === 'points' ? 'Im Chat' : 'Bei Twitch'}</span>
              <div className="quest-preview-chat">{redeemLine}</div>
              <span className="quest-kicker">Im Stream</span>
              <div className="quest-preview-alert"><span className="quest-preview-label">{unit}</span><span><strong>kartograph</strong> löst „{name.trim()}“ ein.</span></div>
              <p className="dialog-hint" style={{ margin: 0 }}>{act.title}{action === 'scene' && scene ? ` „${scene}“ für ${SCENE_DURATIONS.find((d) => d.seconds === sceneSeconds)?.label ?? `${sceneSeconds} Sekunden`}` : ''}. Klappt die Aktion nicht, gibt es die Punkte zurück.</p>
            </>
          ),
        },
      ]}
      done={
        <PathDone
          title={`„${name.trim()}“ ist da!`}
          xp={questOpen ? questOpen.xp : null}
          text={mode === 'points' ? 'Deine Zuschauer sehen sie ab sofort mit !belohnungen.' : 'Deine Zuschauer sehen sie ab sofort unter den Kanalpunkten.'}
        >
          {mode === 'points' && onTry && <button type="button" className="card-primary" onClick={() => onTry(name.trim())}>Jetzt testen</button>}
        </PathDone>
      }
    />
  );
}

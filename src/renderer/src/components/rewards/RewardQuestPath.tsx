import React, { useState } from 'react';
import { apiFetch } from '../../hooks/useApi';
import ScenePicker, { SCENE_DURATIONS } from './ScenePicker';
import { useToast } from '../../contexts/ToastContext';
import QuestPath, { ChoiceCards, PathDone } from '../quests/QuestPath';
import { useQuests } from '../quests/useQuests';
import BlockFields from './BlockFields';
import { BLOCKS, streamPreview, type Block } from './rewardBlocks';

// Creating a reward as a Quest-Pfad (spec 2026-10-08-quests-design, design B
// on the canvas): Wirkung · Name & Preis · Vorschau · Geschafft. A scene
// change has a step of its own after Wirkung: the scene and how long (08.10.). One path for
// both kinds — the tool's own points (`points`) and Twitch channel points
// (`twitch`); they differ in where it is saved and how it is redeemed.

const TIERS = {
  points: [{ value: 'klein', cost: 100, title: 'Klein', text: 'Öfter einlösbar' }, { value: 'mittel', cost: 300, title: 'Mittel', text: 'Etwas Besonderes' }, { value: 'gross', cost: 1000, title: 'Groß', text: 'Selten, für Treue' }],
  twitch: [{ value: 'klein', cost: 500, title: 'Klein', text: 'Öfter einlösbar' }, { value: 'mittel', cost: 2000, title: 'Mittel', text: 'Etwas Besonderes' }, { value: 'gross', cost: 10000, title: 'Groß', text: 'Selten, für Treue' }],
} as const;

export interface RewardDraft { action: Block; name: string; cost: number; scene: string | null; sceneSeconds?: number }

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

  const [action, setAction] = useState<Block>(initial?.action ?? 'alert');
  const [name, setName] = useState(initial?.name ?? BLOCKS.find((a) => a.value === (initial?.action ?? 'alert'))!.names[0]);
  const [cost, setCost] = useState<number>(initial?.cost ?? tiers[1].cost);
  const [scene, setScene] = useState<string | null>(initial?.scene ?? null);
  const [sceneSeconds, setSceneSeconds] = useState(initial?.sceneSeconds ?? 30);
  const [task, setTask] = useState('');
  const [minutes, setMinutes] = useState(5);
  const [sound, setSound] = useState<string | null>(null);
  const [withText, setWithText] = useState(false);
  const [touchedName, setTouchedName] = useState(!!initial?.name);

  const act = BLOCKS.find((a) => a.value === action)!;
  const questKey = mode === 'points' ? 'pointReward' : 'channelReward';
  const questOpen = quests?.open.find((q) => q.key === questKey) ?? null;

  const pickAction = (v: Block) => {
    setAction(v);
    if (!touchedName) setName(BLOCKS.find((a) => a.value === v)!.names[0]);
  };

  const create = async (): Promise<boolean> => {
    const extras = { task: action === 'timer' ? (task.trim() || name.trim()) : undefined, minutes: action === 'timer' ? minutes : undefined, sound: action === 'sound' ? sound : undefined };
    const res = mode === 'points'
      ? await apiFetch('/points/rewards', { method: 'POST', body: JSON.stringify({ name: name.trim(), cost, action, scene_name: scene, scene_seconds: sceneSeconds, ...extras, needs_input: action === 'alert' && withText, cooldown_seconds: 0, enabled: true }) })
      : await apiFetch('/channel-rewards', { method: 'POST', body: JSON.stringify({ title: name.trim(), cost, action, scene_name: scene, scene_seconds: sceneSeconds, ...extras, input_required: action === 'alert' && withText, enabled: true }) });
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
              <ChoiceCards label="Wirkung" options={[...BLOCKS]} value={action} onChange={pickAction} />
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
        ...(action === 'timer' || action === 'sound' ? [{
          label: action === 'timer' ? 'Aufgabe' : 'Ton',
          ready: action === 'timer' ? !!(task.trim() || name.trim()) : !!sound,
          content: (
            <>
              <h3 className="quest-step-title">{action === 'timer' ? 'Welche Aufgabe, und wie lange?' : 'Welcher Ton?'}</h3>
              <BlockFields block={action} task={task} minutes={minutes} sound={sound} onChange={(p) => { if (p.task !== undefined) setTask(p.task); if (p.minutes !== undefined) setMinutes(p.minutes); if (p.sound !== undefined) setSound(p.sound); }} />
            </>
          ),
        }] : []),
        ...(action === 'alert' ? [{
          label: 'Text',
          content: (
            <>
              <h3 className="quest-step-title">Schreibt der Zuschauer etwas dazu?</h3>
              <ChoiceCards label="Text" value={withText ? 'ja' : 'nein'} onChange={(v) => setWithText(v === 'ja')} options={[
                { value: 'ja', title: 'Ja, er schreibt etwas dazu', text: 'Der Text steht im Alert unter seinem Namen.' },
                { value: 'nein', title: 'Nein, nur der Alert', text: 'Name und Belohnung, sonst nichts.' },
              ]} />
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
              <div className="quest-preview-alert"><span className="quest-preview-label">{unit}</span><span>{streamPreview(action, name.trim(), { minutes, sound, withText })}</span></div>
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

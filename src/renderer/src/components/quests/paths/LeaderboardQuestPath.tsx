import React, { useState } from 'react';
import { apiFetch, getServerPort, useApi } from '../../../hooks/useApi';
import { useToast } from '../../../contexts/ToastContext';
import QuestPath, { ChoiceCards, PathDone } from '../QuestPath';
import { useQuests } from '../useQuests';
import CopyButton from '../../CopyButton';

// Creating a Bestenliste as a Quest-Pfad (spec 2026-10-08-quests-design):
// Belohnung · Name · Ins Bild · Geschafft — the end hands the overlay address.

interface TwitchReward { id: string; title: string }

interface Props {
  /** Rewards that already have a list. */
  taken: Set<string>;
  onClose: () => void;
  onCreated: () => void;
}

export default function LeaderboardQuestPath({ taken, onClose, onCreated }: Props) {
  const { toast } = useToast();
  const { quests } = useQuests();
  const { data } = useApi<{ rewards: TwitchReward[]; error?: string }>('/auth/twitch/rewards');
  const rewards = (data?.rewards ?? []).filter((r) => !taken.has(r.id));
  const [rewardId, setRewardId] = useState('');
  const [title, setTitle] = useState('');
  const [key, setKey] = useState('');
  const reward = rewards.find((r) => r.id === rewardId);
  const quest = quests?.open.find((q) => q.key === 'leaderboard') ?? null;
  const address = `http://localhost:${getServerPort()}/overlay/reward-leaderboard/?type=${key}`;

  const pick = (id: string) => {
    setRewardId(id);
    const r = rewards.find((x) => x.id === id);
    if (r && !title.trim()) setTitle(r.title);
  };

  const create = async (): Promise<boolean> => {
    if (!reward) return false;
    const res = await apiFetch('/leaderboards', { method: 'POST', body: JSON.stringify({ title: title.trim(), reward }) });
    if (!res.ok) { toast.error((await res.json().catch(() => ({}))).error ?? 'Nicht angelegt'); return false; }
    setKey((await res.json()).leaderboard.key);
    onCreated();
    return true;
  };

  return (
    <QuestPath
      title="Neue Bestenliste"
      sentence="Wer eine Belohnung am öftesten einlöst – im Bild, mit Rangwechsel."
      finishLabel="Anlegen"
      onFinish={create}
      onClose={onClose}
      steps={[
        {
          label: 'Belohnung',
          ready: !!reward,
          content: (
            <>
              <h3 className="quest-step-title">Welche Belohnung soll zählen?</h3>
              {!data && <p className="dialog-hint">Lade deine Belohnungen aus Twitch …</p>}
              {data?.error && <p className="dialog-hint" role="alert">{data.error} – erst mit Twitch verbinden.</p>}
              {data && !data.error && rewards.length === 0 && <p className="dialog-empty">Keine freie Belohnung. Leg unter Chat &amp; Bot → Kanalpunkte eine an.</p>}
              <ChoiceCards label="Belohnung" value={rewardId} onChange={pick} options={rewards.map((r) => ({ value: r.id, title: r.title, text: 'Jede Einlösung zählt einen Punkt.' }))} />
            </>
          ),
        },
        {
          label: 'Name',
          ready: !!title.trim(),
          content: (
            <>
              <h3 className="quest-step-title">Wie heißt die Liste im Bild?</h3>
              <input aria-label="Name der Liste" type="text" maxLength={45} className="quest-input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
              <span className="dialog-hint">So steht sie über den Top 3 im Overlay und in !stats.</span>
            </>
          ),
        },
        {
          label: 'Ins Bild',
          content: (
            <>
              <h3 className="quest-step-title">So erscheint „{title.trim()}“ im Stream</h3>
              <div className="quest-preview-alert">
                <span className="quest-preview-label">{title.trim()}</span>
                <span>1 · kartograph · 12</span><span>2 · nachtgilde · 9</span><span>3 · saldor_fan · 4</span>
              </div>
              <p className="dialog-hint" style={{ margin: 0 }}>Bei jeder Einlösung fährt die Liste kurz ins Bild. Nach dem Anlegen bekommst du die Adresse für OBS.</p>
            </>
          ),
        },
      ]}
      done={
        <PathDone title={`„${title.trim()}“ zählt ab jetzt`} xp={quest ? quest.xp : null} text="Füge in OBS eine Browserquelle mit dieser Adresse hinzu – oder nimm die Bestenliste ohne ?type=, dann zeigt sie jede Liste, sobald dort eingelöst wird.">
          <code className="quest-address">{address}</code>
          <CopyButton text={address} label="Adresse kopieren" />
        </PathDone>
      }
    />
  );
}

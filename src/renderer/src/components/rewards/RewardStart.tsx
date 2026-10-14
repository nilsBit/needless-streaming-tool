import React, { useState } from 'react';
import { apiFetch } from '../../hooks/useApi';
import { useToast } from '../../contexts/ToastContext';
import Dialog from '../ux/Dialog';
import BlockFields from './BlockFields';
import { BLOCKS, PERSONAS, REWARD_TEMPLATES, streamPreview, templateCost, type Persona, type RewardTemplate } from './rewardBlocks';

// "+ Neue Belohnung" (Entwurf A, 14.10.): templates first, filtered by
// persona; a template opens one sheet – name, price, at most one field –
// and "Anlegen". "Eigene Belohnung" goes step by step (RewardQuestPath).
export default function RewardStart({ mode, currency, existing, isOn, onClose, onCreated, onOwn, onNeedsReconnect }: {
  mode: 'points' | 'twitch'; currency: string; existing: string[]; isOn: (f: string) => boolean;
  onClose: () => void; onCreated: () => void; onOwn: () => void; onNeedsReconnect?: () => void;
}) {
  const { toast } = useToast();
  const [persona, setPersona] = useState<Persona | 'alle'>('alle');
  const [picked, setPicked] = useState<RewardTemplate | null>(null);
  const [name, setName] = useState('');
  const [cost, setCost] = useState(0);
  const [task, setTask] = useState('');
  const [minutes, setMinutes] = useState(5);
  const [sound, setSound] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const unit = mode === 'points' ? currency : 'Kanalpunkte';
  const taken = new Set(existing.map((n) => n.trim().toLowerCase()));
  const shown = REWARD_TEMPLATES.filter((t) => (!t.feature || isOn(t.feature)) && (persona === 'alle' || t.persona === persona));

  const pick = (t: RewardTemplate) => {
    setPicked(t); setName(t.name); setCost(templateCost(t, mode)); setTask(t.name.replace(/:.*$/, '')); setMinutes(t.minutes ?? 5); setSound(null);
  };

  const create = async () => {
    if (!picked) return;
    setBusy(true);
    const common = { cost, action: picked.block, task: picked.block === 'timer' ? task : undefined, minutes: picked.block === 'timer' ? minutes : undefined, sound: picked.block === 'sound' ? sound : undefined, enabled: true };
    const res = mode === 'points'
      ? await apiFetch('/points/rewards', { method: 'POST', body: JSON.stringify({ ...common, name: name.trim(), needs_input: !!picked.needsInput, cooldown_seconds: 0 }) })
      : await apiFetch('/channel-rewards', { method: 'POST', body: JSON.stringify({ ...common, title: name.trim(), input_required: !!picked.needsInput }) });
    setBusy(false);
    if (res.status === 401 && mode === 'twitch') { onNeedsReconnect?.(); toast.error('Dem Twitch-Login fehlt das Recht, Belohnungen anzulegen.'); return; }
    if (!res.ok) { toast.error((await res.json().catch(() => ({}))).error ?? 'Nicht angelegt'); return; }
    toast.success(`„${name.trim()}“ ist da!`);
    onCreated();
  };

  if (!picked) return (
    <Dialog title="Neue Belohnung" sentence="Nimm eine Vorlage – Name und Preis kannst du gleich danach anpassen." onClose={onClose} width={860}
      footer={<button type="button" className="card-secondary" onClick={onClose}>Abbrechen</button>}>
      <div className="card-row card-wrap" role="radiogroup" aria-label="Für welchen Stream">
        {PERSONAS.map((p) => <button key={p.value} type="button" role="radio" aria-checked={persona === p.value} className={`pill ${persona === p.value ? 'active' : ''}`} onClick={() => setPersona(p.value)}>{p.label}</button>)}
      </div>
      <div className="reward-template-grid">
        {shown.map((t) => {
          const made = taken.has(t.name.toLowerCase());
          return (
            <button key={t.key} type="button" className="reward-template" onClick={() => pick(t)} disabled={made}>
              <span className="reward-template-name">{t.name}</span>
              <span className="reward-template-does">{t.does}</span>
              <span className="reward-template-foot">
                <span className="reward-template-cost">{templateCost(t, mode)} <span>{unit}</span></span>
                <span className="ovl-chip">{made ? 'gibt es schon' : BLOCKS.find((b) => b.value === t.block)!.title}</span>
              </span>
            </button>
          );
        })}
        <button type="button" className="reward-template reward-template-own" onClick={onOwn}>
          <span className="reward-template-name">+ Eigene Belohnung</span>
          <span className="reward-template-does">Ohne Vorlage, Schritt für Schritt</span>
        </button>
      </div>
    </Dialog>
  );

  const needsSound = picked.block === 'sound' && !sound;
  return (
    <Dialog title={picked.name} sentence={picked.does} onClose={onClose} width={620}
      footer={<>
        <button type="button" className="card-secondary" onClick={() => setPicked(null)}>Andere Vorlage</button>
        <span style={{ flex: 1 }} />
        <button type="button" className="card-primary" onClick={create} disabled={busy || !name.trim() || cost < 1 || needsSound || (picked.block === 'timer' && !task.trim())}>{busy ? 'Legt an …' : 'Anlegen'}</button>
      </>}>
      <div className="dialog-grid">
        <div className="dialog-field"><label htmlFor="rs-name">Name</label><input id="rs-name" type="text" maxLength={mode === 'points' ? 40 : 45} value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
        <div className="dialog-field"><label htmlFor="rs-cost">Preis ({unit})</label><input id="rs-cost" type="number" min={1} value={String(cost)} onChange={(e) => setCost(Number(e.target.value))} style={{ width: 140 }} /></div>
        <BlockFields block={picked.block} task={task} minutes={minutes} sound={sound} onChange={(p) => { if (p.task !== undefined) setTask(p.task); if (p.minutes !== undefined) setMinutes(p.minutes); if (p.sound !== undefined) setSound(p.sound); }} />
      </div>
      <div className="chat-box-row"><div className="ovl-box-text"><b>So sieht es im Stream aus</b><span>{streamPreview(picked.block, name.trim(), { minutes, sound, withText: picked.needsInput })}</span></div></div>
    </Dialog>
  );
}

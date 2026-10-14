import React, { useEffect, useState } from 'react';
import { apiGet, getServerPort } from '../../hooks/useApi';
import { DURATIONS, type Block } from './rewardBlocks';

// The one field a block needs beyond name and price: the task and minutes of a
// timer, the sound of a sound. Every other block needs none (14.10.: "der User
// soll nicht erschlagen werden an Optionen").
export default function BlockFields({ block, task, minutes, sound, onChange }: {
  block: Block; task: string; minutes: number; sound: string | null;
  onChange: (p: { task?: string; minutes?: number; sound?: string | null }) => void;
}) {
  const [sounds, setSounds] = useState<string[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (block !== 'sound') return;
    void apiGet<{ sounds: string[] }>('/alerts').then((r) => {
      if (!r) { setFailed(true); return; }
      const list = r.sounds ?? [];
      setSounds(list);
      if (!sound && list[0]) onChange({ sound: list[0] });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block]);

  if (block === 'timer') return (
    <>
      <div className="dialog-field">
        <label htmlFor="bf-task">Aufgabe – steht so im Bild</label>
        <input id="bf-task" type="text" maxLength={60} value={task} onChange={(e) => onChange({ task: e.target.value })} />
      </div>
      <div className="dialog-field">
        <span style={{ color: 'var(--text-secondary)' }} id="bf-minutes">Wie lange?</span>
        <div className="card-row card-wrap" role="radiogroup" aria-labelledby="bf-minutes">
          {DURATIONS.map((m) => (
            <button key={m} type="button" role="radio" aria-checked={minutes === m} className={`pill ${minutes === m ? 'active' : ''}`} onClick={() => onChange({ minutes: m })}>{m} Min</button>
          ))}
        </div>
      </div>
    </>
  );

  if (block === 'sound') {
    if (failed) return <p className="dialog-hint" role="alert">Töne konnten nicht geladen werden.</p>;
    if (sounds && sounds.length === 0) return <p className="dialog-hint" role="alert">Noch keine Töne – unter Overlays &amp; Alerts → Alerts hochladen.</p>;
    const play = (name: string) => { try { void new Audio(`http://localhost:${getServerPort()}/public/alert-sound/${encodeURIComponent(name)}`).play(); } catch { /* nothing to hear */ } };
    return (
      <div className="dialog-field">
        <span style={{ color: 'var(--text-secondary)' }} id="bf-sound">Welcher Ton?</span>
        <div className="card-row card-wrap" role="radiogroup" aria-labelledby="bf-sound">
          {(sounds ?? []).map((s) => (
            <button key={s} type="button" role="radio" aria-checked={sound === s} className={`pill ${sound === s ? 'active' : ''}`} onClick={() => { onChange({ sound: s }); play(s); }}>▶ {s.replace(/\.[a-z0-9]+$/i, '')}</button>
          ))}
        </div>
      </div>
    );
  }
  return null;
}

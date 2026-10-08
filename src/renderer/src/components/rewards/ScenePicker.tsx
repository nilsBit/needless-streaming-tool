import React from 'react';
import { useApi } from '../../hooks/useApi';
import { useNavigate } from '../../NavigationContext';

// "Szene wechseln" on a reward (08.10.): the scene straight from OBS and how
// long it stays — no releasing scenes beforehand. Only the scene chosen here
// can be shown by this reward; the viewer never names one.

export const SCENE_DURATIONS = [{ seconds: 15, label: '15 Sekunden' }, { seconds: 30, label: '30 Sekunden' }, { seconds: 60, label: '1 Minute' }];

export default function ScenePicker({ scene, seconds, onChange, onLeave }: {
  scene: string | null;
  seconds: number | null;
  onChange: (scene: string | null, seconds: number) => void;
  /** Called before "OBS verbinden" leaves the page, e.g. to close a dialog. */
  onLeave?: () => void;
}) {
  const go = useNavigate();
  const { data, error } = useApi<{ scenes: string[]; current: string | null }>('/obs/scenes');
  const scenes = data?.scenes ?? [];
  const chosenSeconds = seconds ?? 30;
  // A scene saved earlier that OBS does not list (OBS off, or renamed) stays choosable.
  const shown = scene && !scenes.includes(scene) ? [scene, ...scenes] : scenes;

  return (
    <div className="scene-picker">
      <span className="dialog-field-label">Welche Szene?</span>
      {error && !data && (
        <div className="reward-banner" role="alert">
          <span>OBS ist nicht verbunden – dann kennt das Tool deine Szenen nicht.</span>
          <button type="button" className="card-secondary" onClick={() => { onLeave?.(); go({ area: 'settings', subTab: 'verbindungen' }); }}>OBS verbinden</button>
        </div>
      )}
      {data && scenes.length === 0 && <p className="dialog-empty">In OBS gibt es noch keine Szene.</p>}
      <div className="ovl-scene-picks" role="radiogroup" aria-label="Szene">
        {shown.map((s) => (
          <button key={s} type="button" role="radio" aria-checked={s === scene} className={`ovl-scene-pick ${s === scene ? 'on' : ''}`} onClick={() => onChange(s, chosenSeconds)}>{s}</button>
        ))}
      </div>
      <span className="dialog-field-label">Wie lange?</span>
      <div className="ovl-scene-picks" role="radiogroup" aria-label="Dauer">
        {SCENE_DURATIONS.map((d) => (
          <button key={d.seconds} type="button" role="radio" aria-checked={d.seconds === chosenSeconds} className={`ovl-scene-pick ${d.seconds === chosenSeconds ? 'on' : ''}`} onClick={() => onChange(scene, d.seconds)}>{d.label}</button>
        ))}
      </div>
      <span className="dialog-hint">Danach kommt von selbst die Szene zurück, die vorher lief. Nur diese eine Szene kann die Belohnung zeigen.</span>
    </div>
  );
}

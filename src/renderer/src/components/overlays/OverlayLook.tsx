import React, { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../hooks/useApi';
import { useToast } from '../../contexts/ToastContext';
import { useWebSocket } from '../../hooks/useWebSocket';
import { sendPreview, type PaletteConfig } from './previewBus';

// "Aussehen" in an overlay's workshop (08.10.): it follows the style for all,
// or has its own colours and size. Every change shows in the preview at once
// and is saved a moment later; only then does OBS see it.

const COLORS = [
  ['--color-accent', 'Akzent', '#e0201b'],
  ['--color-primary', 'Erste Farbe', '#f3ecdd'],
  ['--color-secondary', 'Zweite Farbe', '#a79f90'],
] as const;

export default function OverlayLook({ name, onStyleForAll }: { name: string; onStyleForAll: () => void }) {
  const { toast } = useToast();
  const [config, setConfig] = useState<PaletteConfig | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // An edit not yet saved wins over a broadcast of the older state.
  const editing = useRef(false);

  const load = () => apiFetch('/overlay-config').then((r) => r.json()).then((c: PaletteConfig) => { if (!editing.current) setConfig(c); }).catch(() => {});
  useEffect(() => { load(); return () => { if (timer.current) clearTimeout(timer.current); }; }, []);
  useWebSocket((event) => { if (event === 'overlay-config') load(); });

  if (!config) return <p className="dialog-hint">Laden …</p>;
  const own = config.overrides?.[name];
  const value = (key: string, fallback: string) => own?.[key] || config.global?.[key] || fallback;

  const save = (vars: Record<string, string>, now = false) => {
    const next = { ...config, overrides: { ...config.overrides } };
    if (Object.keys(vars).length) next.overrides[name] = vars; else delete next.overrides[name];
    setConfig(next);
    sendPreview(next);
    editing.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      timer.current = null;
      const res = await apiFetch(`/overlay-config/overrides/${name}`, { method: 'PUT', body: JSON.stringify({ vars }) }).catch(() => null);
      editing.current = false;
      if (!res?.ok) toast.error('Aussehen nicht gespeichert');
    }, now ? 0 : 600);
  };
  const takeOwn = () => save({ '--color-accent': value('--color-accent', COLORS[0][2]) }, true);
  const set = (key: string, v: string) => save({ ...(own ?? {}), [key]: v });

  return (
    <div className="ovl-look">
      <p className="dialog-hint" style={{ margin: 0 }}>Freiwillig. Zählt nicht zu den drei Schritten.</p>
      <div className="ovl-look-choice" role="radiogroup" aria-label="Aussehen">
        <button type="button" role="radio" aria-checked={!own} className={`ovl-look-card ${!own ? 'active' : ''}`} onClick={() => own && save({}, true)}>
          <strong>Wie alle</strong>
          <span>Farben und Schrift aus „Stil für alle“</span>
        </button>
        <button type="button" role="radio" aria-checked={!!own} className={`ovl-look-card ${own ? 'active' : ''}`} onClick={() => !own && takeOwn()}>
          <strong>Eigener Stil</strong>
          <span>Nur dieses Overlay sieht anders aus</span>
        </button>
      </div>
      {own && (
        <>
          <div className="ov2-color-grid">
            {COLORS.map(([key, label, fallback]) => (
              <div key={key} className="ov2-color-item">
                <input type="color" aria-label={label} value={value(key, fallback)} onChange={(e) => set(key, e.target.value)} />
                <span>{label}</span>
              </div>
            ))}
          </div>
          <div className="config-row">
            <label htmlFor={`look-size-${name}`}>Grundgröße</label>
            <input id={`look-size-${name}`} type="range" min="10" max="28" step="1" value={parseInt(value('--font-size-base', '18px'))} onChange={(e) => set('--font-size-base', `${e.target.value}px`)} />
            <span>{value('--font-size-base', '18px')}</span>
          </div>
        </>
      )}
      <button type="button" className="card-link" style={{ alignSelf: 'flex-start' }} onClick={onStyleForAll}>Stil für alle ändern</button>
    </div>
  );
}

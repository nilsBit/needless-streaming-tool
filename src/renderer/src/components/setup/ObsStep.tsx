import React, { useState } from 'react';
import { useApi, apiPost } from '../../hooks/useApi';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useToast } from '../../contexts/ToastContext';
import { overlaysOf } from '../../../../shared/features';

interface CatalogEntry { name: string; base: string; label: string; sentence: string; size: { width: number; height: number } | null; url: string; builtin: boolean }
interface OverlayScenes { connected: boolean; byOverlay: Record<string, string[]> }
interface PlaceResult { overlay: string; scene: string; status: 'created' | 'exists' | 'no-scene' }

interface Props { picked: ReadonlySet<string> }

// Step 3: the browser sources the choice needs, placed in OBS by the tool —
// one per overlay or all at once, each in a scene of choice. What already
// sits somewhere is shown, not placed again. Without OBS: the addresses.
export default function ObsStep({ picked }: Props) {
  const { toast } = useToast();
  const { data: catalog } = useApi<CatalogEntry[]>('/overlays/catalog');
  const { data: obs, refetch: refetchObs } = useApi<{ connected: boolean }>('/obs/status');
  const { data: scenesData, refetch: refetchScenes } = useApi<{ scenes: string[]; current: string | null }>('/obs/scenes');
  const { data: placement, refetch: refetchPlacement } = useApi<OverlayScenes>('/obs/overlay-scenes');
  const [sceneFor, setSceneFor] = useState<Record<string, string>>({});
  const [sceneChoice, setSceneChoice] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useWebSocket((event) => {
    if (event === 'obs-status') { refetchObs(); refetchScenes(); refetchPlacement(); }
    if (event === 'obs-scene-changed') refetchPlacement();
  });

  const scenes = scenesData?.scenes ?? [];
  // Until a scene is chosen: the one OBS shows right now, else the first.
  const sceneAll = sceneChoice && scenes.includes(sceneChoice) ? sceneChoice
    : scenesData?.current && scenes.includes(scenesData.current) ? scenesData.current : scenes[0] ?? '';

  const wanted = overlaysOf(picked);
  // A Bestenliste overlay appears once per list; all of them belong to the feature.
  const rows = (catalog ?? []).filter((e) => wanted.includes(e.base));
  const connected = !!obs?.connected;
  const placedIn = (name: string): string[] => placement?.connected ? (placement.byOverlay[name] ?? []) : [];
  const sceneOf = (name: string) => sceneFor[name] || sceneAll || scenes[0] || '';

  const place = async (name: string): Promise<boolean> => {
    const scene = sceneOf(name);
    if (!scene) return false;
    const result = await apiPost<PlaceResult>('/obs/place-overlay', { overlay: name, scene });
    if (!result) { toast.error(`„${rows.find((r) => r.name === name)?.label ?? name}“ konnte nicht angelegt werden`); return false; }
    return true;
  };
  const copyAddress = async (url: string) => {
    try { await navigator.clipboard.writeText(url); toast.success('Adresse kopiert'); }
    catch { toast.error('Konnte nicht kopieren'); }
  };
  const placeOne = async (name: string) => { setBusy(name); await place(name); await refetchPlacement(); setBusy(null); };
  const placeAll = async () => {
    setBusy('all');
    let n = 0;
    for (const row of rows) if (placedIn(row.name).length === 0 && await place(row.name)) n++;
    await refetchPlacement();
    setBusy(null);
    if (n > 0) toast.success(`${n} ${n === 1 ? 'Browserquelle' : 'Browserquellen'} in OBS angelegt`);
  };

  if (rows.length === 0) {
    return <p className="setup-empty">Deine Auswahl braucht kein Overlay in OBS. Weiter zum Schluss.</p>;
  }

  const open = rows.filter((r) => placedIn(r.name).length === 0).length;
  const fullscreen = rows.filter((r) => r.size && r.size.width >= 1920).map((r) => r.label);

  return (
    <div className="obs-step">
      {connected ? (
        <div className="obs-step-bar">
          <div className="card-row card-wrap">
            <label htmlFor="setup-scene-all">Szene für alle</label>
            <select id="setup-scene-all" className="card-select" value={sceneAll} onChange={(e) => { setSceneChoice(e.target.value); setSceneFor({}); }}>
              {scenes.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            {fullscreen.length > 0 && <span className="dialog-hint">{fullscreen.join(' und ')} {fullscreen.length === 1 ? 'liegt' : 'liegen'} über allem – in jede Szene, in der du zu sehen bist.</span>}
          </div>
          <button type="button" className="card-primary" onClick={placeAll} disabled={busy !== null || open === 0}>
            {open === 0 ? 'Alles liegt in OBS' : `Alle ${open} in OBS anlegen`}
          </button>
        </div>
      ) : (
        <p className="setup-empty">OBS ist nicht verbunden – einen Schritt zurück, dann legt das Tool die Quellen für dich an. Von Hand geht es auch: Adresse kopieren, in OBS eine Browserquelle mit der angegebenen Größe anlegen.</p>
      )}

      <div className="obs-rows" role="list" aria-label="Browserquellen">
        {rows.map((r) => {
          const inScenes = placedIn(r.name);
          const done = inScenes.length > 0;
          return (
            <div key={r.name} role="listitem" className={`obs-row ${done ? 'done' : ''}`}>
              <span className={`obs-row-dot ${done ? 'on' : ''}`} aria-hidden="true" />
              <div className="obs-row-text">
                <strong>{r.label}</strong>
                <span>{r.sentence}</span>
              </div>
              <span className="obs-row-size">{r.size ? `${r.size.width} × ${r.size.height}` : 'Bildgröße'}</span>
              {connected && !done && (
                <label className="obs-row-scene">
                  <span className="dialog-hint">Szene</span>
                  <select className="card-select" value={sceneOf(r.name)} onChange={(e) => setSceneFor({ ...sceneFor, [r.name]: e.target.value })}>
                    {scenes.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
              )}
              <div className="obs-row-action">
                {done
                  ? <span className="obs-row-ok">in OBS · {inScenes.join(', ')}</span>
                  : connected
                    ? <button type="button" className="card-secondary" onClick={() => placeOne(r.name)} disabled={busy !== null}>{busy === r.name ? 'Legt an …' : 'In OBS anlegen'}</button>
                    : <button type="button" className="card-secondary" onClick={() => copyAddress(r.url)}>Adresse kopieren</button>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

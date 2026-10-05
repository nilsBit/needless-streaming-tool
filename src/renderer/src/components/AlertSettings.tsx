import React, { useEffect, useRef, useState } from 'react';
import { apiDelete, apiFetch, apiGet, getServerPort } from '../hooks/useApi';
import { useToast } from '../contexts/ToastContext';

interface AlertRow {
  slot: string;
  name: string;
  placeholders: string[];
  defaults: { label: string; text: string };
  label: string;
  text: string;
  sound: string | null;
  volume: number;
}

interface Overview {
  alerts: AlertRow[];
  sounds: string[];
  limits: { label: number; text: number; soundBytes: number };
}

/**
 * The streamer's own wording and sound for each alert. The name stands first
 * in the overlay, in the accent — the text is what follows it.
 */
export default function AlertSettings() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Overview | null>(null);
  const [rows, setRows] = useState<Record<string, AlertRow>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const take = (overview: Overview | null) => {
    if (!overview) return;
    setData(overview);
    setRows(Object.fromEntries(overview.alerts.map((a) => [a.slot, a])));
  };

  useEffect(() => { apiGet<Overview>('/alerts').then(take); }, []);

  const edit = (slot: string, change: Partial<AlertRow>) =>
    setRows((prev) => ({ ...prev, [slot]: { ...prev[slot], ...change } }));

  /** Saves every row as it stands; an emptied field comes back as the built-in wording. */
  const save = async (): Promise<boolean> => {
    const body = Object.fromEntries(
      Object.values(rows).map((r) => [r.slot, { label: r.label, text: r.text, sound: r.sound, volume: r.volume }]),
    );
    const res = await apiFetch('/alerts', { method: 'POST', body: JSON.stringify(body) });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      toast.error(err?.error ? `Nicht gespeichert: ${err.error}` : 'Nicht gespeichert');
      return false;
    }
    take(await res.json());
    return true;
  };

  const saveAll = async () => { if (await save()) toast.success('Alerts gespeichert'); };

  // What is tested is what is on the page, so it is saved first.
  const test = async (slot: string) => {
    if (!(await save())) return;
    const res = await apiFetch(`/alerts/test/${slot}`, { method: 'POST' });
    if (!res.ok) toast.error('Test fehlgeschlagen');
  };

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (data && file.size > data.limits.soundBytes) { toast.error('Die Datei ist zu groß (höchstens 5 MB).'); return; }
    const res = await apiFetch(`/alerts/sounds?name=${encodeURIComponent(file.name)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: file,
    });
    if (!res.ok) { toast.error('Nur .mp3, .wav oder .ogg.'); return; }
    const overview = (await res.json()) as Overview & { name: string };
    // Rows being edited keep their text; only the list of sounds is new.
    setData(overview);
    toast.success(`${overview.name} hinzugefügt — jetzt bei einem Alert auswählen`);
  };

  const removeSound = async (name: string) => {
    if (!(await apiDelete(`/alerts/sounds/${encodeURIComponent(name)}`))) { toast.error('Löschen fehlgeschlagen'); return; }
    setRows((prev) => Object.fromEntries(Object.entries(prev).map(([k, r]) => [k, r.sound === name ? { ...r, sound: null } : r])));
    setData((prev) => (prev ? { ...prev, sounds: prev.sounds.filter((s) => s !== name) } : prev));
  };

  const listen = (name: string, volume: number) => {
    const audio = new Audio(`http://localhost:${getServerPort()}/public/alert-sound/${encodeURIComponent(name)}`);
    audio.volume = volume;
    audio.play().catch(() => toast.error('Der Ton lässt sich hier nicht abspielen.'));
  };

  const withSound = Object.values(rows).filter((r) => r.sound).length;

  return (
    <div className={`s-card ${open ? 'expanded' : ''}`}>
      <div className="s-card-header">
        <div className="s-card-info">
          <span className="s-card-icon">🔔</span>
          <div>
            <div className="s-card-title">Alerts — Texte und Töne</div>
            <div className="s-card-status" style={{ color: '#888' }}>
              {withSound === 0 ? 'Alle Alerts sind stumm' : `${withSound} von ${Object.keys(rows).length} mit Ton`}
            </div>
          </div>
        </div>
        <button className={`s-card-action ${open ? 'ghost' : 'primary'}`} onClick={() => setOpen((o) => !o)}>
          {open ? '▲' : '▼'}
        </button>
      </div>
      {open && data && (
        <div className="s-card-body">
          <div className="s-card-status" style={{ color: '#888' }}>
            Der Name steht im Overlay vorn, der Text folgt ihm. Ein leeres Feld nimmt wieder den Standardtext.
            {' '}Platzhalter rechnen auch: {'{monate*5}'} ergibt nur die Zahl (35), ohne „Monate“.
          </div>
          {/* Töne bringt das Tool nicht mit — ohne eigene Datei gibt es nichts auszuwählen. */}
          <div className="s-card-input-row" style={{ alignItems: 'center' }}>
            <label className="s-card-action primary" style={{ cursor: 'pointer', textAlign: 'center' }}>
              Tondatei hinzufügen…
              <input ref={fileRef} type="file" accept=".mp3,.wav,.ogg,audio/*" onChange={upload} style={{ display: 'none' }} />
            </label>
            <span className="s-card-status" style={{ color: data.sounds.length ? '#888' : 'var(--accent)' }}>
              {data.sounds.length
                ? `${data.sounds.length} ${data.sounds.length === 1 ? 'Ton' : 'Töne'} zur Auswahl (.mp3, .wav, .ogg)`
                : 'Noch keine Töne vorhanden — erst eine eigene Datei hinzufügen (.mp3, .wav, .ogg), dann je Alert auswählen.'}
            </span>
          </div>
          {data.alerts.map(({ slot }) => {
            const row = rows[slot];
            if (!row) return null;
            return (
              <div key={slot} className="s-alert-row">
                <div className="s-command-row">
                  <span className="s-command-label">{row.name}</span>
                  <input
                    type="text" style={{ flex: '0 0 130px' }} maxLength={data.limits.label}
                    value={row.label} placeholder={row.defaults.label} title="Überschrift"
                    onChange={(e) => edit(slot, { label: e.target.value })}
                  />
                  <input
                    type="text" maxLength={data.limits.text}
                    value={row.text} placeholder={row.defaults.text} title="Text nach dem Namen"
                    onChange={(e) => edit(slot, { text: e.target.value })}
                  />
                </div>
                <div className="s-command-row">
                  <span className="s-command-label">
                    {row.placeholders.map((p) => `{${p}}`).join(' ')}
                  </span>
                  <select
                    className="s-alert-select" value={row.sound ?? ''} title="Ton"
                    onChange={(e) => edit(slot, { sound: e.target.value || null })}
                  >
                    <option value="">{data.sounds.length ? 'Kein Ton' : 'Kein Ton (noch keine Datei)'}</option>
                    {data.sounds.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <input
                    type="range" min={0} max={1} step={0.05} style={{ flex: '0 0 110px', padding: 0 }}
                    value={row.volume} disabled={!row.sound} title={`Lautstärke ${Math.round(row.volume * 100)} %`}
                    onChange={(e) => edit(slot, { volume: Number(e.target.value) })}
                  />
                  <button className="s-card-action ghost" disabled={!row.sound} onClick={() => row.sound && listen(row.sound, row.volume)} title="Hier anhören">▶</button>
                  <button className="s-card-action primary" onClick={() => test(slot)} title="Speichert und zeigt diesen Alert im Overlay — im Stream sichtbar">Test</button>
                </div>
              </div>
            );
          })}
          <div className="s-card-input-row">
            <button className="s-card-action primary" onClick={saveAll}>Speichern</button>
          </div>
          {data.sounds.length > 0 && (
            <div className="s-alert-sounds">
              {data.sounds.map((s) => (
                <span key={s} className="s-alert-sound">
                  {s}
                  <button onClick={() => listen(s, 0.6)} title="Anhören">▶</button>
                  <button onClick={() => removeSound(s)} title="Datei löschen">✕</button>
                </span>
              ))}
            </div>
          )}
          <div className="s-card-status" style={{ color: '#888' }}>
            Der Ton läuft im Alerts-Overlay. Damit er im Stream ankommt, muss in OBS an der Browser-Quelle
            „Audio über OBS steuern“ an sein. „Test“ ist im Stream sichtbar und hörbar.
          </div>
        </div>
      )}
    </div>
  );
}

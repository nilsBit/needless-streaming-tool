import React, { useEffect, useRef, useState } from 'react';
import { apiDelete, apiFetch, apiGet, getServerPort } from '../hooks/useApi';
import { useToast } from '../contexts/ToastContext';
import Dialog from '../components/ux/Dialog';
import SearchField, { matchesSearch } from '../components/ux/SearchField';

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

const WHEN: Record<string, string> = {
  follow: 'wenn jemand folgt',
  sub: 'wenn jemand abonniert',
  resub: 'wenn jemand sein Abo verlängert',
  subgift: 'wenn jemand ein Abo schenkt',
  subgift_many: 'wenn jemand mehrere Abos schenkt',
  raid: 'wenn ein Raid ankommt',
  cheer: 'wenn jemand Bits gibt',
};

const SAMPLE: Record<string, string> = { monate: '7', empfaenger: 'Lesezeichen42', abos: '5', zuschauer: '42', bits: '100' };

/** The text as the Tafel would show it, with sample values for the placeholders. */
function sample(text: string): string {
  return text.replace(/\{([a-z]+)(\s*[*+/-]\s*[\d.]+)?\}/g, (_m, name: string, calc?: string) => {
    const value = SAMPLE[name];
    if (value === undefined) return `{${name}}`;
    if (!calc) return value;
    const n = Number(value);
    if (Number.isNaN(n)) return value;
    const op = calc.trim()[0];
    const by = Number(calc.trim().slice(1));
    const result = op === '*' ? n * by : op === '+' ? n + by : op === '-' ? n - by : n / by;
    return Number.isInteger(result) ? String(result) : result.toFixed(2).replace('.', ',');
  });
}

// "Alerts" under Overlays & Alerts: one card per occasion, the Tafel as a
// preview with a sample name, the sound, and a dialog that holds wording,
// sound and volume together. Same settings and routes as before.
export default function AlertSettings() {
  const { toast } = useToast();
  const [data, setData] = useState<Overview | null>(null);
  const [rows, setRows] = useState<Record<string, AlertRow>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<AlertRow | null>(null);
  const [sounds, setSounds] = useState(false);
  const [soundSearch, setSoundSearch] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const take = (overview: Overview | null) => {
    if (!overview) return;
    setData(overview);
    setRows(Object.fromEntries(overview.alerts.map((a) => [a.slot, a])));
  };
  useEffect(() => { apiGet<Overview>('/alerts').then(take); }, []);

  /** Saves every row as it stands (the route takes them all); an emptied field comes back as the built-in wording. */
  const saveRows = async (next: Record<string, AlertRow>): Promise<boolean> => {
    const body = Object.fromEntries(Object.values(next).map((r) => [r.slot, { label: r.label, text: r.text, sound: r.sound, volume: r.volume }]));
    const res = await apiFetch('/alerts', { method: 'POST', body: JSON.stringify(body) });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      toast.error(err?.error ? `Nicht gespeichert: ${err.error}` : 'Nicht gespeichert');
      return false;
    }
    take(await res.json());
    return true;
  };

  const openEdit = (slot: string) => { setEditing(slot); setDraft({ ...rows[slot] }); };
  const closeEdit = () => { setEditing(null); setDraft(null); };
  const saveDraft = async () => {
    if (!draft) return;
    if (await saveRows({ ...rows, [draft.slot]: draft })) { toast.success('Alert gespeichert'); closeEdit(); }
  };

  // What is tested is what is on the page, so it is saved first.
  const test = async (slot: string) => {
    const next = draft && draft.slot === slot ? { ...rows, [slot]: draft } : rows;
    if (!(await saveRows(next))) return;
    const res = await apiFetch(`/alerts/test/${slot}`, { method: 'POST' });
    if (!res.ok) toast.error('Test fehlgeschlagen'); else toast.success('Alert läuft im Stream');
  };

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (data && file.size > data.limits.soundBytes) { toast.error('Die Datei ist zu groß (höchstens 5 MB).'); return; }
    const res = await apiFetch(`/alerts/sounds?name=${encodeURIComponent(file.name)}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file });
    if (!res.ok) { toast.error('Nur .mp3, .wav oder .ogg.'); return; }
    const overview = (await res.json()) as Overview & { name: string };
    setData(overview);
    toast.success(`${overview.name} hinzugefügt – jetzt bei einem Alert auswählen`);
  };
  const removeSound = async (name: string) => {
    if (!window.confirm(`Ton „${name}“ löschen?`)) return;
    if (!(await apiDelete(`/alerts/sounds/${encodeURIComponent(name)}`))) { toast.error('Löschen fehlgeschlagen'); return; }
    setRows((prev) => Object.fromEntries(Object.entries(prev).map(([k, r]) => [k, r.sound === name ? { ...r, sound: null } : r])));
    setDraft((prev) => (prev && prev.sound === name ? { ...prev, sound: null } : prev));
    setData((prev) => (prev ? { ...prev, sounds: prev.sounds.filter((s) => s !== name) } : prev));
  };
  const listen = (name: string, volume: number) => {
    const audio = new Audio(`http://localhost:${getServerPort()}/public/alert-sound/${encodeURIComponent(name)}`);
    audio.volume = volume;
    audio.play().catch(() => toast.error('Der Ton lässt sich hier nicht abspielen.'));
  };

  if (!data) return <div className="panel"><p className="empty">Laden …</p></div>;

  const list = data.alerts.map(({ slot }) => rows[slot]).filter(Boolean);
  const silent = list.filter((r) => !r.sound).length;

  return (
    <div className="panel card-slim alerts">
      <div className="card-line card-wrap">
        <div className="card-status">
          {silent === 0
            ? <span className="ovl-chip on">Alle Alerts haben einen Ton</span>
            : <><span className="ovl-chip warm">{silent} {silent === 1 ? 'Alert' : 'Alerts'} ohne Ton</span><span>Ohne Ton erscheint die Tafel stumm. Den Ton wählst du je Karte unter „Bearbeiten“.</span></>}
        </div>
        <button type="button" className="card-secondary" onClick={() => setSounds(true)}>Töne verwalten{data.sounds.length ? ` · ${data.sounds.length}` : ''}</button>
      </div>

      <div className="alert-cards">
        {list.map((row) => (
          <section key={row.slot} className="alert-card" aria-label={row.name}>
            <div className="card-line"><h3 className="alert-card-name">{row.name}</h3><span className="dialog-hint">{WHEN[row.slot] ?? ''}</span></div>
            <div className="alert-tafel" aria-label="So sieht die Tafel aus">
              <div className="alert-tafel-kicker">{row.label || row.defaults.label}</div>
              <div className="alert-tafel-text"><strong>Kartograph</strong> {sample(row.text || row.defaults.text)}</div>
            </div>
            <div className="card-status">
              {row.sound ? <span className="ovl-chip">Ton: {row.sound}</span> : <span className="ovl-chip warm">Kein Ton</span>}
            </div>
            <div className="card-row card-wrap">
              <button type="button" className="card-secondary" onClick={() => openEdit(row.slot)}>Bearbeiten</button>
              <button type="button" className="card-link" onClick={() => test(row.slot)}>Im Stream testen</button>
            </div>
          </section>
        ))}
      </div>
      <span className="dialog-hint">„Im Stream testen“ sehen und hören auch die Zuschauer. Damit der Ton im Stream ankommt, muss in OBS an der Browserquelle der Alerts „Audio über OBS steuern“ an sein.</span>

      {editing && draft && (
        <Dialog
          title={`${draft.name} bearbeiten`}
          sentence={`Die Tafel ${WHEN[draft.slot] ?? ''}: Überschrift, Text nach dem Namen, Ton und Lautstärke. Leere Felder nehmen wieder den Standardtext.`}
          onClose={closeEdit}
          width={640}
          footer={<>
            <button type="button" className="card-link" onClick={() => test(draft.slot)}>Speichern und im Stream testen</button>
            <span style={{ flex: 1 }} />
            <button type="button" className="card-secondary" onClick={closeEdit}>Abbrechen</button>
            <button type="button" className="card-primary" onClick={saveDraft}>Speichern</button>
          </>}
        >
          <div className="alert-tafel" aria-label="Vorschau">
            <div className="alert-tafel-kicker">{draft.label || draft.defaults.label}</div>
            <div className="alert-tafel-text"><strong>Kartograph</strong> {sample(draft.text || draft.defaults.text)}</div>
          </div>
          <div className="dialog-grid">
            <div className="dialog-field">
              <label htmlFor="al-label">Überschrift</label>
              <input id="al-label" type="text" maxLength={data.limits.label} placeholder={draft.defaults.label} value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
            </div>
            <div className="dialog-field">
              <label htmlFor="al-sound">Ton</label>
              <select id="al-sound" className="card-select" value={draft.sound ?? ''} onChange={(e) => setDraft({ ...draft, sound: e.target.value || null })}>
                <option value="">{data.sounds.length ? 'Kein Ton' : 'Kein Ton – noch keine Datei'}</option>
                {data.sounds.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="dialog-field">
            <label htmlFor="al-text">Text nach dem Namen</label>
            <input id="al-text" type="text" maxLength={data.limits.text} placeholder={draft.defaults.text} value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
            {draft.placeholders.length > 0 && (
              <span className="dialog-hint">Platzhalter: {draft.placeholders.map((p) => `{${p}}`).join(' · ')}. Mit Rechnung dahinter, etwa {'{monate*5}'}, steht nur die Zahl da.</span>
            )}
          </div>
          <div className="dialog-field">
            <label htmlFor="al-volume">Lautstärke · {Math.round(draft.volume * 100)} %</label>
            <div className="card-row">
              <input id="al-volume" type="range" min={0} max={1} step={0.05} value={draft.volume} disabled={!draft.sound} onChange={(e) => setDraft({ ...draft, volume: Number(e.target.value) })} />
              <button type="button" className="card-secondary" disabled={!draft.sound} onClick={() => draft.sound && listen(draft.sound, draft.volume)}>Anhören</button>
            </div>
          </div>
        </Dialog>
      )}

      {sounds && (
        <Dialog
          title="Töne verwalten"
          sentence="Eigene Dateien, .mp3, .wav oder .ogg, bis 5 MB. Das Tool bringt keine Töne mit."
          onClose={() => { setSounds(false); setSoundSearch(''); }}
          width={560}
          footer={<>
            <button type="button" className="card-secondary" onClick={() => fileRef.current?.click()}>Tondatei hinzufügen</button>
            <span style={{ flex: 1 }} />
            <button type="button" className="card-primary" onClick={() => { setSounds(false); setSoundSearch(''); }}>Fertig</button>
          </>}
        >
          <input ref={fileRef} type="file" accept=".mp3,.wav,.ogg,audio/*" onChange={upload} style={{ display: 'none' }} />
          {data.sounds.length === 0 && <p className="dialog-empty">Noch keine Töne. Erst eine Datei hinzufügen, dann je Alert auswählen.</p>}
          {/* Found by file name or by the alert it plays at ("raid" finds the raid sound). */}
          {data.sounds.length > 0 && <SearchField value={soundSearch} onChange={setSoundSearch} label="Töne suchen" width={260} />}
          {data.sounds.length > 0 && !data.sounds.some((s) => matchesSearch(soundSearch, s, ...list.filter((r) => r.sound === s).map((r) => r.name))) && (
            <p className="dialog-empty">Kein Ton passt zur Suche.</p>
          )}
          <ul className="dialog-list">
            {data.sounds.map((s) => {
              const used = list.filter((r) => r.sound === s).map((r) => r.name);
              if (!matchesSearch(soundSearch, s, ...used)) return null;
              return (
                <li key={s}>
                  <span className="dialog-list-text">{s}{used.length > 0 && <span className="dialog-hint"> · bei {used.join(', ')}</span>}</span>
                  <button type="button" className="card-secondary" onClick={() => listen(s, 0.6)}>Anhören</button>
                  <button type="button" className="card-link" onClick={() => removeSound(s)}>Löschen</button>
                </li>
              );
            })}
          </ul>
        </Dialog>
      )}
    </div>
  );
}

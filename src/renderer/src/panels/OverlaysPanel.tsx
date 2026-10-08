import React, { useLayoutEffect, useRef, useState } from 'react';
import { useApi, apiPost, apiFetch, getServerPort } from '../hooks/useApi';
import { useToast } from '../contexts/ToastContext';
import { useWebSocket } from '../hooks/useWebSocket';
import Dialog from '../components/ux/Dialog';
import OverlayQuestPath from '../components/quests/paths/OverlayQuestPath';
import { useQuestPath } from '../components/quests/questStart';
import { useNavigate, type NavTarget } from '../NavigationContext';
import { lightUp, openAt } from '../components/ux/openAt';
import { useVisibleInterval } from '../hooks/useVisibleInterval';
import SearchField, { matchesSearch } from '../components/ux/SearchField';
import { useFeatures } from '../contexts/FeaturesContext';
import type { FeatureKey } from '../../../shared/features';

// "Overlays" under Overlays & Alerts: on the left every overlay, grouped by
// purpose, with a dot for "in OBS"; on the right the chosen one — a live
// preview (sample data while the overlay still has its default layout, the
// overlay itself otherwise), where it sits in OBS, its address and size, and
// what to do with it. Own overlays are created and edited here as well.

type Group = 'always' | 'join' | 'today' | 'rewards' | 'screens' | 'alerts' | 'custom';

interface CatalogEntry {
  name: string;
  label: string;
  sentence: string;
  group: Group;
  size: { width: number; height: number } | null;
  previewState: string | null;
  url: string;
  builtin: boolean;
  customized: boolean;
  customizedBy: Array<'html' | 'palette' | 'figma'>;
  feature: FeatureKey | null;
}

interface OverlayScenes { connected: boolean; byOverlay: Record<string, string[]> }

const GROUP_LABELS: Record<Group, string> = {
  always: 'Immer da', join: 'Mitmachen', today: 'Heute im Stream', rewards: 'Bestenlisten',
  screens: 'Start, Pause, Ende', alerts: 'Meldungen', custom: 'Eigene Overlays',
};
const GROUP_ORDER: Group[] = ['always', 'join', 'today', 'rewards', 'screens', 'alerts', 'custom'];
const WHY: Record<CatalogEntry['customizedBy'][number], string> = { html: 'HTML geändert', palette: 'eigene Farben', figma: 'Figma-Entwurf übernommen' };

// Overlays a test event exists for (POST /api/actions/overlay-test/<name>).
const TESTABLE = new Set(['alerts', 'song', 'poll', 'milestone', 'roulette', 'challenge', 'todos', 'progress', 'reward-leaderboard', 'reward-rankchange', 'character', 'chat']);

/** The overlay with its sample state, unless it is customized (then live). A list overlay's address already carries ?type=. */
function withSampleState(entry: CatalogEntry): string {
  if (entry.customized || !entry.previewState) return entry.url;
  return `${entry.url}${entry.url.includes('?') ? '&' : '?'}state=${encodeURIComponent(entry.previewState)}`;
}

/** The preview box scales the overlay down to fit; this measures the box once it exists. */
function useBoxWidth(): [(el: HTMLDivElement | null) => void, number] {
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!box) return;
    const update = () => setWidth(box.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(box);
    return () => observer.disconnect();
  }, [box]);
  return [setBox, width];
}

// Where an overlay's content is set (08.10.: "wie stelle ich die ein?").
// `card` is the card on "Im Stream" that drives it.
const CONTENT: Record<string, { where: string; area: NavTarget['area']; subTab: string; card?: string }> = {
  alerts: { where: 'Overlays & Alerts → Alerts', area: 'overlays', subTab: 'alerts' },
  milestone: { where: 'Overlays & Alerts → Meilensteine', area: 'overlays', subTab: 'meilensteine' },
  'reward-leaderboard': { where: 'Overlays & Alerts → Bestenlisten', area: 'overlays', subTab: 'bestenlisten' },
  'reward-rankchange': { where: 'Overlays & Alerts → Bestenlisten', area: 'overlays', subTab: 'bestenlisten' },
  start: { where: 'Overlays & Alerts → Szenen in OBS', area: 'overlays', subTab: 'szenen' },
  pause: { where: 'Overlays & Alerts → Szenen in OBS', area: 'overlays', subTab: 'szenen' },
  end: { where: 'Overlays & Alerts → Szenen in OBS', area: 'overlays', subTab: 'szenen' },
  challenge: { where: 'Im Stream → Ziel für heute', area: 'stream', subTab: 'stream', card: 'challenge' },
  roulette: { where: 'Im Stream → Glücksrad', area: 'stream', subTab: 'stream', card: 'issues' },
  poll: { where: 'Im Stream → Abstimmung', area: 'stream', subTab: 'stream', card: 'designs' },
  progress: { where: 'Im Stream → Fortschritt', area: 'stream', subTab: 'stream', card: 'progress' },
  todos: { where: 'Im Stream → Fortschritt', area: 'stream', subTab: 'stream', card: 'progress' },
  song: { where: 'Im Stream → Musik', area: 'stream', subTab: 'stream', card: 'song' },
  character: { where: 'Im Stream → Eintrag aus der Welt', area: 'stream', subTab: 'stream', card: 'world' },
};

export default function OverlaysPanel() {
  const { toast } = useToast();
  const { isOn } = useFeatures();
  const { data: catalog, loading, refetch: refetchCatalog } = useApi<CatalogEntry[]>('/overlays/catalog');
  const { data: placement, refetch: refetchPlacement } = useApi<OverlayScenes>('/obs/overlay-scenes');
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  // Into OBS on a Quest-Pfad: from the list, or with the overlay that is open.
  const [placing, setPlacing] = useState<{ initial?: string } | null>(null);
  useQuestPath(['overlay'], (k) => setPlacing(k === 'entryCard' ? { initial: 'character' } : {}));
  const go = useNavigate();
  const [newName, setNewName] = useState('');
  const [uploadMode, setUploadMode] = useState<'template' | 'file'>('template');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [editor, setEditor] = useState<{ entry: CatalogEntry; html: string; loading: boolean; saving: boolean } | null>(null);
  const [boxRef, boxWidth] = useBoxWidth();

  useWebSocket((event) => {
    if (event === 'obs-status' || event === 'obs-scene-changed') refetchPlacement();
    if (event === 'overlay-config' || event === 'design-implement') refetchCatalog();
  });
  // Only while the window is seen; on show it looks once at once.
  useVisibleInterval(refetchPlacement, 30_000);

  // Overlays of features that are off stay out of the list — they are hidden, not gone.
  const entries = (catalog ?? []).filter((e) => e.feature === null || isOn(e.feature));
  const selected = entries.find((e) => e.name === selectedName) ?? entries[0] ?? null;

  const scenesOf = (entry: CatalogEntry): string[] | null => {
    if (!placement?.connected) return null;
    return placement.byOverlay[entry.name] ?? [];
  };

  const copy = async (text: string, done: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(done); }
    catch { toast.error('Kopieren fehlgeschlagen'); }
  };

  const testOnStream = async (entry: CatalogEntry) => {
    const result = await apiPost(`/actions/overlay-test/${entry.name}`, {});
    if (result) toast.success('Test läuft im Stream'); else toast.error('Aktion fehlgeschlagen');
  };

  const openLarge = (entry: CatalogEntry) => {
    const url = withSampleState(entry);
    const size = entry.size ?? { width: 1280, height: 720 };
    window.open(url, '_blank', `noopener,width=${size.width},height=${size.height}`);
  };
  const openShowcase = (live: boolean) => {
    window.open(`http://localhost:${getServerPort()}/overlay/showcase/${live ? '?live' : ''}`, '_blank', 'noopener,width=1400,height=900');
  };

  // Own overlays: create from the template or from an uploaded file, edit the
  // HTML, delete. Built-in overlays: edit the HTML as an override, reset it.
  const customBase = (entry: CatalogEntry) => entry.name.replace(/^custom\//, '');
  const createFromTemplate = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const { html } = await (await apiFetch('/overlays/template')).json();
      const name = newName.trim();
      const customHtml = html
        .replace("OVERLAY_NAME = 'MeinOverlay'", `OVERLAY_NAME = '${name}'`)
        .replace('<div class="title">MEIN OVERLAY</div>', `<div class="title">${name.toUpperCase()}</div>`)
        .replace('<title>Custom Overlay Template</title>', `<title>${name}</title>`);
      const res = await apiFetch('/overlays', { method: 'POST', body: JSON.stringify({ name, html: customHtml }) });
      if (!res.ok) { const err = await res.json().catch(() => ({})); toast.error(err.error || 'Anlegen fehlgeschlagen'); return; }
      setNewName(''); setCreating(false);
      refetchCatalog();
      setSelectedName(`custom/${name}`);
    } catch { toast.error('Anlegen fehlgeschlagen'); }
    finally { setBusy(false); }
  };
  const uploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !newName.trim()) return;
    setBusy(true);
    try {
      const name = newName.trim();
      const res = await apiFetch('/overlays', { method: 'POST', body: JSON.stringify({ name, html: await file.text() }) });
      if (!res.ok) { const err = await res.json().catch(() => ({})); toast.error(err.error || 'Hochladen fehlgeschlagen'); return; }
      setNewName(''); setCreating(false);
      refetchCatalog();
      setSelectedName(`custom/${name}`);
    } catch { toast.error('Hochladen fehlgeschlagen'); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };
  const deleteCustom = async (entry: CatalogEntry) => {
    if (!window.confirm(`„${entry.label}“ löschen? Die Browserquelle in OBS zeigt dann ins Leere.`)) return;
    const res = await apiFetch(`/overlays/${encodeURIComponent(customBase(entry))}`, { method: 'DELETE' });
    if (!res.ok) { toast.error('Löschen fehlgeschlagen'); return; }
    setSelectedName(null);
    refetchCatalog();
  };
  const openEditor = async (entry: CatalogEntry) => {
    setEditor({ entry, html: '', loading: true, saving: false });
    const endpoint = entry.builtin ? `/overlays/builtin/${entry.name}/source` : `/overlays/${encodeURIComponent(customBase(entry))}/source`;
    try {
      const { html } = await (await apiFetch(endpoint)).json();
      setEditor({ entry, html, loading: false, saving: false });
    } catch { toast.error('HTML konnte nicht geladen werden'); setEditor(null); }
  };
  const saveEditor = async () => {
    if (!editor) return;
    setEditor({ ...editor, saving: true });
    const endpoint = editor.entry.builtin ? `/overlays/builtin/${editor.entry.name}` : `/overlays/${encodeURIComponent(customBase(editor.entry))}`;
    const res = await apiFetch(endpoint, { method: 'PUT', body: JSON.stringify({ html: editor.html }) });
    if (!res.ok) { toast.error('Speichern fehlgeschlagen'); setEditor({ ...editor, saving: false }); return; }
    toast.success('HTML gespeichert');
    setEditor(null);
    refetchCatalog();
  };
  const resetBuiltin = async (entry: CatalogEntry) => {
    if (!window.confirm(`„${entry.label}“ auf das mitgelieferte HTML zurücksetzen?`)) return;
    const res = await apiFetch(`/overlays/builtin/${entry.name}/override`, { method: 'DELETE' });
    if (!res.ok) { toast.error('Zurücksetzen fehlgeschlagen'); return; }
    refetchCatalog();
  };

  if (loading && !catalog) return <div className="panel"><p className="empty">Laden …</p></div>;

  const found = entries.filter((e) => matchesSearch(search, e.label, e.name, GROUP_LABELS[e.group], ...(scenesOf(e) ?? [])));
  const groups = GROUP_ORDER.map((g) => ({ group: g, label: GROUP_LABELS[g], items: found.filter((e) => e.group === g) })).filter((g) => g.items.length > 0);

  // Preview: the overlay at its real size, scaled to fit the box.
  const previewSize = selected?.size ?? { width: 1280, height: 720 };
  const boxHeight = 320;
  const scale = boxWidth > 0 ? Math.min((boxWidth - 24) / previewSize.width, (boxHeight - 24) / previewSize.height, 1) : 0;
  const previewUrl = selected
    ? withSampleState(selected)
    : null;
  const sampleData = !!selected && !selected.customized && !!selected.previewState;

  return (
    <div className="panel ovl">
      <div className="ovl-layout">
        <div className="ovl-list" aria-label="Alle Overlays">
          <SearchField value={search} onChange={setSearch} label="Overlays suchen" width={260} />
          {groups.length === 0 && <p className="dialog-empty">Kein Overlay passt zu „{search.trim()}“.</p>}
          {groups.map((g) => (
            <div key={g.group} className="ovl-group">
              <h3 className="dialog-section">{g.label}</h3>
              {g.items.map((entry) => {
                const scenes = scenesOf(entry);
                const active = selected?.name === entry.name;
                return (
                  <button key={entry.name} type="button" className={`ovl-row ${active ? 'active' : ''}`} aria-pressed={active} onClick={() => setSelectedName(entry.name)}>
                    {scenes !== null && <span className={`ovl-dot ${scenes.length ? 'on' : 'off'}`} aria-label={scenes.length ? 'in OBS' : 'noch nicht in OBS'} />}
                    <span className="ovl-row-label">{entry.label}</span>
                    <span className="ovl-row-short">{scenes === null ? '' : scenes.length ? scenes.join(', ') : 'noch nicht in OBS'}</span>
                  </button>
                );
              })}
            </div>
          ))}
          <button type="button" className="card-secondary ovl-add" onClick={() => setCreating(true)}>+ Eigenes Overlay</button>
        </div>

        {selected && (
          <section className="ovl-detail" aria-label="Gewähltes Overlay">
            <div>
              <h2 className="ovl-title">{selected.label}</h2>
              <p className="ovl-sentence">{selected.sentence}</p>
            </div>

            <div ref={boxRef} className="ovl-preview" style={{ height: boxHeight }}>
              {previewUrl && scale > 0 && (
                <div className="ovl-preview-frame" style={{ width: previewSize.width * scale, height: previewSize.height * scale }}>
                  <iframe
                    key={previewUrl}
                    src={previewUrl}
                    title={`Vorschau ${selected.label}`}
                    width={previewSize.width}
                    height={previewSize.height}
                    style={{ transform: `scale(${scale})`, transformOrigin: 'top left', border: 'none', background: 'transparent' }}
                    sandbox="allow-scripts allow-same-origin"
                  />
                </div>
              )}
            </div>
            <div className="card-status">
              {sampleData
                ? <><span className="ovl-chip">Mit Beispieldaten</span><span>Das Overlay ist im Standard-Layout, darum zeigt die Vorschau Beispielinhalte.</span></>
                : <><span className="ovl-chip warm">Live, ohne Beispieldaten</span><span>{selected.builtin ? `Du hast dieses Overlay angepasst (${selected.customizedBy.map((w) => WHY[w]).join(', ')}), darum zeigt die Vorschau es so, wie es gerade in OBS steht.` : 'Ein eigenes Overlay zeigt sich so, wie es gerade in OBS steht.'}</span></>}
            </div>

            {/* Whether it is in the stream picture, and the one thing to do about it (08.10.). */}
            {(() => {
              const scenes = scenesOf(selected);
              if (scenes === null) return (
                <div className="ovl-obs-card">
                  <div className="ovl-obs-text"><strong>In OBS: noch unbekannt</strong><span>Wo das Overlay liegt, sieht das Tool erst, wenn OBS verbunden ist.</span></div>
                  <button type="button" className="card-secondary" onClick={() => go({ area: 'settings', subTab: 'verbindungen' })}>OBS verbinden</button>
                </div>
              );
              if (scenes.length === 0) return (
                <div className="ovl-obs-card todo">
                  <div className="ovl-obs-text"><strong>Noch nicht in deinem Stream-Bild</strong><span>{selected.builtin ? 'Das Tool legt die Browserquelle für dich in einer Szene an – du musst nichts kopieren.' : 'Leg in OBS eine Browserquelle mit der Adresse unten an.'}</span></div>
                  {selected.builtin && <button type="button" className="card-primary" onClick={() => setPlacing({ initial: selected.name })}>In OBS anlegen</button>}
                </div>
              );
              return (
                <div className="ovl-obs-card done">
                  <div className="ovl-obs-text"><strong>Im Bild</strong><span>in den Szenen {scenes.map((s) => <span key={s} className="ovl-scene">{s}</span>)}</span></div>
                </div>
              );
            })()}

            {selected.builtin && (() => {
              const content = CONTENT[selected.name];
              const setContent = () => {
                if (!content) return;
                go({ area: content.area, subTab: content.subTab });
                const card = content.card;
                if (card) lightUp(() => document.querySelector(`[data-panel="${card}"]`)?.closest('.stream-card') ?? null);
              };
              const setLook = () => { openAt('appearance', selected.name); go({ area: 'overlays', subTab: 'aussehen' }); };
              return (
                <div className="ovl-settings">
                  <span className="dialog-field-label">Einstellen</span>
                  <div className="ovl-settings-row">
                    {content ? (
                      <div className="ovl-settings-item">
                        <button type="button" className="card-secondary" onClick={setContent}>Inhalt einstellen</button>
                        <span className="dialog-hint">{content.where}</span>
                      </div>
                    ) : (
                      <div className="ovl-settings-item"><span className="dialog-hint">{selected.name === 'chat' ? 'Zeigt, was im Chat steht – ohne Befehle und Bot-Antworten. Da gibt es nichts einzustellen.' : 'Zeigt sich von selbst, wenn es gebraucht wird.'}</span></div>
                    )}
                    <div className="ovl-settings-item">
                      <button type="button" className="card-secondary" onClick={setLook}>Aussehen ändern</button>
                      <span className="dialog-hint">Farben und Schrift nur für dieses Overlay</span>
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="dialog-field">
              <span className="dialog-field-label">{scenesOf(selected)?.length === 0 && selected.builtin ? 'Oder selbst anlegen – ' : ''}Adresse für die Browserquelle in OBS{selected.size ? ` · Größe ${selected.size.width} × ${selected.size.height}` : ''}</span>
              <div className="card-row card-wrap">
                <code className="ovl-url">{selected.url}</code>
                <button type="button" className="card-secondary" onClick={() => copy(selected.url, 'Adresse kopiert')}>Adresse kopieren</button>
              </div>
            </div>

            <div className="card-row card-wrap ovl-actions">
              <button type="button" className="card-secondary" onClick={() => openLarge(selected)}>Groß im Browser ansehen</button>
              {TESTABLE.has(selected.name) && <button type="button" className="card-secondary" onClick={() => testOnStream(selected)}>Im Stream testen</button>}
              <button type="button" className="card-link" onClick={() => openEditor(selected)}>HTML bearbeiten</button>
              {selected.builtin && selected.customizedBy.includes('html') && <button type="button" className="card-link" onClick={() => resetBuiltin(selected)}>HTML zurücksetzen</button>}
              {!selected.builtin && <button type="button" className="card-link" onClick={() => deleteCustom(selected)}>Löschen</button>}
            </div>
            {TESTABLE.has(selected.name) && <span className="dialog-hint">„Im Stream testen“ sehen auch die Zuschauer.</span>}
          </section>
        )}
      </div>

      <div className="card-row card-wrap">
        <button type="button" className="card-link" onClick={() => openShowcase(false)}>Alle Overlays in allen Zuständen ansehen</button>
        <button type="button" className="card-link" onClick={() => openShowcase(true)}>In Bewegung ansehen</button>
      </div>

      {creating && (
        <Dialog
          title="Eigenes Overlay"
          sentence="Aus der Vorlage oder aus einer eigenen HTML-Datei. Es bekommt eine Adresse wie die anderen."
          onClose={() => { setCreating(false); setNewName(''); }}
          width={560}
          footer={<>
            <button type="button" className="card-secondary" onClick={() => { setCreating(false); setNewName(''); }}>Abbrechen</button>
            {uploadMode === 'template'
              ? <button type="button" className="card-primary" onClick={createFromTemplate} disabled={!newName.trim() || busy}>{busy ? 'Legt an …' : 'Aus Vorlage anlegen'}</button>
              : <button type="button" className="card-primary" onClick={() => fileRef.current?.click()} disabled={!newName.trim() || busy}>{busy ? 'Lädt hoch …' : 'HTML-Datei wählen'}</button>}
          </>}
        >
          <div className="dialog-field">
            <label htmlFor="ovl-new-name">Name – wird Teil der Adresse, z. B. mein-banner</label>
            <input id="ovl-new-name" type="text" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
          </div>
          <div className="card-row">
            <button type="button" className={`card-secondary ${uploadMode === 'template' ? 'active' : ''}`} onClick={() => setUploadMode('template')}>Aus der Vorlage</button>
            <button type="button" className={`card-secondary ${uploadMode === 'file' ? 'active' : ''}`} onClick={() => setUploadMode('file')}>Eigene HTML-Datei</button>
          </div>
          <input ref={fileRef} type="file" accept=".html,.htm" onChange={uploadFile} style={{ display: 'none' }} />
        </Dialog>
      )}

      {editor && (
        <Dialog
          title={`${editor.entry.label} – HTML`}
          sentence={editor.entry.builtin ? 'Deine Fassung ersetzt das mitgelieferte Overlay. „HTML zurücksetzen“ holt das Original zurück.' : 'Die Datei deines Overlays.'}
          onClose={() => !editor.saving && setEditor(null)}
          width={960}
          footer={<>
            <button type="button" className="card-link" onClick={() => copy(editor.html, 'HTML kopiert')} disabled={editor.loading}>HTML kopieren</button>
            <span style={{ flex: 1 }} />
            <button type="button" className="card-secondary" onClick={() => setEditor(null)} disabled={editor.saving}>Abbrechen</button>
            <button type="button" className="card-primary" onClick={saveEditor} disabled={editor.loading || editor.saving || !editor.html.trim()}>{editor.saving ? 'Speichert …' : 'HTML speichern'}</button>
          </>}
        >
          <textarea className="ovl-editor" value={editor.loading ? 'Lade …' : editor.html} onChange={(e) => setEditor({ ...editor, html: e.target.value })} disabled={editor.loading || editor.saving} spellCheck={false} />
        </Dialog>
      )}
      {placing && <OverlayQuestPath overlays={entries} initial={placing.initial} onClose={() => setPlacing(null)} onPlaced={refetchPlacement} />}
    </div>
  );
}

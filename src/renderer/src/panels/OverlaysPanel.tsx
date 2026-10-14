import React, { useRef, useState } from 'react';
import { useApi, apiPost, apiFetch } from '../hooks/useApi';
import { useToast } from '../contexts/ToastContext';
import { useWebSocket } from '../hooks/useWebSocket';
import Dialog from '../components/ux/Dialog';
import OverlayQuestPath from '../components/quests/paths/OverlayQuestPath';
import { useQuestPath } from '../components/quests/questStart';
import { useNavigate } from '../NavigationContext';
import { lightUp, useOpenAt } from '../components/ux/openAt';
import { useVisibleInterval } from '../hooks/useVisibleInterval';
import { useFeatures } from '../contexts/FeaturesContext';
import type { FeatureKey } from '../../../shared/features';
import type { Milestone } from '../../../shared/types';
import OverlayPreview from '../components/overlays/OverlayPreview';
import OverlayLook from '../components/overlays/OverlayLook';
import AppearancePanel, { styleName } from './AppearancePanel';
import AlertSettings from '../components/AlertSettings';
import MilestonesPanel from './MilestonesPanel';
import LeaderboardsPanel from './LeaderboardsPanel';
import type { DesignStatus } from '../components/FigmaDrafts';
import type { PaletteConfig } from '../components/overlays/previewBus';

// Overlays & Alerts as one list (14.10., Leinwand "A · Eine Liste"): the style
// for all on top, then one row per overlay with where it lies in OBS. A row
// not in OBS has one button, "In OBS anlegen"; one that is has "Bearbeiten",
// which opens it in place — the preview on the left, on the right what it
// shows, how it looks and its address. The settings of alerts, milestones and
// leaderboards open in a dialog from there.

type Setup = 'settings' | 'live' | 'none';
type Editing = 'settings' | 'look';

interface CatalogEntry {
  name: string;
  label: string;
  sentence: string;
  group: string;
  size: { width: number; height: number } | null;
  previewState: string | null;
  url: string;
  builtin: boolean;
  customized: boolean;
  customizedBy: Array<'html' | 'palette' | 'figma'>;
  feature: FeatureKey | null;
  setup: Setup;
}

interface Steps { tuned: boolean; placed: boolean | null; tested: boolean; ready: boolean }
interface StepsAnswer { steps: Record<string, Steps>; xp: number }
interface MarkAnswer { steps: Steps; becameReady: boolean; xp: number; levelUp: boolean; stage: { level: number; name: string } }
interface OverlayScenes { connected: boolean; byOverlay: Record<string, string[]> }
interface ScreenResult { overlay: string; scene: string; status: 'created' | 'exists' | 'taken' }
interface AlertsOverview { alerts: Array<{ name: string; enabled: boolean; sound: string | null }> }
interface Leaderboard { title: string }

const GROUP_ORDER = ['always', 'join', 'today', 'rewards', 'screens', 'alerts', 'custom'];
const ICONS: Record<string, string> = {
  character: '📖', chat: '💬', song: '🎵', roulette: '🎡', poll: '🗳️', progress: '📈', challenge: '🎯',
  milestone: '🎉', 'reward-leaderboard': '🏆', 'reward-rankchange': '⬆️', start: '🌅', pause: '☕', end: '🌙', alerts: '🔔',
};
const SCREENS = new Set(['start', 'pause', 'end']);
// Overlays a test event exists for (POST /api/actions/overlay-test/<name>).
const TESTABLE = new Set(['alerts', 'song', 'poll', 'milestone', 'roulette', 'challenge', 'progress', 'reward-leaderboard', 'reward-rankchange', 'character', 'chat']);
// The overlays "Stil für alle" shows side by side, the first three there are.
const STYLE_PREVIEWS = ['chat', 'reward-leaderboard', 'alerts', 'song', 'challenge', 'progress', 'roulette'];

// Where what a live overlay shows is driven: the card on "Im Stream".
const LIVE: Record<string, { what: string; card: string }> = {
  challenge: { what: 'das Ziel eintragen und die Uhr starten', card: 'challenge' },
  roulette: { what: 'Themen sammeln und das Rad drehen', card: 'issues' },
  poll: { what: 'Vorschläge sammeln und die Abstimmung starten', card: 'designs' },
  progress: { what: 'das Projekt anlegen und weiterschalten', card: 'progress' },
  song: { what: 'sehen, was gerade läuft', card: 'song' },
  character: { what: 'den Eintrag wählen oder festhalten', card: 'world' },
};

const SETTINGS_TITLE: Record<string, string> = { alerts: 'Alerts', milestone: 'Meilensteine', 'reward-leaderboard': 'Bestenlisten', 'reward-rankchange': 'Bestenlisten' };

// The three colour dots of the style bar, with the Kompendium's colours until something is saved.
const SWATCHES: Array<[string, string]> = [['--color-primary', '#f3ecdd'], ['--color-secondary', '#a79f90'], ['--color-accent', '#e0201b']];

const listOf = (items: string[], max = 3) => (items.length > max ? `${items.slice(0, max).join(', ')} und ${items.length - max} weitere` : items.join(', '));

export default function OverlaysPanel() {
  const { toast } = useToast();
  const { isOn } = useFeatures();
  const go = useNavigate();
  const { data: catalog, loading, refetch: refetchCatalog } = useApi<CatalogEntry[]>('/overlays/catalog');
  const { data: placement, refetch: refetchPlacement } = useApi<OverlayScenes>('/obs/overlay-scenes');
  const { data: stepsData, refetch: refetchSteps } = useApi<StepsAnswer>('/overlays/steps');
  const { data: sceneData, refetch: refetchScenes } = useApi<{ scenes: string[]; current: string | null }>('/obs/scenes');
  const { data: designStatus, refetch: refetchDesign } = useApi<DesignStatus>('/design/status');
  const { data: palette, refetch: refetchPalette } = useApi<PaletteConfig>('/overlay-config');
  // What the settings rows say: the alerts that are on, open milestones, the lists.
  const { data: alertsData, refetch: refetchAlerts } = useApi<AlertsOverview>('/alerts');
  const { data: milestones, refetch: refetchMilestones } = useApi<Milestone[]>('/milestones');
  const { data: leaderboards, refetch: refetchLeaderboards } = useApi<Leaderboard[]>('/leaderboards');

  const [openName, setOpenName] = useState<string | null>(null);
  const [styleView, setStyleView] = useState(false);
  const [editing, setEditing] = useState<{ what: Editing; name: string; listPath?: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [moment, setMoment] = useState<{ label: string; icon: string; xp: number; levelUp: boolean; stage: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [placing, setPlacing] = useState<{ initial?: string } | null>(null);
  const [newName, setNewName] = useState('');
  const [uploadMode, setUploadMode] = useState<'template' | 'file'>('template');
  const fileRef = useRef<HTMLInputElement>(null);
  const [editor, setEditor] = useState<{ entry: CatalogEntry; html: string; loading: boolean; saving: boolean } | null>(null);

  const refresh = () => { refetchPlacement(); refetchSteps(); };
  useWebSocket((event) => {
    if (event === 'obs-status' || event === 'obs-scene-changed') { refresh(); refetchScenes(); }
    if (event === 'overlay-ready') refetchSteps();
    if (event === 'overlay-config' || event === 'design-implement') { refetchCatalog(); refetchDesign(); refetchPalette(); }
  });
  // Only while the window is seen; on show it looks once at once.
  useVisibleInterval(refresh, 30_000);
  useQuestPath(['overlay'], (k) => setPlacing(k === 'entryCard' ? { initial: 'character' } : {}));
  // A new leaderboard is made on its Quest-Pfad, inside the lists' dialog.
  useQuestPath(['leaderboard'], () => { setOpenName('reward-leaderboard'); setEditing({ what: 'settings', name: 'reward-leaderboard', listPath: true }); });

  const entries = (catalog ?? []).filter((e) => e.feature === null || isOn(e.feature));
  const stepsOf = (entry: CatalogEntry): Steps => stepsData?.steps[entry.name] ?? { tuned: entry.setup !== 'settings', placed: null, tested: false, ready: false };

  // From elsewhere: "overlay" opens a row ("alerts", "alerts:look"), "@style" opens Stil für alle.
  useOpenAt('overlay', (value) => {
    if (value === '@style') { setOpenName(null); setStyleView(true); return; }
    const [name, at] = value.split(':');
    setStyleView(false);
    setOpenName(name);
    if (at === 'look') setEditing({ what: 'look', name });
    setTimeout(() => document.getElementById(`ovl-row-${name}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  });

  const waitingDrafts = (designStatus?.drafts ?? []).filter((d) => !d.done);

  const copy = async (text: string, done: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(done); }
    catch { toast.error('Kopieren fehlgeschlagen'); }
  };

  // Set up, in OBS, tested: an overlay that has all three is "einsatzbereit" and brings EP.
  const mark = async (entry: CatalogEntry, step: 'tuned' | 'tested') => {
    const res = await apiFetch(`/overlays/steps/${entry.name}`, { method: 'POST', body: JSON.stringify({ step }) }).catch(() => null);
    if (!res?.ok) return;
    const answer = (await res.json()) as MarkAnswer;
    refetchSteps();
    if (answer.becameReady) setMoment({ label: entry.label, icon: ICONS[entry.name] ?? '✨', xp: answer.xp, levelUp: answer.levelUp, stage: answer.stage.name });
  };

  // Into the scene that is on air now; moving it elsewhere is done in OBS.
  const placeIn = async (entry: CatalogEntry) => {
    const target = sceneData?.current || sceneData?.scenes[0];
    if (!target) { toast.error('In OBS gibt es noch keine Szene.'); return; }
    setBusy(entry.name);
    const res = await apiFetch('/obs/place-overlay', { method: 'POST', body: JSON.stringify({ overlay: entry.name, scene: target }) }).catch(() => null);
    setBusy(null);
    const body = await res?.json().catch(() => ({}));
    if (!res?.ok) { toast.error(res?.status === 503 ? 'OBS ist nicht verbunden.' : body?.error ?? 'Nicht angelegt'); return; }
    toast.success(body.status === 'exists' ? `${entry.label} lag schon in „${body.scene}“` : `${entry.label} liegt jetzt in „${body.scene}“ – Platz und Größe änderst du in OBS`);
    refresh();
  };
  const createScreens = async () => {
    setBusy('screens');
    const result = await apiPost<{ screens: ScreenResult[] }>('/obs/screens', {});
    setBusy(null);
    if (!result) { toast.error('Szenen konnten nicht angelegt werden'); return; }
    const taken = result.screens.filter((s) => s.status === 'taken').map((s) => `„${s.scene}“`);
    if (taken.length) toast.error(`Szene ${taken.join(', ')} gibt es schon mit anderem Inhalt – nicht angerührt.`);
    else toast.success('Szenen für Start, Pause und Ende stehen in OBS');
    refresh();
    refetchScenes();
  };
  const testOnStream = async (entry: CatalogEntry) => {
    const result = await apiPost(`/actions/overlay-test/${entry.name}`, {});
    if (!result) { toast.error('Test nicht gestartet'); return; }
    toast.success('Test läuft im Stream');
    await mark(entry, 'tested');
  };

  // Own overlays: create from the template or from an uploaded file, edit the
  // HTML, delete. Built-in overlays: edit the HTML as an override, reset it.
  const customBase = (entry: CatalogEntry) => entry.name.replace(/^custom\//, '');
  const afterCreate = (name: string) => { setNewName(''); setCreating(false); refetchCatalog(); refetchSteps(); setOpenName(`custom/${name}`); };
  const createFromTemplate = async () => {
    if (!newName.trim()) return;
    setBusy('create');
    try {
      const { html } = await (await apiFetch('/overlays/template')).json();
      const name = newName.trim();
      const customHtml = html
        .replace("OVERLAY_NAME = 'MeinOverlay'", `OVERLAY_NAME = '${name}'`)
        .replace('<div class="title">MEIN OVERLAY</div>', `<div class="title">${name.toUpperCase()}</div>`)
        .replace('<title>Custom Overlay Template</title>', `<title>${name}</title>`);
      const res = await apiFetch('/overlays', { method: 'POST', body: JSON.stringify({ name, html: customHtml }) });
      if (!res.ok) { const err = await res.json().catch(() => ({})); toast.error(err.error || 'Anlegen fehlgeschlagen'); return; }
      afterCreate(name);
    } catch { toast.error('Anlegen fehlgeschlagen'); }
    finally { setBusy(null); }
  };
  const uploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !newName.trim()) return;
    setBusy('create');
    try {
      const name = newName.trim();
      const res = await apiFetch('/overlays', { method: 'POST', body: JSON.stringify({ name, html: await file.text() }) });
      if (!res.ok) { const err = await res.json().catch(() => ({})); toast.error(err.error || 'Hochladen fehlgeschlagen'); return; }
      afterCreate(name);
    } catch { toast.error('Hochladen fehlgeschlagen'); }
    finally { setBusy(null); if (fileRef.current) fileRef.current.value = ''; }
  };
  const deleteCustom = async (entry: CatalogEntry) => {
    if (!window.confirm(`„${entry.label}“ löschen? Die Browserquelle in OBS zeigt dann ins Leere.`)) return;
    const res = await apiFetch(`/overlays/${encodeURIComponent(customBase(entry))}`, { method: 'DELETE' });
    if (!res.ok) { toast.error('Löschen fehlgeschlagen'); return; }
    setEditor(null);
    setOpenName(null);
    refetchCatalog();
  };
  const openEditor = async (entry: CatalogEntry) => {
    setEditing(null);
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
    setEditor(null);
    refetchCatalog();
  };

  // Closing the settings counts as "eingestellt", and the rows say what is new.
  const closeEditing = () => {
    const entry = editing?.what === 'settings' ? entries.find((e) => e.name === editing.name) : undefined;
    setEditing(null);
    refetchAlerts(); refetchMilestones(); refetchLeaderboards();
    if (entry && !stepsOf(entry).tuned) void mark(entry, 'tuned');
  };

  if (loading && !catalog) return <div className="panel"><p className="empty">Laden …</p></div>;

  // ── Stil für alle ──────────────────────────────────────────────
  if (styleView) {
    const shown = STYLE_PREVIEWS.map((n) => entries.find((e) => e.name === n && e.previewState)).filter((e): e is CatalogEntry => !!e).slice(0, 3);
    return (
      <div className="panel ovl">
        <div className="ovl-work-head">
          <button type="button" className="card-secondary" onClick={() => setStyleView(false)}>← Alle Overlays</button>
          <h2 className="ovl-title">Stil für alle</h2>
        </div>
        <div className="ovl-work">
          <div className="ovl-work-left">
            {shown.map((e) => (
              <div key={e.name} className="ovl-style-preview">
                <span className="dialog-field-label">{e.label}{e.customizedBy.includes('palette') ? ' · hat einen eigenen Stil und behält ihn' : ''}</span>
                <OverlayPreview entry={e} height={170} />
              </div>
            ))}
            <span className="dialog-hint">Vorschau mit Beispieldaten – jede Änderung rechts siehst du hier sofort.</span>
          </div>
          <div className="ovl-work-right ovl-work-body">
            <AppearancePanel />
          </div>
        </div>
      </div>
    );
  }

  const sorted = [...entries].sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group));
  const connected = !!placement?.connected;
  const scenesOf = (entry: CatalogEntry) => (connected ? placement!.byOverlay[entry.name] ?? [] : null);
  const inObs = sorted.filter((e) => (scenesOf(e)?.length ?? 0) > 0).length;

  /** What it shows, in one line, with the button that changes it. */
  const contentRow = (entry: CatalogEntry): { t: string; d: string; btn?: string; act?: () => void; quest?: string } | null => {
    const edit = () => setEditing({ what: 'settings', name: entry.name });
    if (entry.name === 'alerts') {
      const on = (alertsData?.alerts ?? []).filter((a) => a.enabled);
      const withSound = on.filter((a) => a.sound).length;
      return { t: 'Was angezeigt wird', d: on.length ? `${listOf(on.map((a) => a.name), 5)} · ${withSound ? `${withSound} mit Ton` : 'ohne Ton'}` : 'Alle aus – im Stream erscheint keine Tafel.', btn: 'Ändern', act: edit, quest: 'alertSound' };
    }
    if (entry.name === 'milestone') {
      const open = (milestones ?? []).filter((m) => m.status === 'pending').map((m) => m.title);
      return { t: 'Meilensteine', d: open.length ? `${open.length} offen: ${listOf(open)}` : 'Noch keine offenen Meilensteine.', btn: 'Ändern', act: edit };
    }
    if (entry.name === 'reward-leaderboard' || entry.name === 'reward-rankchange') {
      const lists = (leaderboards ?? []).map((l) => l.title);
      return { t: 'Listen', d: lists.length ? `${lists.length === 1 ? '1 Liste' : `${lists.length} Listen`}: ${listOf(lists)}` : 'Noch keine Liste.', btn: 'Ändern', act: edit };
    }
    const live = LIVE[entry.name];
    if (live) {
      return {
        t: 'Was drinsteht', d: `Steuerst du unter „Im Stream“ – ${live.what}.`, btn: 'Hingehen',
        act: () => { go({ area: 'stream' }); lightUp(() => document.querySelector(`[data-panel="${live.card}"]`)?.closest('.stream-card') ?? null); },
      };
    }
    if (SCREENS.has(entry.name)) return { t: 'Was drinsteht', d: 'Der Eintrag, den du im Worldbuilder offen hast.' };
    return null;
  };

  const row = (entry: CatalogEntry) => {
    const scenes = scenesOf(entry);
    const placed = (scenes?.length ?? 0) > 0;
    const open = openName === entry.name;
    const missing = connected && !placed;
    // Without OBS the bar says so once; the rows then say nothing about it.
    const where = scenes === null ? '' : placed ? `In OBS: ${scenes.join(', ')}` : 'Noch nicht in OBS';
    // Not in OBS yet: the one thing to do. An own overlay is set up by its address, so it opens.
    const action = missing && entry.builtin
      ? (SCREENS.has(entry.name)
        ? <button type="button" className="card-primary" disabled={busy !== null} onClick={createScreens}>{busy === 'screens' ? 'Legt an …' : 'In OBS anlegen'}</button>
        : <button type="button" className="card-primary" disabled={busy !== null} onClick={() => placeIn(entry)}>{busy === entry.name ? 'Legt an …' : 'In OBS anlegen'}</button>)
      : <button type="button" className={missing ? 'card-primary' : 'card-secondary'} aria-expanded={open} onClick={() => setOpenName(open ? null : entry.name)}>{open ? 'Zuklappen' : missing ? 'In OBS anlegen' : 'Bearbeiten'}</button>;
    const content = contentRow(entry);
    const ownLook = entry.customizedBy.includes('palette');

    return (
      <li key={entry.name} id={`ovl-row-${entry.name}`} className={`ovl-item ${open ? 'open' : ''}`}>
        <div className="ovl-line">
          <span className="chat-row-name">{entry.label}</span>
          <span className="chat-row-text">{entry.sentence}</span>
          <span className={`ovl-where ${placed ? 'on' : ''}`}>{where}</span>
          {action}
        </div>
        {open && (
          <div className="ovl-open">
            <div className="ovl-open-preview">
              <OverlayPreview entry={entry} height={260} />
              <span className="dialog-hint">{entry.previewState ? 'Vorschau mit Beispieldaten' : 'Ein eigenes Overlay zeigt sich so, wie es gerade in OBS steht.'}</span>
            </div>
            <div className="ovl-open-rows">
              {content && (
                <div className="chat-box-row">
                  <div className="ovl-box-text"><b>{content.t}</b><span>{content.d}</span></div>
                  {content.btn && <button type="button" className="card-secondary" data-quest-target={content.quest} onClick={content.act}>{content.btn}</button>}
                </div>
              )}
              <div className="chat-box-row">
                <div className="ovl-box-text"><b>Aussehen</b><span>{!entry.builtin ? 'Bringt das eigene Overlay selbst mit.' : ownLook ? 'Eigene Farben und Größe' : 'Folgt dem Stil für alle'}</span></div>
                {entry.builtin
                  ? <button type="button" className="card-secondary" onClick={() => setEditing({ what: 'look', name: entry.name })}>Ändern</button>
                  : <button type="button" className="card-secondary" onClick={() => openEditor(entry)}>HTML bearbeiten</button>}
              </div>
              <div className="chat-box-row">
                <div className="ovl-box-text"><b>Adresse für OBS{entry.size ? ` · ${entry.size.width} × ${entry.size.height}` : ''}</b><code className="ovl-url">{entry.url}</code></div>
                <button type="button" className="card-secondary" onClick={() => copy(entry.url, 'Adresse kopiert')}>Kopieren</button>
              </div>
              {missing && !entry.builtin && <p className="dialog-hint">Leg in OBS eine Browserquelle mit dieser Adresse an. Sobald sie in einer Szene liegt, steht es hier.</p>}
              {placed && TESTABLE.has(entry.name) && <button type="button" className="card-link ovl-test" onClick={() => testOnStream(entry)}>Im Stream testen</button>}
              {placed && !TESTABLE.has(entry.name) && !stepsOf(entry).tested && <button type="button" className="card-link ovl-test" onClick={() => mark(entry, 'tested')}>Sitzt in OBS und sieht gut aus</button>}
            </div>
          </div>
        )}
      </li>
    );
  };

  const editingEntry = editing ? entries.find((e) => e.name === editing.name) ?? null : null;
  const style = palette ? styleName(palette.global) : null;

  return (
    <div className="panel ovl">
      {/* One bar (14.10., Leinwand "Der obere Abschnitt", A): the style, where OBS stands, a new overlay. */}
      <div className="ovl-head">
        <span className="ovl-head-group">
          <span className="ovl-swatches" aria-hidden="true">
            {SWATCHES.map(([key, fallback]) => <span key={key} style={{ background: palette?.global?.[key] || fallback }} />)}
          </span>
          <span><span className="ovl-head-muted">Stil</span> <b>{style ?? 'Kompendium'}</b>{waitingDrafts.length > 0 && <span className="ovl-head-muted"> · {waitingDrafts.length} {waitingDrafts.length === 1 ? 'Entwurf' : 'Entwürfe'} aus Figma</span>}</span>
          <button type="button" className="card-secondary" onClick={() => { setOpenName(null); setStyleView(true); }}>Ändern</button>
        </span>
        {placement && (
          <>
            <span className="ovl-head-sep" aria-hidden="true" />
            <span className="ovl-head-group">
              <span className={`ovl-dot ${connected ? 'on' : ''}`} aria-hidden="true" />
              <span className={connected ? 'ovl-head-on' : ''}>{connected ? `${inObs} von ${sorted.length} Overlays in OBS` : 'OBS nicht verbunden'}</span>
              {!connected && <button type="button" className="card-secondary" onClick={() => go({ area: 'settings', subTab: 'verbindungen' })}>Verbinden</button>}
            </span>
          </>
        )}
        <span className="ovl-head-fill" />
        <button type="button" className="card-secondary" onClick={() => setCreating(true)}>+ Eigenes Overlay</button>
      </div>
      <ul className="chat-list" aria-label="Overlays">{sorted.map(row)}</ul>

      {editing?.what === 'settings' && editingEntry && (
        <Dialog title={SETTINGS_TITLE[editingEntry.name] ?? editingEntry.label} onClose={closeEditing} width={editingEntry.name === 'alerts' ? 960 : 760}>
          {editingEntry.name === 'alerts' && <AlertSettings />}
          {editingEntry.name === 'milestone' && <MilestonesPanel />}
          {(editingEntry.name === 'reward-leaderboard' || editingEntry.name === 'reward-rankchange') && <LeaderboardsPanel startWithPath={editing.listPath} />}
        </Dialog>
      )}
      {editing?.what === 'look' && editingEntry && (
        <Dialog
          title={`${editingEntry.label} – Aussehen`}
          sentence="Folgt dem Stil für alle, oder bekommt eigene Farben und eine eigene Größe."
          onClose={() => setEditing(null)}
          width={960}
          footer={<>
            <button type="button" className="card-link" onClick={() => openEditor(editingEntry)}>HTML bearbeiten</button>
            <span style={{ flex: 1 }} />
            <button type="button" className="card-primary" onClick={() => setEditing(null)}>Fertig</button>
          </>}
        >
          <div className="ovl-look">
            <OverlayPreview entry={editingEntry} height={260} />
            <OverlayLook name={editingEntry.name} onStyleForAll={() => { setEditing(null); setOpenName(null); setStyleView(true); }} />
          </div>
        </Dialog>
      )}

      {moment && (
        <div className="quest-moment-backdrop">
          <section className="quest-moment" role="dialog" aria-label="Einsatzbereit">
            <span className="ovl-moment-icon" aria-hidden="true">{moment.icon}</span>
            <strong className="quest-moment-title">{moment.label} ist einsatzbereit!</strong>
            <p>{entries.filter((e) => stepsOf(e).ready).length} von {entries.length} Overlays einsatzbereit</p>
            <span className="quest-xp">+{moment.xp} EP</span>
            {moment.levelUp && <p>Neue Stufe: <strong>{moment.stage}</strong></p>}
            <button type="button" className="card-primary" autoFocus onClick={() => setMoment(null)}>Weiter</button>
          </section>
        </div>
      )}

      {creating && (
        <Dialog
          title="Eigenes Overlay"
          sentence="Aus der Vorlage oder aus einer eigenen HTML-Datei. Es bekommt eine Adresse wie die anderen."
          onClose={() => { setCreating(false); setNewName(''); }}
          width={560}
          footer={<>
            <button type="button" className="card-secondary" onClick={() => { setCreating(false); setNewName(''); }}>Abbrechen</button>
            {uploadMode === 'template'
              ? <button type="button" className="card-primary" onClick={createFromTemplate} disabled={!newName.trim() || busy !== null}>{busy === 'create' ? 'Legt an …' : 'Aus Vorlage anlegen'}</button>
              : <button type="button" className="card-primary" onClick={() => fileRef.current?.click()} disabled={!newName.trim() || busy !== null}>{busy === 'create' ? 'Lädt hoch …' : 'HTML-Datei wählen'}</button>}
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
            {editor.entry.builtin && editor.entry.customizedBy.includes('html') && <button type="button" className="card-link" onClick={() => resetBuiltin(editor.entry)} disabled={editor.saving}>HTML zurücksetzen</button>}
            {!editor.entry.builtin && <button type="button" className="card-link" onClick={() => deleteCustom(editor.entry)} disabled={editor.saving}>Overlay löschen</button>}
            <span style={{ flex: 1 }} />
            <button type="button" className="card-secondary" onClick={() => setEditor(null)} disabled={editor.saving}>Abbrechen</button>
            <button type="button" className="card-primary" onClick={saveEditor} disabled={editor.loading || editor.saving || !editor.html.trim()}>{editor.saving ? 'Speichert …' : 'HTML speichern'}</button>
          </>}
        >
          <textarea className="ovl-editor" value={editor.loading ? 'Lade …' : editor.html} onChange={(e) => setEditor({ ...editor, html: e.target.value })} disabled={editor.loading || editor.saving} spellCheck={false} />
        </Dialog>
      )}
      {placing && <OverlayQuestPath overlays={entries} initial={placing.initial} onClose={() => setPlacing(null)} onPlaced={refresh} />}
    </div>
  );
}

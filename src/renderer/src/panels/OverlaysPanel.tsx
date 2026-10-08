import React, { useRef, useState } from 'react';
import { useApi, apiPost, apiFetch, getServerPort } from '../hooks/useApi';
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
import OverlayPreview from '../components/overlays/OverlayPreview';
import OverlayLook from '../components/overlays/OverlayLook';
import AppearancePanel from './AppearancePanel';
import AlertSettings from '../components/AlertSettings';
import MilestonesPanel from './MilestonesPanel';
import LeaderboardsPanel from './LeaderboardsPanel';
import type { DesignStatus } from '../components/FigmaDrafts';

// Overlays & Alerts as a workshop (08.10., A + B on the canvas): every overlay
// as a card, grouped, with how far it is on its way to "einsatzbereit" — set
// up, in OBS, tested — and +20 EP once it is. A card opens its workshop: the
// preview on the left with sample data, on the right the three steps, which
// are the tabs, and "Aussehen" apart as optional. "Stil für alle" changes the
// look of every overlay at once, with the drafts from Figma.

type Group = 'always' | 'join' | 'today' | 'rewards' | 'screens' | 'alerts' | 'custom';
type Setup = 'settings' | 'live' | 'none';
type Tab = 'inhalt' | 'obs' | 'test' | 'look';

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
  setup: Setup;
}

interface Steps { tuned: boolean; placed: boolean | null; tested: boolean; ready: boolean }
interface StepsAnswer { steps: Record<string, Steps>; xp: number }
interface MarkAnswer { steps: Steps; becameReady: boolean; xp: number; levelUp: boolean; stage: { level: number; name: string } }
interface OverlayScenes { connected: boolean; byOverlay: Record<string, string[]> }
interface ScreenResult { overlay: string; scene: string; status: 'created' | 'exists' | 'taken' }

const GROUP_LABELS: Record<Group, string> = {
  always: 'Immer da', join: 'Mitmachen', today: 'Heute im Stream', rewards: 'Bestenlisten',
  screens: 'Deine Szenenbilder', alerts: 'Meldungen', custom: 'Eigene Overlays',
};
const GROUP_ORDER: Group[] = ['always', 'join', 'today', 'rewards', 'screens', 'alerts', 'custom'];
const ICONS: Record<string, string> = {
  character: '📖', chat: '💬', song: '🎵', roulette: '🎡', poll: '🗳️', progress: '📈', todos: '✅', challenge: '🎯',
  milestone: '🎉', 'reward-leaderboard': '🏆', 'reward-rankchange': '⬆️', start: '🌅', pause: '☕', end: '🌙', alerts: '🔔',
};
const SCREENS = new Set(['start', 'pause', 'end']);
// Overlays a test event exists for (POST /api/actions/overlay-test/<name>).
const TESTABLE = new Set(['alerts', 'song', 'poll', 'milestone', 'roulette', 'challenge', 'todos', 'progress', 'reward-leaderboard', 'reward-rankchange', 'character', 'chat']);
// The overlays "Stil für alle" shows side by side, the first three there are.
const STYLE_PREVIEWS = ['chat', 'reward-leaderboard', 'alerts', 'song', 'challenge', 'progress', 'roulette'];

// Where what a live overlay shows is driven: the card on "Im Stream".
const LIVE: Record<string, { what: string; card: string }> = {
  challenge: { what: 'das Ziel eintragen und die Uhr starten', card: 'challenge' },
  roulette: { what: 'Themen sammeln und das Rad drehen', card: 'issues' },
  poll: { what: 'Vorschläge sammeln und die Abstimmung starten', card: 'designs' },
  progress: { what: 'Schritte eintragen und abhaken', card: 'progress' },
  todos: { what: 'Aufgaben eintragen und abhaken', card: 'progress' },
  song: { what: 'sehen, was läuft, und Wünsche annehmen', card: 'song' },
  character: { what: 'den Eintrag wählen oder festhalten', card: 'world' },
};

const DEFAULT_STEPS = (entry: CatalogEntry): Steps => ({ tuned: entry.setup !== 'settings', placed: null, tested: false, ready: false });
const doneCount = (s: Steps) => [s.tuned, s.placed === true, s.tested].filter(Boolean).length;
const firstOpenTab = (s: Steps): Tab => (!s.tuned ? 'inhalt' : s.placed !== true ? 'obs' : !s.tested ? 'test' : 'inhalt');

export default function OverlaysPanel() {
  const { toast } = useToast();
  const { isOn } = useFeatures();
  const go = useNavigate();
  const { data: catalog, loading, refetch: refetchCatalog } = useApi<CatalogEntry[]>('/overlays/catalog');
  const { data: placement, refetch: refetchPlacement } = useApi<OverlayScenes>('/obs/overlay-scenes');
  const { data: stepsData, refetch: refetchSteps } = useApi<StepsAnswer>('/overlays/steps');
  const { data: sceneData, refetch: refetchScenes } = useApi<{ scenes: string[]; current: string | null }>('/obs/scenes');
  const { data: designStatus, refetch: refetchDesign } = useApi<DesignStatus>('/design/status');

  const [openName, setOpenName] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('inhalt');
  const [styleView, setStyleView] = useState(false);
  const [more, setMore] = useState(false);
  const [scene, setScene] = useState('');
  const [busy, setBusy] = useState(false);
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
    if (event === 'overlay-config' || event === 'design-implement') { refetchCatalog(); refetchDesign(); }
  });
  // Only while the window is seen; on show it looks once at once.
  useVisibleInterval(refresh, 30_000);
  useQuestPath(['overlay'], (k) => setPlacing(k === 'entryCard' ? { initial: 'character' } : {}));

  const entries = (catalog ?? []).filter((e) => e.feature === null || isOn(e.feature));
  const stepsOf = (entry: CatalogEntry): Steps => stepsData?.steps[entry.name] ?? DEFAULT_STEPS(entry);
  const xp = stepsData?.xp ?? 20;

  const openWorkshop = (name: string, at?: Tab) => {
    const entry = entries.find((e) => e.name === name);
    setStyleView(false);
    setMore(false);
    setScene('');
    setOpenName(name);
    setTab(at ?? (entry ? firstOpenTab(stepsOf(entry)) : 'inhalt'));
  };
  // From elsewhere: "overlay" opens a workshop ("alerts", "alerts:look"), "@style" opens Stil für alle.
  useOpenAt('overlay', (value) => {
    if (value === '@style') { setOpenName(null); setStyleView(true); return; }
    const [name, at] = value.split(':');
    openWorkshop(name, (at as Tab) || undefined);
  });

  const waitingDrafts = (designStatus?.drafts ?? []).filter((d) => !d.done);
  const draftWaits = (name: string) => waitingDrafts.some((d) => d.overlay === name);

  const copy = async (text: string, done: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(done); }
    catch { toast.error('Kopieren fehlgeschlagen'); }
  };

  const mark = async (entry: CatalogEntry, step: 'tuned' | 'tested') => {
    const res = await apiFetch(`/overlays/steps/${entry.name}`, { method: 'POST', body: JSON.stringify({ step }) }).catch(() => null);
    if (!res?.ok) { toast.error('Nicht gespeichert'); return; }
    const answer = (await res.json()) as MarkAnswer;
    refetchSteps();
    if (answer.becameReady) setMoment({ label: entry.label, icon: ICONS[entry.name] ?? '✨', xp: answer.xp, levelUp: answer.levelUp, stage: answer.stage.name });
  };

  const placeIn = async (entry: CatalogEntry, target: string) => {
    setBusy(true);
    const res = await apiFetch('/obs/place-overlay', { method: 'POST', body: JSON.stringify({ overlay: entry.name, scene: target }) }).catch(() => null);
    setBusy(false);
    const body = await res?.json().catch(() => ({}));
    if (!res?.ok) { toast.error(res?.status === 503 ? 'OBS ist nicht verbunden.' : body?.error ?? 'Nicht angelegt'); return; }
    toast.success(body.status === 'exists' ? `${entry.label} lag schon in „${body.scene}“` : `${entry.label} liegt jetzt in „${body.scene}“`);
    refresh();
    setTab('test');
  };
  const createScreens = async () => {
    setBusy(true);
    const result = await apiPost<{ screens: ScreenResult[] }>('/obs/screens', {});
    setBusy(false);
    if (!result) { toast.error('Szenen konnten nicht angelegt werden'); return; }
    const taken = result.screens.filter((s) => s.status === 'taken').map((s) => `„${s.scene}“`);
    if (taken.length) toast.error(`Szene ${taken.join(', ')} gibt es schon mit anderem Inhalt – nicht angerührt.`);
    else toast.success('Szenen für Start, Pause und Ende stehen in OBS');
    refresh();
    refetchScenes();
    setTab('test');
  };
  const testOnStream = async (entry: CatalogEntry) => {
    const result = await apiPost(`/actions/overlay-test/${entry.name}`, {});
    if (!result) { toast.error('Test nicht gestartet'); return; }
    toast.success('Test läuft im Stream');
    await mark(entry, 'tested');
  };

  // Big, with real data — the preview has the sample data.
  const openLarge = (entry: CatalogEntry) => {
    const size = entry.size ?? { width: 1280, height: 720 };
    window.open(entry.url, '_blank', `noopener,width=${size.width},height=${size.height}`);
  };
  const openShowcase = (live: boolean) => {
    window.open(`http://localhost:${getServerPort()}/overlay/showcase/${live ? '?live' : ''}`, '_blank', 'noopener,width=1400,height=900');
  };

  // Own overlays: create from the template or from an uploaded file, edit the
  // HTML, delete. Built-in overlays: edit the HTML as an override, reset it.
  const customBase = (entry: CatalogEntry) => entry.name.replace(/^custom\//, '');
  const afterCreate = (name: string) => { setNewName(''); setCreating(false); refetchCatalog(); refetchSteps(); openWorkshop(`custom/${name}`, 'obs'); };
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
      afterCreate(name);
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
      afterCreate(name);
    } catch { toast.error('Hochladen fehlgeschlagen'); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };
  const deleteCustom = async (entry: CatalogEntry) => {
    if (!window.confirm(`„${entry.label}“ löschen? Die Browserquelle in OBS zeigt dann ins Leere.`)) return;
    const res = await apiFetch(`/overlays/${encodeURIComponent(customBase(entry))}`, { method: 'DELETE' });
    if (!res.ok) { toast.error('Löschen fehlgeschlagen'); return; }
    setOpenName(null);
    refetchCatalog();
  };
  const openEditor = async (entry: CatalogEntry) => {
    setMore(false);
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
    setMore(false);
    if (!window.confirm(`„${entry.label}“ auf das mitgelieferte HTML zurücksetzen?`)) return;
    const res = await apiFetch(`/overlays/builtin/${entry.name}/override`, { method: 'DELETE' });
    if (!res.ok) { toast.error('Zurücksetzen fehlgeschlagen'); return; }
    refetchCatalog();
  };

  if (loading && !catalog) return <div className="panel"><p className="empty">Laden …</p></div>;

  const groups = GROUP_ORDER.map((g) => ({ group: g, label: GROUP_LABELS[g], items: entries.filter((e) => e.group === g) })).filter((g) => g.items.length > 0);
  const readyCount = entries.filter((e) => stepsOf(e).ready).length;
  const current = openName ? entries.find((e) => e.name === openName) ?? null : null;

  const styleButton = (
    <button type="button" className="card-secondary ovl-style-btn" onClick={() => { setOpenName(null); setStyleView(true); }}>
      <span aria-hidden="true">🎨</span> Stil für alle
      {waitingDrafts.length > 0 && <span className="ovl-figma-chip">{waitingDrafts.length} {waitingDrafts.length === 1 ? 'Entwurf' : 'Entwürfe'} aus Figma</span>}
    </button>
  );

  // ── Stil für alle ──────────────────────────────────────────────
  if (styleView) {
    const shown = STYLE_PREVIEWS.map((n) => entries.find((e) => e.name === n && e.previewState)).filter((e): e is CatalogEntry => !!e).slice(0, 3);
    return (
      <div className="panel ovl">
        <div className="ovl-work-head">
          <button type="button" className="card-secondary" onClick={() => setStyleView(false)}>← Alle Overlays</button>
          <span className="ovl-work-icon" aria-hidden="true">🎨</span>
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

  // ── Workshop of one overlay ────────────────────────────────────
  if (current) {
    const s = stepsOf(current);
    const n = doneCount(s);
    const badge = s.ready ? '★ Einsatzbereit' : `${n} von 3`;
    const scenesHere = placement?.connected ? placement.byOverlay[current.name] ?? [] : null;
    const live = LIVE[current.name];
    const stepTabs: Array<{ tab: Tab; label: string; done: boolean }> = [
      { tab: 'inhalt', label: current.setup === 'live' ? 'Live' : 'Einstellungen', done: s.tuned },
      { tab: 'obs', label: 'In OBS', done: s.placed === true },
      { tab: 'test', label: 'Testen', done: s.tested },
    ];
    const nextHint = !s.tuned ? 'Als Nächstes: einstellen, was drinsteht – dann „Weiter“ unten.'
      : s.placed !== true ? 'Als Nächstes: Schritt 2 – „In OBS anlegen“.'
        : !s.tested ? 'Als Nächstes: Schritt 3 – einmal testen.'
          : 'Alles erledigt. Das Aussehen kannst du jederzeit noch ändern.';
    const pickedScene = scene || sceneData?.current || sceneData?.scenes[0] || '';

    const toStream = () => {
      if (!live) return;
      go({ area: 'stream' });
      lightUp(() => document.querySelector(`[data-panel="${live.card}"]`)?.closest('.stream-card') ?? null);
    };

    return (
      <div className="panel ovl">
        <div className="ovl-work-head">
          <button type="button" className="card-secondary" onClick={() => setOpenName(null)}>← Alle Overlays</button>
          <span className="ovl-work-icon" aria-hidden="true">{ICONS[current.name] ?? '✨'}</span>
          <h2 className="ovl-title">{current.label}</h2>
          <span className={`ovl-badge ${s.ready ? 'ready' : ''}`}>{badge}</span>
          <span style={{ flex: 1 }} />
          <div className="ovl-more">
            <button type="button" className="card-secondary" aria-expanded={more} onClick={() => setMore(!more)}>⋯ Mehr</button>
            {more && (
              <div className="ovl-more-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => { setMore(false); copy(current.url, 'Adresse kopiert'); }}>Adresse kopieren</button>
                <button type="button" role="menuitem" onClick={() => { setMore(false); openLarge(current); }}>Groß im Browser ansehen – mit echten Daten</button>
                <button type="button" role="menuitem" onClick={() => openEditor(current)}>HTML bearbeiten</button>
                {current.builtin && current.customizedBy.includes('html') && <button type="button" role="menuitem" onClick={() => resetBuiltin(current)}>HTML zurücksetzen</button>}
                {!current.builtin && <button type="button" role="menuitem" onClick={() => { setMore(false); deleteCustom(current); }}>Löschen</button>}
              </div>
            )}
          </div>
        </div>
        <p className="ovl-sentence">{current.sentence}</p>

        <div className="ovl-work">
          <div className="ovl-work-left">
            <OverlayPreview entry={current} height={380} />
            <span className="dialog-hint">{current.previewState ? 'Vorschau mit Beispieldaten – jede Änderung rechts siehst du hier sofort.' : 'Ein eigenes Overlay zeigt sich so, wie es gerade in OBS steht.'}</span>
          </div>

          <div className="ovl-work-right">
            <div className="ovl-steps-head">
              <span className="ovl-kicker">Einsatzbereit machen · {badge}</span>
              <div className="ovl-steps" role="tablist" aria-label="Schritte">
                {stepTabs.map((t, i) => (
                  <button key={t.tab} type="button" role="tab" aria-selected={tab === t.tab} className={`ovl-step ${t.done ? 'done' : ''} ${tab === t.tab ? 'on' : ''}`} onClick={() => setTab(t.tab)}>
                    <span className="ovl-step-mark" aria-hidden="true">{t.done ? '✓' : i + 1}</span> {t.label}
                  </button>
                ))}
                <span className="ovl-steps-divider" aria-hidden="true" />
                <button type="button" role="tab" aria-selected={tab === 'look'} className={`ovl-step optional ${tab === 'look' ? 'on' : ''}`} onClick={() => setTab('look')}>
                  <span>🎨 Aussehen</span><small>freiwillig</small>
                </button>
              </div>
              <span className="dialog-hint">{nextHint}</span>
            </div>

            <div className="ovl-work-body" role="tabpanel">
              {tab === 'inhalt' && (
                <>
                  {current.setup === 'settings' && (
                    <>
                      {current.name === 'alerts' && <AlertSettings />}
                      {current.name === 'milestone' && <MilestonesPanel />}
                      {(current.name === 'reward-leaderboard' || current.name === 'reward-rankchange') && <LeaderboardsPanel />}
                      <button type="button" className="card-primary ovl-next" onClick={async () => { await mark(current, 'tuned'); setTab('obs'); }}>Weiter: In OBS</button>
                    </>
                  )}
                  {current.setup === 'live' && live && (
                    <>
                      <div className="ovl-live-note"><span aria-hidden="true">▶</span><span>Was drinsteht, steuerst du live unter „Im Stream“ – {live.what}. Hier richtest du nur ein, wo es in OBS liegt und wie es aussieht.</span></div>
                      <div className="card-row card-wrap">
                        <button type="button" className="card-primary" onClick={() => setTab('obs')}>Weiter: In OBS</button>
                        <button type="button" className="card-secondary" onClick={toStream}>Zu „Im Stream“</button>
                      </div>
                    </>
                  )}
                  {current.setup === 'none' && (
                    <>
                      <p className="ovl-plain">{SCREENS.has(current.name)
                        ? 'Das Bild zeigt den Eintrag, den du im Worldbuilder offen hast. Hier gibt es nichts einzustellen.'
                        : current.builtin ? 'Zeigt sich von selbst. Hier gibt es nichts einzustellen.' : 'Ein eigenes Overlay bringt mit, was es zeigt. Hier gibt es nichts einzustellen.'}</p>
                      <button type="button" className="card-primary ovl-next" onClick={() => setTab('obs')}>Weiter: In OBS</button>
                    </>
                  )}
                </>
              )}

              {tab === 'obs' && (
                <>
                  {scenesHere === null && (
                    <div className="ovl-obs-card">
                      <div className="ovl-obs-text"><strong>OBS ist nicht verbunden</strong><span>Wo das Overlay liegt und das Anlegen gehen erst, wenn OBS verbunden ist.</span></div>
                      <button type="button" className="card-secondary" onClick={() => go({ area: 'settings', subTab: 'verbindungen' })}>OBS verbinden</button>
                    </div>
                  )}
                  {scenesHere !== null && scenesHere.length > 0 && (
                    <>
                      <div className="ovl-obs-card done">
                        <div className="ovl-obs-text"><strong>✓ Liegt in OBS</strong><span>in {scenesHere.map((sc) => <span key={sc} className="ovl-scene">{sc}</span>)} – verschieben und Größe ändern machst du in OBS.</span></div>
                      </div>
                      <button type="button" className="card-primary ovl-next" onClick={() => setTab('test')}>Weiter: Testen</button>
                    </>
                  )}
                  {scenesHere !== null && scenesHere.length === 0 && (
                    SCREENS.has(current.name) ? (
                      <>
                        <p className="ovl-plain">Das Tool legt dafür eigene Szenen in OBS an – „start“, „brb“ und „end“, je mit dem Bild darin, bildschirmfüllend. Steht eine davon schon, werden die neuen wie sie aufgebaut.</p>
                        <button type="button" className="card-primary ovl-next" disabled={busy} onClick={createScreens}>{busy ? 'Legt an …' : 'In OBS anlegen'}</button>
                      </>
                    ) : current.builtin ? (
                      <>
                        <span className="dialog-field-label">In welche Szene?</span>
                        {(sceneData?.scenes ?? []).length === 0 && <p className="dialog-empty">In OBS gibt es noch keine Szene.</p>}
                        <div className="ovl-scene-picks" role="radiogroup" aria-label="Szene">
                          {(sceneData?.scenes ?? []).map((sc) => (
                            <button key={sc} type="button" role="radio" aria-checked={sc === pickedScene} className={`ovl-scene-pick ${sc === pickedScene ? 'on' : ''}`} onClick={() => setScene(sc)}>{sc}</button>
                          ))}
                        </div>
                        <button type="button" className="card-primary ovl-next" disabled={busy || !pickedScene} onClick={() => placeIn(current, pickedScene)}>{busy ? 'Legt an …' : 'In OBS anlegen'}</button>
                        <span className="dialog-hint">Das Tool legt die Browserquelle {current.size ? `in ${current.size.width} × ${current.size.height} ` : ''}in OBS an – du musst nichts kopieren.</span>
                      </>
                    ) : (
                      <p className="ovl-plain">Leg in OBS eine Browserquelle mit der Adresse unten an. Sobald sie in einer Szene liegt, ist dieser Schritt erledigt.</p>
                    )
                  )}
                  <div className="dialog-field ovl-address">
                    <span className="dialog-field-label">{current.builtin ? 'Oder selbst anlegen – ' : ''}Adresse für die Browserquelle{current.size ? ` · ${current.size.width} × ${current.size.height}` : ''}</span>
                    <div className="card-row card-wrap">
                      <code className="ovl-url">{current.url}</code>
                      <button type="button" className="card-secondary" onClick={() => copy(current.url, 'Adresse kopiert')}>Kopieren</button>
                    </div>
                  </div>
                </>
              )}

              {tab === 'test' && (
                s.placed !== true ? (
                  <>
                    <p className="ovl-plain">Testen geht, sobald es in OBS liegt.</p>
                    <button type="button" className="card-secondary ovl-next" onClick={() => setTab('obs')}>Zu Schritt 2: In OBS</button>
                  </>
                ) : TESTABLE.has(current.name) ? (
                  <>
                    <p className="ovl-plain">{s.tested ? '✓ Getestet. Du kannst jederzeit noch einmal testen.' : 'Zeig es einmal im Stream – dann ist es einsatzbereit.'}</p>
                    <button type="button" className="card-primary ovl-next" onClick={() => testOnStream(current)}>Im Stream testen</button>
                    <span className="dialog-hint">Den Test sehen auch deine Zuschauer.</span>
                  </>
                ) : (
                  <>
                    <p className="ovl-plain">{s.tested ? '✓ Geprüft.' : 'Schau in OBS nach, ob es richtig sitzt und gut aussieht.'}</p>
                    {!s.tested && <button type="button" className="card-primary ovl-next" onClick={() => mark(current, 'tested')}>Sieht gut aus</button>}
                  </>
                )
              )}

              {tab === 'look' && (current.builtin
                ? <OverlayLook name={current.name} onStyleForAll={() => { setOpenName(null); setStyleView(true); }} />
                : <p className="ovl-plain">Ein eigenes Overlay bringt sein Aussehen mit. Ändern kannst du es unter „⋯ Mehr“ → HTML bearbeiten.</p>)}
            </div>
          </div>
        </div>

        {moment && (
          <div className="quest-moment-backdrop">
            <section className="quest-moment" role="dialog" aria-label="Einsatzbereit">
              <span className="ovl-moment-icon" aria-hidden="true">{moment.icon}</span>
              <strong className="quest-moment-title">{moment.label} ist einsatzbereit!</strong>
              <p>{readyCount} von {entries.length} Overlays einsatzbereit</p>
              <span className="quest-xp">+{moment.xp} EP</span>
              {moment.levelUp && <p>Neue Stufe: <strong>{moment.stage}</strong></p>}
              <button type="button" className="card-primary" autoFocus onClick={() => { setMoment(null); setOpenName(null); }}>Weiter</button>
            </section>
          </div>
        )}
        {renderDialogs()}
      </div>
    );
  }

  // ── Overview ───────────────────────────────────────────────────
  return (
    <div className="panel ovl">
      <section className="ovl-collection">
        <span className="ovl-collection-icon" aria-hidden="true">🗃️</span>
        <div className="ovl-collection-text">
          <strong>{readyCount} von {entries.length} Overlays einsatzbereit</strong>
          <span className="ovl-bar" aria-hidden="true"><span style={{ width: `${entries.length ? Math.round((readyCount / entries.length) * 100) : 0}%` }} /></span>
        </div>
        <span className="ovl-collection-xp">+{xp} EP je Overlay</span>
        {styleButton}
      </section>

      {groups.map((g) => (
        <div key={g.group} className="ovl-group">
          <h3 className="dialog-section">{g.label}</h3>
          <div className="ovl-cards">
            {g.items.map((entry) => {
              const s = stepsOf(entry);
              const marks = [s.tuned, s.placed === true, s.tested];
              return (
                <button key={entry.name} type="button" className={`ovl-card ${s.ready ? 'ready' : ''}`} onClick={() => openWorkshop(entry.name)}>
                  <span className="ovl-card-art" aria-hidden="true">{ICONS[entry.name] ?? '✨'}</span>
                  <span className="ovl-card-body">
                    <strong>{entry.label}</strong>
                    <span className="ovl-card-progress">
                      <span className="ovl-card-marks" aria-hidden="true">
                        {marks.map((m, i) => <span key={i} className={m ? (s.ready ? 'ready' : 'on') : ''} />)}
                      </span>
                      <span className={`ovl-card-badge ${s.ready ? 'ready' : ''}`}>{s.ready ? '★ Einsatzbereit' : `${doneCount(s)} von 3`}</span>
                    </span>
                    {draftWaits(entry.name) && <span className="ovl-figma-chip">Entwurf aus Figma</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div className="card-row card-wrap">
        <button type="button" className="card-secondary ovl-add" onClick={() => setCreating(true)}>+ Eigenes Overlay</button>
        <button type="button" className="card-link" onClick={() => openShowcase(false)}>Alle Overlays in allen Zuständen ansehen</button>
        <button type="button" className="card-link" onClick={() => openShowcase(true)}>In Bewegung ansehen</button>
      </div>
      {renderDialogs()}
    </div>
  );

  function renderDialogs() {
    return (
      <>
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
        {placing && <OverlayQuestPath overlays={entries} initial={placing.initial} onClose={() => setPlacing(null)} onPlaced={refresh} />}
      </>
    );
  }
}

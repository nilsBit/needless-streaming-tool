import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useApi, apiPost, apiFetch, getServerPort } from '../hooks/useApi';
import { useToast } from '../contexts/ToastContext';
import CopyButton from '../components/CopyButton';
import FigmaDrafts, { type DesignStatus, type ImplementStatus } from '../components/FigmaDrafts';
import { useWebSocket } from '../hooks/useWebSocket';

const FONT_OPTIONS = [
  // The two the Lexikon style runs on. Without them the current fonts cannot be
  // picked back once someone changes them.
  { value: "'Cormorant Garamond', Georgia, serif", label: 'Cormorant Garamond' },
  { value: "'Source Serif 4', Georgia, serif", label: 'Source Serif 4' },
  { value: "'Bebas Neue', sans-serif", label: 'Bebas Neue' },
  { value: "'Inter', sans-serif", label: 'Inter' },
  { value: "'Roboto', sans-serif", label: 'Roboto' },
  { value: "'Open Sans', sans-serif", label: 'Open Sans' },
  { value: "'Lato', sans-serif", label: 'Lato' },
  { value: "'Montserrat', sans-serif", label: 'Montserrat' },
  { value: "'Poppins', sans-serif", label: 'Poppins' },
  { value: "'Oswald', sans-serif", label: 'Oswald' },
  { value: "'Raleway', sans-serif", label: 'Raleway' },
  { value: "'Playfair Display', serif", label: 'Playfair Display' },
  { value: "'Roboto Mono', monospace", label: 'Roboto Mono' },
  { value: "'Fira Code', monospace", label: 'Fira Code' },
];

const OVERLAY_NAMES = ['challenge', 'todos', 'progress', 'milestone', 'song', 'song-queue', 'alerts', 'poll', 'roulette', 'reward-leaderboard', 'reward-rankchange', 'character'];

const OVERLAY_ICONS: Record<string, string> = {
  challenge: '🎯',
  todos: '✅',
  progress: '📊',
  milestone: '🏆',
  song: '🎵',
  'song-queue': '📜',
  alerts: '🔔',
  poll: '📊',
  roulette: '🎰',
  'reward-leaderboard': '🏅',
  'reward-rankchange': '🔄',
  character: '👥',
};

type PaletteConfig = { global: Record<string, string>; overrides: Record<string, Record<string, string>> };

/**
 * The server's config, with what was edited here since the last sync on top:
 * a key that differs from `synced` was changed here (or removed here) and wins.
 */
function mergeConfig(local: PaletteConfig, synced: PaletteConfig, server: PaletteConfig): PaletteConfig {
  const pick = (l: Record<string, string> = {}, s: Record<string, string> = {}, v: Record<string, string> = {}) => {
    const out = { ...v };
    for (const k of Object.keys(l)) if (l[k] !== s[k]) out[k] = l[k];
    for (const k of Object.keys(s)) if (!(k in l)) delete out[k];
    return out;
  };
  const overrides: PaletteConfig['overrides'] = {};
  for (const name of new Set([...Object.keys(server.overrides ?? {}), ...Object.keys(local.overrides ?? {})])) {
    const merged = pick(local.overrides?.[name], synced.overrides?.[name], server.overrides?.[name]);
    if (Object.keys(merged).length) overrides[name] = merged;
  }
  return { global: pick(local.global, synced.global, server.global), overrides };
}

const TESTABLE_OVERLAYS = new Set(['alerts', 'song', 'poll', 'milestone', 'roulette', 'challenge', 'todos', 'progress', 'song-queue', 'reward-leaderboard', 'reward-rankchange', 'character']);

const THEME_PRESETS: { name: string; label: string; color: string; values: Record<string, string> }[] = [
  {
    // What every overlay ships with (schema v21). First in the list, and the
    // way back after trying any of the others.
    name: 'lexikon',
    label: 'Lexikon',
    color: '#c9a45c',
    values: {
      '--color-primary': '#f4ead7',
      '--color-secondary': '#b8a98c',
      '--color-accent': '#c9a45c',
      '--color-text': '#e1d6c2',
      '--color-bg': '#0e0c0a',
      '--color-bg-opacity': '1',
      '--color-bg-secondary': '#282018',
      '--font-display': "'Cormorant Garamond', Georgia, serif",
      '--font-body': "'Source Serif 4', Georgia, serif",
      '--font-size-base': '18px',
    },
  },
  {
    name: 'gaming',
    label: 'Gaming',
    color: '#ff2d7b',
    values: {
      '--color-primary': '#ff2d7b',
      '--color-secondary': '#00d4ff',
      '--color-accent': '#39ff14',
      '--color-text': '#ffffff',
      '--color-bg': '#0a0a0a',
      '--color-bg-opacity': '1',
      '--color-bg-secondary': '#0d0d0d',
      '--font-display': "'Bebas Neue', sans-serif",
      '--font-body': "'Inter', sans-serif",
      '--font-size-base': '17px',
    },
  },
  {
    name: 'terminal',
    label: 'Terminal',
    color: '#39ff14',
    values: {
      '--color-primary': '#39ff14',
      '--color-secondary': '#00d4ff',
      '--color-accent': '#ff6b35',
      '--color-text': '#ffffff',
      '--color-bg': '#0a0a0a',
      '--color-bg-opacity': '1',
      '--color-bg-secondary': '#0d0d0d',
      '--font-display': "'Fira Code', monospace",
      '--font-body': "'Fira Code', monospace",
      '--font-size-base': '16px',
    },
  },
  {
    name: 'minimal',
    label: 'Minimal',
    color: '#ffffff',
    values: {
      '--color-primary': '#ffffff',
      '--color-secondary': '#888888',
      '--color-accent': '#e67e22',
      '--color-text': '#ffffff',
      '--color-bg': '#111111',
      '--color-bg-opacity': '1',
      '--color-bg-secondary': '#1a1a1a',
      '--font-display': "'Inter', sans-serif",
      '--font-body': "'Inter', sans-serif",
      '--font-size-base': '17px',
    },
  },
  {
    name: 'pastel',
    label: 'Pastel',
    color: '#ff8fab',
    values: {
      '--color-primary': '#ff8fab',
      '--color-secondary': '#a2d2ff',
      '--color-accent': '#bde0fe',
      '--color-text': '#ffffff',
      '--color-bg': '#1a1a2e',
      '--color-bg-opacity': '1',
      '--color-bg-secondary': '#16213e',
      '--font-display': "'Poppins', sans-serif",
      '--font-body': "'Poppins', sans-serif",
      '--font-size-base': '17px',
    },
  },
];

interface OverlayInfo {
  name: string;
  url: string;
  hasIndex?: boolean;
  builtin?: boolean;
  customized?: boolean;
}

function isThemeActive(theme: typeof THEME_PRESETS[0], global: Record<string, string>): boolean {
  return theme.values['--color-primary'] === global['--color-primary']
    && theme.values['--color-secondary'] === global['--color-secondary']
    && theme.values['--color-accent'] === global['--color-accent'];
}

export default function OverlaysPanel() {
  const { toast } = useToast();
  const { data: builtinOverlays, loading: loadingBuiltin, refetch: refetchBuiltin } = useApi<OverlayInfo[]>('/overlays/builtin');
  const { data: customOverlays, loading: loadingCustom, refetch: refetchCustom } = useApi<OverlayInfo[]>('/overlays');

  const [subTab, setSubTab] = useState<'overlays' | 'design' | 'figma'>('overlays');
  const { data: designStatus, refetch: refetchDesign } = useApi<DesignStatus>('/design/status');
  const { data: implementStatus, refetch: refetchImplement } = useApi<ImplementStatus>('/dev/implement');
  const waitingDrafts = (designStatus?.drafts ?? []).filter((d) => !d.done).length;
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [newName, setNewName] = useState('');
  const [uploadMode, setUploadMode] = useState<'file' | 'template'>('template');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [htmlEditor, setHtmlEditor] = useState<{ name: string; isBuiltin: boolean; html: string; loading: boolean; saving: boolean } | null>(null);

  const [overlayConfig, setOverlayConfig] = useState<{
    global: Record<string, string>;
    overrides: Record<string, Record<string, string>>;
  }>({ global: {}, overrides: {} });
  const [selectedOverride, setSelectedOverride] = useState<string>('');

  // The palette as the server last had it, and as it is here now. A save
  // posts the whole config, so it must never carry values the server has
  // since changed from elsewhere (a Figma draft) that weren't edited here.
  const syncedRef = useRef<typeof overlayConfig>({ global: {}, overrides: {} });
  const latestRef = useRef(overlayConfig);
  useEffect(() => { latestRef.current = overlayConfig; }, [overlayConfig]);

  useEffect(() => {
    apiFetch('/overlay-config').then(r => r.json()).then((config) => {
      syncedRef.current = config;
      setOverlayConfig(config);
    }).catch(() => {});
  }, []);

  // Auto-save with debounce — of whatever is current when it fires.
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelSave = () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
  };

  const autoSave = useCallback((_config: typeof overlayConfig) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      saveTimerRef.current = null;
      const config = latestRef.current;
      const result = await apiPost('/overlay-config', config);
      if (result) { syncedRef.current = config; toast.success('Design gespeichert'); }
      else toast.error('Aktion fehlgeschlagen');
    }, 600);
  }, [toast]);

  // Every draft from Figma is followed by an overlay-config broadcast that may
  // have changed the palette. Take the server's values, except for keys edited
  // here since the last sync — those are newer, and a pending save keeps them.
  useWebSocket((event) => {
    if (event === 'design-implement') { refetchImplement(); refetchDesign(); return; }
    if (event !== 'overlay-config') return;
    refetchDesign();
    apiFetch('/overlay-config').then((r) => r.json()).then((server: typeof overlayConfig) => {
      const merged = mergeConfig(latestRef.current, syncedRef.current, server);
      syncedRef.current = server;
      setOverlayConfig(merged);
    }).catch(() => {});
  });

  const updateGlobal = (key: string, value: string) => {
    setOverlayConfig(prev => {
      const next = { ...prev, global: { ...prev.global, [key]: value } };
      autoSave(next);
      return next;
    });
  };

  const updateOverride = (overlay: string, key: string, value: string) => {
    setOverlayConfig(prev => {
      const next = {
        ...prev,
        overrides: { ...prev.overrides, [overlay]: { ...(prev.overrides[overlay] || {}), [key]: value } },
      };
      autoSave(next);
      return next;
    });
  };

  const resetConfig = async () => {
    try {
      cancelSave();
      await apiFetch('/overlay-config', { method: 'DELETE' });
      syncedRef.current = { global: {}, overrides: {} };
      setOverlayConfig({ global: {}, overrides: {} });
      toast.success('Design gespeichert');
    } catch { toast.error('Aktion fehlgeschlagen'); }
  };

  const applyTheme = async (theme: typeof THEME_PRESETS[0]) => {
    cancelSave();
    const newConfig = { ...overlayConfig, global: { ...theme.values } };
    setOverlayConfig(newConfig);
    const result = await apiPost('/overlay-config', newConfig);
    if (!result) { toast.error('Aktion fehlgeschlagen'); return; }
    syncedRef.current = newConfig;
    toast.success(`${theme.label} angewendet`);
  };

  const exportTheme = () => {
    const json = JSON.stringify(overlayConfig, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'overlay-theme.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importThemeRef = useRef<HTMLInputElement>(null);

  const importTheme = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const imported = JSON.parse(text);
      if (imported.global) {
        cancelSave();
        setOverlayConfig(imported);
        const result = await apiPost('/overlay-config', imported);
        if (!result) { toast.error('Aktion fehlgeschlagen'); return; }
        syncedRef.current = imported;
        toast.success('Theme importiert');
      }
    } catch {
      toast.error('Aktion fehlgeschlagen');
    }
    if (importThemeRef.current) importThemeRef.current.value = '';
  };

  if (loadingBuiltin || loadingCustom) return <div className="panel"><p>Laden...</p></div>;

  const createFromTemplate = async () => {
    if (!newName.trim()) return;
    setUploading(true);
    try {
      const templateRes = await apiFetch('/overlays/template');
      const { html } = await templateRes.json();
      const customHtml = html
        .replace("OVERLAY_NAME = 'MeinOverlay'", `OVERLAY_NAME = '${newName.trim()}'`)
        .replace('<div class="title">MEIN OVERLAY</div>', `<div class="title">${newName.trim().toUpperCase()}</div>`)
        .replace('<title>Custom Overlay Template</title>', `<title>${newName.trim()}</title>`);
      await apiPost('/overlays', { name: newName.trim(), html: customHtml });
      setNewName('');
      setShowUpload(false);
      refetchCustom();
    } catch (err) {
      console.error('[Overlays] Create failed:', err);
      toast.error('Aktion fehlgeschlagen');
    }
    setUploading(false);
  };

  const uploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !newName.trim()) return;
    setUploading(true);
    try {
      const html = await file.text();
      await apiPost('/overlays', { name: newName.trim(), html });
      setNewName('');
      setShowUpload(false);
      refetchCustom();
    } catch (err) {
      console.error('[Overlays] Upload failed:', err);
      toast.error('Aktion fehlgeschlagen');
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const deleteOverlay = async (name: string) => {
    try {
      await apiFetch(`/overlays/${name}`, { method: 'DELETE' });
      refetchCustom();
    } catch (err) {
      console.error('[Overlays] Delete failed:', err);
      toast.error('Aktion fehlgeschlagen');
    }
  };

  const openHtmlEditor = async (name: string, isBuiltin: boolean) => {
    setHtmlEditor({ name, isBuiltin, html: '', loading: true, saving: false });
    try {
      const endpoint = isBuiltin ? `/overlays/builtin/${name}/source` : `/overlays/${name}/source`;
      const res = await apiFetch(endpoint);
      const { html } = await res.json();
      setHtmlEditor({ name, isBuiltin, html, loading: false, saving: false });
    } catch (err) {
      console.error('[Overlays] Load HTML failed:', err);
      toast.error('Aktion fehlgeschlagen');
      setHtmlEditor(null);
    }
  };

  const saveHtmlEditor = async () => {
    if (!htmlEditor) return;
    setHtmlEditor({ ...htmlEditor, saving: true });
    try {
      const endpoint = htmlEditor.isBuiltin ? `/overlays/builtin/${htmlEditor.name}` : `/overlays/${htmlEditor.name}`;
      const res = await apiFetch(endpoint, { method: 'PUT', body: JSON.stringify({ html: htmlEditor.html }) });
      if (!res.ok) throw new Error('save failed');
      toast.success('Gespeichert');
      setHtmlEditor(null);
      if (htmlEditor.isBuiltin) refetchBuiltin();
      else refetchCustom();
    } catch (err) {
      console.error('[Overlays] Save HTML failed:', err);
      toast.error('Aktion fehlgeschlagen');
      setHtmlEditor({ ...htmlEditor, saving: false });
    }
  };

  const copyHtmlQuick = async (name: string, isBuiltin: boolean) => {
    try {
      const endpoint = isBuiltin ? `/overlays/builtin/${name}/source` : `/overlays/${name}/source`;
      const res = await apiFetch(endpoint);
      const { html } = await res.json();
      await navigator.clipboard.writeText(html);
      toast.success('HTML kopiert');
    } catch (err) {
      console.error('[Overlays] Copy HTML failed:', err);
      toast.error('Aktion fehlgeschlagen');
    }
  };

  const resetBuiltin = async (name: string) => {
    try {
      await apiFetch(`/overlays/builtin/${name}/override`, { method: 'DELETE' });
      refetchBuiltin();
    } catch (err) {
      console.error('[Overlays] Reset failed:', err);
      toast.error('Aktion fehlgeschlagen');
    }
  };

  // Every overlay in every state with test data — frozen as the Figma capture
  // sees it, or live to judge the motion. Nothing of it reaches OBS.
  const openShowcase = (live: boolean) => {
    window.open(`http://localhost:${getServerPort()}/overlay/showcase/${live ? '?live' : ''}`, '_blank', 'noopener,width=1400,height=900');
  };

  const renderOverlayCard = (o: OverlayInfo, isBuiltin: boolean) => {
    const icon = OVERLAY_ICONS[o.name] || '🔲';
    const isPreview = previewUrl === o.url;

    return (
      <div key={o.name} className="ov2-card-wrapper">
        <div className={`ov2-card ${o.customized ? 'ov2-card--customized' : ''} ${isPreview ? 'ov2-card--active' : ''}`}>
          <div className="ov2-card-left">
            <span className="ov2-card-icon">{icon}</span>
            <div className="ov2-card-info">
              <span className="ov2-card-name">{o.name}</span>
              <span className="ov2-card-url">{o.url}</span>
            </div>
          </div>
          <div className="ov2-card-actions">
            {o.customized && <span className="ov2-badge">angepasst</span>}
            <CopyButton text={o.url} />
            <button
              className="ov2-action-btn"
              onClick={() => copyHtmlQuick(o.name, isBuiltin)}
              title="HTML kopieren"
            >
              {'</>'}
            </button>
            <button
              className={`ov2-action-btn ${isPreview ? 'ov2-action-btn--active' : ''}`}
              onClick={() => setPreviewUrl(isPreview ? null : o.url)}
              title="Vorschau"
            >
              {isPreview ? '✕' : '👁'}
            </button>
            <button
              className="ov2-action-btn"
              onClick={() => openHtmlEditor(o.name, isBuiltin)}
              title="HTML bearbeiten"
            >
              ✏️
            </button>
            {isBuiltin && o.customized && (
              <button className="ov2-action-btn ov2-action-btn--danger" onClick={() => resetBuiltin(o.name)} title="Zurücksetzen">
                ↩️
              </button>
            )}
            {!isBuiltin && (
              <button className="ov2-action-btn ov2-action-btn--danger" onClick={() => deleteOverlay(o.name)} title="Löschen">
                🗑️
              </button>
            )}
          </div>
        </div>
        {isPreview && (
          <div className="ov2-preview">
            <iframe src={o.url} title={`Preview ${o.name}`} />
            {TESTABLE_OVERLAYS.has(o.name) && (
              <button
                className="ov2-test-btn"
                onClick={async () => {
                  const result = await apiPost(`/actions/overlay-test/${o.name}`, {});
                  if (result) toast.success('Test-Event gesendet');
                  else toast.error('Aktion fehlgeschlagen');
                }}
              >
                Test-Event senden
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="panel overlays-panel">
      <h2>🎨 Overlays</h2>
      <p className="panel-desc">Overlay-URLs für OBS Browser Source. Overlays anpassen oder eigene erstellen.</p>

      <div className="ov2-tabs">
        <button className={`ov2-tab ${subTab === 'overlays' ? 'ov2-tab--active' : ''}`} onClick={() => setSubTab('overlays')}>
          Overlays
        </button>
        <button className={`ov2-tab ${subTab === 'design' ? 'ov2-tab--active' : ''}`} onClick={() => setSubTab('design')}>
          Design
        </button>
        <button className={`ov2-tab ${subTab === 'figma' ? 'ov2-tab--active' : ''}`} onClick={() => setSubTab('figma')}>
          Figma{waitingDrafts > 0 ? ` (${waitingDrafts} offen)` : ''}
        </button>
      </div>

      {subTab === 'figma' && (
        <FigmaDrafts status={designStatus} refetch={refetchDesign} implement={implementStatus} refetchImplement={refetchImplement} />
      )}

      {subTab === 'overlays' && (
        <>
          {/* Built-in Overlays */}
          <div className="ov2-section">
            <h3>Eingebaute Overlays</h3>
            <div className="ov2-showcase">
              <span className="ov2-section-desc">Alle Overlays in allen Zuständen, mit Testdaten — erreicht OBS nicht.</span>
              <button className="ov2-small-btn" onClick={() => openShowcase(false)}>🖼️ Showcase</button>
              <button className="ov2-small-btn" onClick={() => openShowcase(true)}>▶ In Bewegung</button>
            </div>
            <div className="ov2-card-list">
              {builtinOverlays?.map((o) => renderOverlayCard(o, true))}
            </div>
          </div>

          {/* Custom Overlays */}
          <div className="ov2-section">
            <h3>Custom Overlays</h3>
            {customOverlays && customOverlays.length > 0 ? (
              <div className="ov2-card-list">
                {customOverlays.map((o) => renderOverlayCard(o, false))}
              </div>
            ) : (
              <p className="ov2-empty">Keine Custom Overlays. Erstelle eins!</p>
            )}

            {!showUpload ? (
              <button className="ov2-add-btn" onClick={() => setShowUpload(true)}>
                + Neues Overlay
              </button>
            ) : (
              <div className="ov2-create-form">
                <input
                  type="text"
                  placeholder="Overlay Name (z.B. mein-alerts)..."
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="ov2-input"
                  autoFocus
                />
                <div className="ov2-mode-toggle">
                  <button className={`ov2-mode-btn ${uploadMode === 'template' ? 'ov2-mode-btn--active' : ''}`} onClick={() => setUploadMode('template')}>
                    Aus Template
                  </button>
                  <button className={`ov2-mode-btn ${uploadMode === 'file' ? 'ov2-mode-btn--active' : ''}`} onClick={() => setUploadMode('file')}>
                    HTML hochladen
                  </button>
                </div>
                {uploadMode === 'template' ? (
                  <button className="ov2-create-btn" onClick={createFromTemplate} disabled={!newName.trim() || uploading}>
                    {uploading ? 'Erstellen...' : 'Aus Template erstellen'}
                  </button>
                ) : (
                  <div className="file-upload">
                    <input ref={fileInputRef} type="file" accept=".html,.htm" onChange={uploadFile} disabled={!newName.trim() || uploading} />
                  </div>
                )}
                <button className="ov2-cancel-btn" onClick={() => { setShowUpload(false); setNewName(''); }}>
                  Abbrechen
                </button>
              </div>
            )}
          </div>

          {/* Guide (collapsible) */}
          <div className="ov2-section">
            <button className="ov2-guide-toggle" onClick={() => setShowGuide(!showGuide)}>
              <span>{showGuide ? '▼' : '▶'}</span>
              <span>Anleitung</span>
            </button>
            {showGuide && (
              <ol className="ov2-guide-steps">
                <li>URL kopieren (📋)</li>
                <li>In OBS: Quellen → + → Browser</li>
                <li>URL einfügen, Breite/Höhe anpassen</li>
                <li>Zum Anpassen: ✏️ klicken, HTML bearbeiten oder in ChatGPT reinladen</li>
                <li>Zum Zurücksetzen: ↩️ klicken</li>
              </ol>
            )}
          </div>
        </>
      )}

      {subTab === 'design' && (
        <>
          {/* Theme Presets */}
          <div className="ov2-section">
            <h3>Themes</h3>
            <div className="ov2-theme-grid">
              {THEME_PRESETS.map(theme => {
                const active = isThemeActive(theme, overlayConfig.global);
                return (
                  <button
                    key={theme.name}
                    className={`ov2-theme-card ${active ? 'ov2-theme-card--active' : ''}`}
                    onClick={() => applyTheme(theme)}
                    title={theme.label}
                  >
                    <div className="ov2-theme-palette">
                      <span className="ov2-theme-swatch ov2-theme-swatch--lg" style={{ background: theme.values['--color-primary'] }} />
                      <span className="ov2-theme-swatch" style={{ background: theme.values['--color-secondary'] }} />
                      <span className="ov2-theme-swatch" style={{ background: theme.values['--color-accent'] }} />
                      <span className="ov2-theme-swatch" style={{ background: theme.values['--color-bg'] }} />
                    </div>
                    <span className="ov2-theme-name">{theme.label}</span>
                    {active && <span className="ov2-theme-active-dot" />}
                  </button>
                );
              })}
            </div>
            <div className="ov2-theme-io">
              <button className="ov2-small-btn" onClick={exportTheme}>Theme exportieren</button>
              <label className="ov2-small-btn" style={{ cursor: 'pointer' }}>
                Theme importieren
                <input
                  ref={importThemeRef}
                  type="file"
                  accept=".json"
                  onChange={importTheme}
                  style={{ display: 'none' }}
                />
              </label>
            </div>
          </div>

          {/* Global Config */}
          <div className="ov2-section">
            <h3>Globale Einstellungen</h3>
            <p className="ov2-section-desc">Farben und Schriften für alle Overlays anpassen.</p>

            <div className="ov2-config-group">
              <h4>Farben</h4>
              <div className="ov2-color-grid">
                <div className="ov2-color-item">
                  <input type="color" value={overlayConfig.global['--color-primary'] || '#ff2d7b'} onChange={e => updateGlobal('--color-primary', e.target.value)} />
                  <span>Primärfarbe</span>
                </div>
                <div className="ov2-color-item">
                  <input type="color" value={overlayConfig.global['--color-secondary'] || '#00d4ff'} onChange={e => updateGlobal('--color-secondary', e.target.value)} />
                  <span>Sekundärfarbe</span>
                </div>
                <div className="ov2-color-item">
                  <input type="color" value={overlayConfig.global['--color-accent'] || '#39ff14'} onChange={e => updateGlobal('--color-accent', e.target.value)} />
                  <span>Akzentfarbe</span>
                </div>
                <div className="ov2-color-item">
                  <input type="color" value={overlayConfig.global['--color-text'] || '#ffffff'} onChange={e => updateGlobal('--color-text', e.target.value)} />
                  <span>Textfarbe</span>
                </div>
                <div className="ov2-color-item">
                  <input type="color" value={overlayConfig.global['--color-bg'] || '#0a0a0a'} onChange={e => updateGlobal('--color-bg', e.target.value)} />
                  <span>Hintergrund</span>
                </div>
                <div className="ov2-color-item">
                  <input type="color" value={overlayConfig.global['--color-bg-secondary'] || '#0d0d0d'} onChange={e => updateGlobal('--color-bg-secondary', e.target.value)} />
                  <span>Hintergrund (sekundär)</span>
                </div>
              </div>
            </div>

            <div className="ov2-config-group">
              <h4>Typografie</h4>
              <div className="config-grid">
                <div className="config-row">
                  <label>Überschrift-Font</label>
                  <select value={overlayConfig.global['--font-display'] || "'Bebas Neue', sans-serif"} onChange={e => updateGlobal('--font-display', e.target.value)}>
                    {FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </div>
                <div className="config-row">
                  <label>Text-Font</label>
                  <select value={overlayConfig.global['--font-body'] || "'Inter', sans-serif"} onChange={e => updateGlobal('--font-body', e.target.value)}>
                    {FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </div>
                <div className="config-row">
                  <label>Schriftgröße</label>
                  <input type="range" min="10" max="24" step="1" value={parseInt(overlayConfig.global['--font-size-base'] || '14')} onChange={e => updateGlobal('--font-size-base', e.target.value + 'px')} />
                  <span>{overlayConfig.global['--font-size-base'] || '14px'}</span>
                </div>
                <div className="config-row">
                  <label>Hintergrund-Transparenz</label>
                  <input type="range" min="0" max="1" step="0.05" value={overlayConfig.global['--color-bg-opacity'] || '1'} onChange={e => updateGlobal('--color-bg-opacity', e.target.value)} />
                  <span>{overlayConfig.global['--color-bg-opacity'] || '1'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Per-overlay Overrides */}
          <div className="ov2-section">
            <h3>Overlay-spezifisch</h3>
            <select className="ov2-input" value={selectedOverride} onChange={e => setSelectedOverride(e.target.value)} style={{ marginBottom: '8px' }}>
              <option value="">Overlay auswählen...</option>
              {OVERLAY_NAMES.map(name => (
                <option key={name} value={name}>
                  {OVERLAY_ICONS[name] || ''} {name}{overlayConfig.overrides[name] ? ' (*)' : ''}
                </option>
              ))}
            </select>

            {selectedOverride && (
              <div className="ov2-override-config">
                <div className="ov2-color-grid">
                  <div className="ov2-color-item">
                    <input type="color" value={overlayConfig.overrides[selectedOverride]?.['--color-primary'] || overlayConfig.global['--color-primary'] || '#ff2d7b'} onChange={e => updateOverride(selectedOverride, '--color-primary', e.target.value)} />
                    <span>Primärfarbe</span>
                  </div>
                  <div className="ov2-color-item">
                    <input type="color" value={overlayConfig.overrides[selectedOverride]?.['--color-secondary'] || overlayConfig.global['--color-secondary'] || '#00d4ff'} onChange={e => updateOverride(selectedOverride, '--color-secondary', e.target.value)} />
                    <span>Sekundärfarbe</span>
                  </div>
                  <div className="ov2-color-item">
                    <input type="color" value={overlayConfig.overrides[selectedOverride]?.['--color-accent'] || overlayConfig.global['--color-accent'] || '#39ff14'} onChange={e => updateOverride(selectedOverride, '--color-accent', e.target.value)} />
                    <span>Akzentfarbe</span>
                  </div>
                </div>
                <button className="ov2-small-btn" onClick={() => {
                  setOverlayConfig(prev => {
                    const next = { ...prev, overrides: { ...prev.overrides } };
                    delete next.overrides[selectedOverride];
                    autoSave(next);
                    return next;
                  });
                }}>Overrides entfernen</button>
              </div>
            )}
          </div>

          {/* Reset */}
          <div className="ov2-section">
            <button className="ov2-small-btn ov2-small-btn--danger" onClick={resetConfig}>
              Alles zurücksetzen
            </button>
          </div>
        </>
      )}

      {htmlEditor && (
        <div className="ov2-modal-backdrop" onClick={() => !htmlEditor.saving && setHtmlEditor(null)}>
          <div className="ov2-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ov2-modal-header">
              <div className="ov2-modal-title">
                <span>{OVERLAY_ICONS[htmlEditor.name] || '🔲'}</span>
                <span>{htmlEditor.name}</span>
                <span className="ov2-modal-sub">HTML</span>
              </div>
              <button className="ov2-action-btn" onClick={() => setHtmlEditor(null)} disabled={htmlEditor.saving}>
                ✕
              </button>
            </div>
            <p className="ov2-modal-hint">HTML kopieren → in ChatGPT bearbeiten → hier wieder einfügen → Speichern.</p>
            <div className="ov2-modal-toolbar">
              <button
                className="ov2-small-btn"
                onClick={async () => {
                  await navigator.clipboard.writeText(htmlEditor.html);
                  toast.success('HTML kopiert');
                }}
                disabled={htmlEditor.loading}
              >
                📋 HTML kopieren
              </button>
            </div>
            <textarea
              className="ov2-modal-textarea"
              value={htmlEditor.loading ? 'Laden...' : htmlEditor.html}
              onChange={(e) => setHtmlEditor({ ...htmlEditor, html: e.target.value })}
              disabled={htmlEditor.loading || htmlEditor.saving}
              spellCheck={false}
            />
            <div className="ov2-modal-actions">
              <button className="ov2-cancel-btn" onClick={() => setHtmlEditor(null)} disabled={htmlEditor.saving}>
                Abbrechen
              </button>
              <button className="ov2-create-btn" onClick={saveHtmlEditor} disabled={htmlEditor.loading || htmlEditor.saving || !htmlEditor.html.trim()}>
                {htmlEditor.saving ? 'Speichert…' : 'HTML speichern'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

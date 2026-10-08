import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useApi, apiPost, apiFetch } from '../hooks/useApi';
import { useToast } from '../contexts/ToastContext';
import FigmaDrafts, { type DesignStatus, type ImplementStatus } from '../components/FigmaDrafts';
import { useWebSocket } from '../hooks/useWebSocket';
import { sendPreview } from '../components/overlays/previewBus';

// "Stil für alle" in the overlay workshop (08.10.): a style for every overlay
// at once, the colours and fonts behind it, and the drafts that come in from
// Figma. An overlay's own look is set in its workshop under "Aussehen".
// Every change goes to the previews at once (previewBus), saved a moment later.

const FONT_OPTIONS = [
  { value: "'JetBrains Mono', ui-monospace, monospace", label: 'JetBrains Mono' },
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

const THEME_PRESETS: { name: string; label: string; values: Record<string, string> }[] = [
  {
    // What every overlay ships with (schema v23) — the layout draft of 23.09.
    name: 'kompendium', label: 'Kompendium',
    values: { '--color-primary': '#f3ecdd', '--color-secondary': '#a79f90', '--color-accent': '#e0201b', '--color-text': '#e9e1d1', '--color-bg': '#141210', '--color-bg-opacity': '1', '--color-bg-secondary': '#1d1a17', '--font-display': "'JetBrains Mono', ui-monospace, monospace", '--font-body': "'JetBrains Mono', ui-monospace, monospace", '--font-size-base': '18px' },
  },
  {
    // The look before the Kompendium (schema v20/v21): serif, gold.
    name: 'lexikon', label: 'Lexikon',
    values: { '--color-primary': '#f4ead7', '--color-secondary': '#b8a98c', '--color-accent': '#c9a45c', '--color-text': '#e1d6c2', '--color-bg': '#0e0c0a', '--color-bg-opacity': '1', '--color-bg-secondary': '#282018', '--font-display': "'Cormorant Garamond', Georgia, serif", '--font-body': "'Source Serif 4', Georgia, serif", '--font-size-base': '18px' },
  },
  { name: 'gaming', label: 'Gaming', values: { '--color-primary': '#ff2d7b', '--color-secondary': '#00d4ff', '--color-accent': '#39ff14', '--color-text': '#ffffff', '--color-bg': '#0a0a0a', '--color-bg-opacity': '1', '--color-bg-secondary': '#0d0d0d', '--font-display': "'Bebas Neue', sans-serif", '--font-body': "'Inter', sans-serif", '--font-size-base': '17px' } },
  { name: 'terminal', label: 'Terminal', values: { '--color-primary': '#39ff14', '--color-secondary': '#00d4ff', '--color-accent': '#ff6b35', '--color-text': '#ffffff', '--color-bg': '#0a0a0a', '--color-bg-opacity': '1', '--color-bg-secondary': '#0d0d0d', '--font-display': "'Fira Code', monospace", '--font-body': "'Fira Code', monospace", '--font-size-base': '16px' } },
  { name: 'minimal', label: 'Minimal', values: { '--color-primary': '#ffffff', '--color-secondary': '#888888', '--color-accent': '#e67e22', '--color-text': '#ffffff', '--color-bg': '#111111', '--color-bg-opacity': '1', '--color-bg-secondary': '#1a1a1a', '--font-display': "'Inter', sans-serif", '--font-body': "'Inter', sans-serif", '--font-size-base': '17px' } },
  { name: 'pastel', label: 'Pastel', values: { '--color-primary': '#ff8fab', '--color-secondary': '#a2d2ff', '--color-accent': '#bde0fe', '--color-text': '#ffffff', '--color-bg': '#1a1a2e', '--color-bg-opacity': '1', '--color-bg-secondary': '#16213e', '--font-display': "'Poppins', sans-serif", '--font-body': "'Poppins', sans-serif", '--font-size-base': '17px' } },
];

function isThemeActive(theme: typeof THEME_PRESETS[0], global: Record<string, string>): boolean {
  return theme.values['--color-primary'] === global['--color-primary']
    && theme.values['--color-secondary'] === global['--color-secondary']
    && theme.values['--color-accent'] === global['--color-accent'];
}

export default function AppearancePanel() {
  const { toast } = useToast();
  const { data: designStatus, refetch: refetchDesign } = useApi<DesignStatus>('/design/status');
  const { data: implementStatus, refetch: refetchImplement } = useApi<ImplementStatus>('/dev/implement');
  const waitingDrafts = (designStatus?.drafts ?? []).filter((d) => !d.done).length;

  const [overlayConfig, setOverlayConfig] = useState<PaletteConfig>({ global: {}, overrides: {} });

  // The palette as the server last had it, and as it is here now. A save
  // posts the whole config, so it must never carry values the server has
  // since changed from elsewhere (a Figma draft) that weren't edited here.
  const syncedRef = useRef<PaletteConfig>({ global: {}, overrides: {} });
  const latestRef = useRef(overlayConfig);
  // Until the server's config is here, the empty start must not reach the previews.
  const loadedRef = useRef(false);
  useEffect(() => { latestRef.current = overlayConfig; if (loadedRef.current) sendPreview(overlayConfig); }, [overlayConfig]);

  useEffect(() => {
    apiFetch('/overlay-config').then((r) => r.json()).then((config) => {
      syncedRef.current = config;
      loadedRef.current = true;
      setOverlayConfig(config);
    }).catch(() => {});
  }, []);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelSave = () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
  };
  const autoSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      saveTimerRef.current = null;
      const config = latestRef.current;
      const result = await apiPost('/overlay-config', config);
      if (result) { syncedRef.current = config; toast.success('Aussehen gespeichert'); }
      else toast.error('Aktion fehlgeschlagen');
    }, 600);
  }, [toast]);

  useWebSocket((event) => {
    if (event === 'design-implement') { refetchImplement(); refetchDesign(); return; }
    if (event !== 'overlay-config') return;
    refetchDesign();
    apiFetch('/overlay-config').then((r) => r.json()).then((server: PaletteConfig) => {
      const merged = mergeConfig(latestRef.current, syncedRef.current, server);
      syncedRef.current = server;
      setOverlayConfig(merged);
    }).catch(() => {});
  });

  const updateGlobal = (key: string, value: string) => {
    setOverlayConfig((prev) => ({ ...prev, global: { ...prev.global, [key]: value } }));
    autoSave();
  };
  const resetConfig = async () => {
    if (!window.confirm('Alle Farben und Schriften zurücksetzen – auch den eigenen Stil einzelner Overlays?')) return;
    try {
      cancelSave();
      await apiFetch('/overlay-config', { method: 'DELETE' });
      syncedRef.current = { global: {}, overrides: {} };
      setOverlayConfig({ global: {}, overrides: {} });
      toast.success('Zurückgesetzt');
    } catch { toast.error('Aktion fehlgeschlagen'); }
  };
  const applyTheme = async (theme: typeof THEME_PRESETS[0]) => {
    cancelSave();
    const next = { ...overlayConfig, global: { ...theme.values } };
    setOverlayConfig(next);
    const result = await apiPost('/overlay-config', next);
    if (!result) { toast.error('Aktion fehlgeschlagen'); return; }
    syncedRef.current = next;
    toast.success(`${theme.label} angewendet`);
  };
  const exportTheme = () => {
    const blob = new Blob([JSON.stringify(overlayConfig, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'overlay-theme.json'; a.click();
    URL.revokeObjectURL(url);
  };
  const importRef = useRef<HTMLInputElement>(null);
  const importTheme = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      if (imported.global) {
        cancelSave();
        setOverlayConfig(imported);
        const result = await apiPost('/overlay-config', imported);
        if (!result) { toast.error('Aktion fehlgeschlagen'); return; }
        syncedRef.current = imported;
        toast.success('Stil importiert');
      }
    } catch { toast.error('Aktion fehlgeschlagen'); }
    if (importRef.current) importRef.current.value = '';
  };

  return (
    <div className="appearance">
      <section className="appearance-section">
        <h3 className="dialog-section">Stil</h3>
        <p className="dialog-hint">Ein Stil färbt alle Overlays auf einmal um. „Kompendium“ ist der Standard.</p>
        <div className="ov2-theme-grid">
          {THEME_PRESETS.map((theme) => {
            const active = isThemeActive(theme, overlayConfig.global);
            return (
              <button key={theme.name} type="button" className={`ov2-theme-card ${active ? 'ov2-theme-card--active' : ''}`} onClick={() => applyTheme(theme)} aria-pressed={active}>
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
        <div className="card-row card-wrap">
          <button type="button" className="card-link" onClick={exportTheme}>Stil als Datei sichern</button>
          <label className="card-link" style={{ cursor: 'pointer' }}>
            Stil aus Datei laden
            <input ref={importRef} type="file" accept=".json" onChange={importTheme} style={{ display: 'none' }} />
          </label>
        </div>
      </section>

      <section className="appearance-section">
        <h3 className="dialog-section">Farben und Schrift</h3>
        <p className="dialog-hint">Gilt für alle Overlays, die keinen eigenen Stil haben. Die Vorschau zeigt jede Änderung sofort, gespeichert wird von selbst.</p>
        <div className="ov2-color-grid">
          {([
            ['--color-primary', 'Erste Farbe', '#f3ecdd'], ['--color-secondary', 'Zweite Farbe', '#a79f90'], ['--color-accent', 'Akzent', '#e0201b'],
            ['--color-text', 'Text', '#e9e1d1'], ['--color-bg', 'Hintergrund', '#141210'], ['--color-bg-secondary', 'Hintergrund, zweiter', '#1d1a17'],
          ] as const).map(([key, label, fallback]) => (
            <div key={key} className="ov2-color-item">
              <input type="color" aria-label={label} value={overlayConfig.global[key] || fallback} onChange={(e) => updateGlobal(key, e.target.value)} />
              <span>{label}</span>
            </div>
          ))}
        </div>
        <div className="config-grid">
          <div className="config-row">
            <label htmlFor="ap-font-display">Schrift für Überschriften</label>
            <select id="ap-font-display" value={overlayConfig.global['--font-display'] || FONT_OPTIONS[0].value} onChange={(e) => updateGlobal('--font-display', e.target.value)}>
              {FONT_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
          <div className="config-row">
            <label htmlFor="ap-font-body">Schrift für Text</label>
            <select id="ap-font-body" value={overlayConfig.global['--font-body'] || FONT_OPTIONS[0].value} onChange={(e) => updateGlobal('--font-body', e.target.value)}>
              {FONT_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
          <div className="config-row">
            <label htmlFor="ap-size">Grundgröße</label>
            <input id="ap-size" type="range" min="10" max="24" step="1" value={parseInt(overlayConfig.global['--font-size-base'] || '18')} onChange={(e) => updateGlobal('--font-size-base', e.target.value + 'px')} />
            <span>{overlayConfig.global['--font-size-base'] || '18px'}</span>
          </div>
          <div className="config-row">
            <label htmlFor="ap-opacity">Deckkraft des Hintergrunds</label>
            <input id="ap-opacity" type="range" min="0" max="1" step="0.05" value={overlayConfig.global['--color-bg-opacity'] || '1'} onChange={(e) => updateGlobal('--color-bg-opacity', e.target.value)} />
            <span>{Math.round(Number(overlayConfig.global['--color-bg-opacity'] || '1') * 100)} %</span>
          </div>
        </div>
      </section>


      <section className="appearance-section">
        <h3 className="dialog-section">Entwürfe aus Figma{waitingDrafts > 0 ? ` · ${waitingDrafts} offen` : ''}</h3>
        <p className="dialog-hint">Du gestaltest ein Overlay in Figma und schickst es mit dem Plugin hierher. Was eindeutig ist, übernimmt das Tool sofort; der Rest wartet hier.</p>
        <FigmaDrafts status={designStatus} refetch={refetchDesign} implement={implementStatus} refetchImplement={refetchImplement} />
      </section>

      <div className="card-links">
        <button type="button" className="card-link" onClick={resetConfig}>Alles zurücksetzen</button>
      </div>
    </div>
  );
}

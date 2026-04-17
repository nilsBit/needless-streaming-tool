import React, { useState, useEffect, useRef } from 'react';
import { useApi, apiPost, apiFetch } from '../hooks/useApi';
import { useTranslation } from '../i18n/LanguageContext';
import { useToast } from '../i18n/ToastContext';
import CopyButton from '../components/CopyButton';

const FONT_OPTIONS = [
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

const OVERLAY_NAMES = ['experiment', 'todos', 'progress', 'milestone', 'song', 'alerts', 'poll', 'roulette'];

interface OverlayInfo {
  name: string;
  url: string;
  hasIndex?: boolean;
  builtin?: boolean;
  customized?: boolean;
}

export default function OverlaysPanel() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: builtinOverlays, loading: loadingBuiltin, refetch: refetchBuiltin } = useApi<OverlayInfo[]>('/overlays/builtin');
  const { data: customOverlays, loading: loadingCustom, refetch: refetchCustom } = useApi<OverlayInfo[]>('/overlays');

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [newName, setNewName] = useState('');
  const [uploadMode, setUploadMode] = useState<'file' | 'template'>('template');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const builtinFileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [editingBuiltin, setEditingBuiltin] = useState<string | null>(null);

  const [overlayConfig, setOverlayConfig] = useState<{
    global: Record<string, string>;
    overrides: Record<string, Record<string, string>>;
  }>({ global: {}, overrides: {} });
  const [selectedOverride, setSelectedOverride] = useState<string>('');

  useEffect(() => {
    apiFetch('/overlay-config').then(r => r.json()).then(setOverlayConfig).catch(() => {});
  }, []);

  const updateGlobal = (key: string, value: string) => {
    setOverlayConfig(prev => ({ ...prev, global: { ...prev.global, [key]: value } }));
  };

  const updateOverride = (overlay: string, key: string, value: string) => {
    setOverlayConfig(prev => ({
      ...prev,
      overrides: { ...prev.overrides, [overlay]: { ...(prev.overrides[overlay] || {}), [key]: value } },
    }));
  };

  const saveConfig = async () => {
    const result = await apiPost('/overlay-config', overlayConfig);
    if (!result) { toast.error(t('error.action_failed')); return; }
    toast.success(t('overlay_config.saved'));
  };

  const resetConfig = async () => {
    try {
      await apiFetch('/overlay-config', { method: 'DELETE' });
      setOverlayConfig({ global: {}, overrides: {} });
      toast.success(t('overlay_config.saved'));
    } catch { toast.error(t('error.action_failed')); }
  };

  if (loadingBuiltin || loadingCustom) return <div className="panel"><p>{t('common.loading')}</p></div>;

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
      toast.error(t('error.action_failed'));
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
      toast.error(t('error.action_failed'));
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
      toast.error(t('error.action_failed'));
    }
  };

  // Builtin overlay: upload custom HTML to replace
  const customizeBuiltin = async (name: string, file: File) => {
    try {
      const html = await file.text();
      await apiFetch(`/overlays/builtin/${name}`, {
        method: 'PUT',
        body: JSON.stringify({ html }),
      });
      refetchBuiltin();
      setEditingBuiltin(null);
    } catch (err) {
      console.error('[Overlays] Customize failed:', err);
      toast.error(t('error.action_failed'));
    }
  };

  // Builtin overlay: reset to default
  const resetBuiltin = async (name: string) => {
    try {
      await apiFetch(`/overlays/builtin/${name}/override`, { method: 'DELETE' });
      refetchBuiltin();
    } catch (err) {
      console.error('[Overlays] Reset failed:', err);
      toast.error(t('error.action_failed'));
    }
  };

  return (
    <div className="panel overlays-panel">
      <h2>🎨 Overlays</h2>
      <p className="panel-desc">{t('overlays_panel.desc')}</p>

      <div className="overlay-section">
        <h3>{t('overlays_panel.builtin')}</h3>
        <div className="overlay-list">
          {builtinOverlays?.map((o) => (
            <div key={o.name} className={`overlay-item ${o.customized ? 'overlay-customized' : ''}`}>
              <div className="overlay-name-row">
                <span className="overlay-name">{o.name}</span>
                {o.customized && <span className="overlay-badge">{t('overlays_panel.customized')}</span>}
              </div>
              <div className="overlay-actions">
                <CopyButton text={o.url} />
                <button className="btn-copy-small" onClick={() => setPreviewUrl(o.url)} title={t('tooltip.preview')}>
                  👁
                </button>
                {editingBuiltin === o.name ? (
                  <>
                    <input
                      ref={builtinFileRef}
                      type="file"
                      accept=".html,.htm"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) customizeBuiltin(o.name, file);
                      }}
                    />
                    <button className="btn-copy-small" onClick={() => builtinFileRef.current?.click()}>
                      📄 {t('overlays_panel.file')}
                    </button>
                    <button className="btn-copy-small" onClick={() => setEditingBuiltin(null)}>
                      ✕
                    </button>
                  </>
                ) : (
                  <button className="btn-copy-small" onClick={() => setEditingBuiltin(o.name)} title={t('tooltip.edit')}>
                    ✏️
                  </button>
                )}
                {o.customized && (
                  <button className="btn-delete-small" onClick={() => resetBuiltin(o.name)} title={t('tooltip.reset')}>
                    ↩️
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="overlay-section">
        <h3>{t('overlays_panel.custom')}</h3>
        {customOverlays && customOverlays.length > 0 ? (
          <div className="overlay-list">
            {customOverlays.map((o) => (
              <div key={o.name} className="overlay-item">
                <span className="overlay-name">{o.name}</span>
                <div className="overlay-actions">
                  <CopyButton text={o.url} />
                  <button className="btn-copy-small" onClick={() => setPreviewUrl(o.url)} title={t('tooltip.preview')}>
                    👁
                  </button>
                  <button className="btn-delete-small" onClick={() => deleteOverlay(o.name)} title={t('tooltip.delete')}>
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty">{t('overlays_panel.no_custom')}</p>
        )}

        {!showUpload ? (
          <button className="btn-add" onClick={() => setShowUpload(true)}>
            {t('overlays_panel.new')}
          </button>
        ) : (
          <div className="upload-form">
            <input
              type="text"
              placeholder={t('overlays_panel.name_placeholder')}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="overlay-name-input"
            />
            <div className="upload-mode-toggle">
              <button className={`mode-btn ${uploadMode === 'template' ? 'active' : ''}`} onClick={() => setUploadMode('template')}>
                {t('overlays_panel.from_template')}
              </button>
              <button className={`mode-btn ${uploadMode === 'file' ? 'active' : ''}`} onClick={() => setUploadMode('file')}>
                {t('overlays_panel.upload_html')}
              </button>
            </div>
            {uploadMode === 'template' ? (
              <button className="btn-create" onClick={createFromTemplate} disabled={!newName.trim() || uploading}>
                {uploading ? t('overlays_panel.creating') : t('overlays_panel.create')}
              </button>
            ) : (
              <div className="file-upload">
                <input ref={fileInputRef} type="file" accept=".html,.htm" onChange={uploadFile} disabled={!newName.trim() || uploading} />
              </div>
            )}
            <button className="btn-cancel" onClick={() => { setShowUpload(false); setNewName(''); }}>{t('overlays_panel.cancel')}</button>
          </div>
        )}
      </div>

      <div className="overlay-section">
        <h3>{t('overlay_config.title')}</h3>
        <p className="setup-info">{t('overlay_config.desc')}</p>

        <h4>{t('overlay_config.global')}</h4>
        <div className="config-grid">
          <div className="config-row">
            <label>{t('overlay_config.color_primary')}</label>
            <input type="color" value={overlayConfig.global['--color-primary'] || '#ff2d7b'} onChange={e => updateGlobal('--color-primary', e.target.value)} />
          </div>
          <div className="config-row">
            <label>{t('overlay_config.color_secondary')}</label>
            <input type="color" value={overlayConfig.global['--color-secondary'] || '#00d4ff'} onChange={e => updateGlobal('--color-secondary', e.target.value)} />
          </div>
          <div className="config-row">
            <label>{t('overlay_config.color_accent')}</label>
            <input type="color" value={overlayConfig.global['--color-accent'] || '#39ff14'} onChange={e => updateGlobal('--color-accent', e.target.value)} />
          </div>
          <div className="config-row">
            <label>{t('overlay_config.color_text')}</label>
            <input type="color" value={overlayConfig.global['--color-text'] || '#ffffff'} onChange={e => updateGlobal('--color-text', e.target.value)} />
          </div>
          <div className="config-row">
            <label>{t('overlay_config.color_bg')}</label>
            <input type="color" value={overlayConfig.global['--color-bg'] || '#0a0a0a'} onChange={e => updateGlobal('--color-bg', e.target.value)} />
          </div>
          <div className="config-row">
            <label>{t('overlay_config.color_bg_secondary')}</label>
            <input type="color" value={overlayConfig.global['--color-bg-secondary'] || '#0d0d0d'} onChange={e => updateGlobal('--color-bg-secondary', e.target.value)} />
          </div>
          <div className="config-row">
            <label>{t('overlay_config.bg_opacity')}</label>
            <input type="range" min="0" max="1" step="0.05" value={overlayConfig.global['--color-bg-opacity'] || '0.92'} onChange={e => updateGlobal('--color-bg-opacity', e.target.value)} />
            <span>{overlayConfig.global['--color-bg-opacity'] || '0.92'}</span>
          </div>
          <div className="config-row">
            <label>{t('overlay_config.font_display')}</label>
            <select value={overlayConfig.global['--font-display'] || "'Bebas Neue', sans-serif"} onChange={e => updateGlobal('--font-display', e.target.value)}>
              {FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
          <div className="config-row">
            <label>{t('overlay_config.font_body')}</label>
            <select value={overlayConfig.global['--font-body'] || "'Inter', sans-serif"} onChange={e => updateGlobal('--font-body', e.target.value)}>
              {FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
          <div className="config-row">
            <label>{t('overlay_config.font_size')}</label>
            <input type="range" min="10" max="24" step="1" value={parseInt(overlayConfig.global['--font-size-base'] || '14')} onChange={e => updateGlobal('--font-size-base', e.target.value + 'px')} />
            <span>{overlayConfig.global['--font-size-base'] || '14px'}</span>
          </div>
        </div>

        <h4 style={{ marginTop: '16px' }}>{t('overlay_config.override')}</h4>
        <select value={selectedOverride} onChange={e => setSelectedOverride(e.target.value)} style={{ marginBottom: '8px' }}>
          <option value="">{t('overlay_config.select_overlay')}</option>
          {OVERLAY_NAMES.map(name => (
            <option key={name} value={name}>{name}{overlayConfig.overrides[name] ? ' (*)' : ''}</option>
          ))}
        </select>

        {selectedOverride && (
          <div className="config-grid">
            <div className="config-row">
              <label>{t('overlay_config.color_primary')}</label>
              <input type="color" value={overlayConfig.overrides[selectedOverride]?.['--color-primary'] || overlayConfig.global['--color-primary'] || '#ff2d7b'} onChange={e => updateOverride(selectedOverride, '--color-primary', e.target.value)} />
            </div>
            <div className="config-row">
              <label>{t('overlay_config.color_secondary')}</label>
              <input type="color" value={overlayConfig.overrides[selectedOverride]?.['--color-secondary'] || overlayConfig.global['--color-secondary'] || '#00d4ff'} onChange={e => updateOverride(selectedOverride, '--color-secondary', e.target.value)} />
            </div>
            <div className="config-row">
              <label>{t('overlay_config.color_accent')}</label>
              <input type="color" value={overlayConfig.overrides[selectedOverride]?.['--color-accent'] || overlayConfig.global['--color-accent'] || '#39ff14'} onChange={e => updateOverride(selectedOverride, '--color-accent', e.target.value)} />
            </div>
            <button className="btn-reset-small" onClick={() => {
              setOverlayConfig(prev => {
                const next = { ...prev, overrides: { ...prev.overrides } };
                delete next.overrides[selectedOverride];
                return next;
              });
            }}>{t('overlay_config.clear_overrides')}</button>
          </div>
        )}

        <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
          <button className="btn-connect" onClick={saveConfig}>{t('settings.save')}</button>
          <button className="btn-reset-small" onClick={resetConfig}>{t('overlay_config.reset_all')}</button>
        </div>
      </div>

      {previewUrl && (
        <div className="overlay-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>{t('overlays_panel.preview')}</h3>
            <button className="btn-delete-small" onClick={() => setPreviewUrl(null)}>✕ {t('overlays_panel.close')}</button>
          </div>
          <div className="overlay-preview-frame">
            <iframe src={previewUrl} title="Overlay Preview" />
          </div>
        </div>
      )}

      <div className="overlay-section overlay-help">
        <h3>{t('overlays_panel.guide_title')}</h3>
        <ol>
          <li>{t('overlays_panel.guide_step1')}</li>
          <li>{t('overlays_panel.guide_step2')}</li>
          <li>{t('overlays_panel.guide_step3')}</li>
          <li>{t('overlays_panel.guide_step4')}</li>
          <li>{t('overlays_panel.guide_step5')}</li>
        </ol>
      </div>
    </div>
  );
}

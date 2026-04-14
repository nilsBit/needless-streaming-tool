import React, { useState, useRef } from 'react';
import { useApi, apiPost } from '../hooks/useApi';
import { getApiToken } from '../hooks/useApi';

interface OverlayInfo {
  name: string;
  url: string;
  hasIndex?: boolean;
  builtin?: boolean;
  customized?: boolean;
}

function authFetch(url: string, options: RequestInit = {}) {
  const token = getApiToken();
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
}

export default function OverlaysPanel() {
  const { data: builtinOverlays, refetch: refetchBuiltin } = useApi<OverlayInfo[]>('/overlays/builtin');
  const { data: customOverlays, refetch: refetchCustom } = useApi<OverlayInfo[]>('/overlays');

  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [newName, setNewName] = useState('');
  const [uploadMode, setUploadMode] = useState<'file' | 'template'>('template');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const builtinFileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [editingBuiltin, setEditingBuiltin] = useState<string | null>(null);

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const createFromTemplate = async () => {
    if (!newName.trim()) return;
    setUploading(true);
    try {
      const templateRes = await authFetch('http://localhost:4000/api/overlays/template');
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
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const deleteOverlay = async (name: string) => {
    try {
      await authFetch(`http://localhost:4000/api/overlays/${name}`, { method: 'DELETE' });
      refetchCustom();
    } catch (err) {
      console.error('[Overlays] Delete failed:', err);
    }
  };

  // Builtin overlay: upload custom HTML to replace
  const customizeBuiltin = async (name: string, file: File) => {
    try {
      const html = await file.text();
      await authFetch(`http://localhost:4000/api/overlays/builtin/${name}`, {
        method: 'PUT',
        body: JSON.stringify({ html }),
      });
      refetchBuiltin();
      setEditingBuiltin(null);
    } catch (err) {
      console.error('[Overlays] Customize failed:', err);
    }
  };

  // Builtin overlay: reset to default
  const resetBuiltin = async (name: string) => {
    try {
      await authFetch(`http://localhost:4000/api/overlays/builtin/${name}/override`, { method: 'DELETE' });
      refetchBuiltin();
    } catch (err) {
      console.error('[Overlays] Reset failed:', err);
    }
  };

  return (
    <div className="panel overlays-panel">
      <h2>🎨 Overlays</h2>
      <p className="panel-desc">Overlay-URLs fuer OBS Browser Source. Overlays anpassen oder eigene erstellen.</p>

      <div className="overlay-section">
        <h3>Eingebaute Overlays</h3>
        <div className="overlay-list">
          {builtinOverlays?.map((o) => (
            <div key={o.name} className={`overlay-item ${o.customized ? 'overlay-customized' : ''}`}>
              <div className="overlay-name-row">
                <span className="overlay-name">{o.name}</span>
                {o.customized && <span className="overlay-badge">angepasst</span>}
              </div>
              <div className="overlay-actions">
                <button className="btn-copy-small" onClick={() => copyUrl(o.url)}>
                  {copiedUrl === o.url ? '✅' : '📋'}
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
                      📄 Datei
                    </button>
                    <button className="btn-copy-small" onClick={() => setEditingBuiltin(null)}>
                      ✕
                    </button>
                  </>
                ) : (
                  <button className="btn-copy-small" onClick={() => setEditingBuiltin(o.name)} title="Design ersetzen">
                    ✏️
                  </button>
                )}
                {o.customized && (
                  <button className="btn-delete-small" onClick={() => resetBuiltin(o.name)} title="Auf Standard zuruecksetzen">
                    ↩️
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="overlay-section">
        <h3>Custom Overlays</h3>
        {customOverlays && customOverlays.length > 0 ? (
          <div className="overlay-list">
            {customOverlays.map((o) => (
              <div key={o.name} className="overlay-item">
                <span className="overlay-name">{o.name}</span>
                <div className="overlay-actions">
                  <button className="btn-copy-small" onClick={() => copyUrl(o.url)}>
                    {copiedUrl === o.url ? '✅' : '📋'}
                  </button>
                  <button className="btn-delete-small" onClick={() => deleteOverlay(o.name)}>
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty">Keine Custom Overlays. Erstelle eins!</p>
        )}

        {!showUpload ? (
          <button className="btn-add" onClick={() => setShowUpload(true)}>
            + Neues Overlay
          </button>
        ) : (
          <div className="upload-form">
            <input
              type="text"
              placeholder="Overlay Name (z.B. mein-alerts)..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="overlay-name-input"
            />
            <div className="upload-mode-toggle">
              <button className={`mode-btn ${uploadMode === 'template' ? 'active' : ''}`} onClick={() => setUploadMode('template')}>
                Aus Template
              </button>
              <button className={`mode-btn ${uploadMode === 'file' ? 'active' : ''}`} onClick={() => setUploadMode('file')}>
                HTML hochladen
              </button>
            </div>
            {uploadMode === 'template' ? (
              <button className="btn-create" onClick={createFromTemplate} disabled={!newName.trim() || uploading}>
                {uploading ? 'Erstellen...' : 'Aus Template erstellen'}
              </button>
            ) : (
              <div className="file-upload">
                <input ref={fileInputRef} type="file" accept=".html,.htm" onChange={uploadFile} disabled={!newName.trim() || uploading} />
              </div>
            )}
            <button className="btn-cancel" onClick={() => { setShowUpload(false); setNewName(''); }}>Abbrechen</button>
          </div>
        )}
      </div>

      <div className="overlay-section overlay-help">
        <h3>Anleitung</h3>
        <ol>
          <li>URL kopieren (📋)</li>
          <li>In OBS: Quellen → + → <strong>Browser</strong></li>
          <li>URL einfuegen, Breite/Hoehe anpassen</li>
          <li>Zum Anpassen: ✏️ klicken und eigene HTML-Datei hochladen</li>
          <li>Zum Zuruecksetzen: ↩️ klicken</li>
        </ol>
      </div>
    </div>
  );
}

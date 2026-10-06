import React, { useState, useEffect } from 'react';
import { useApi, apiPost } from '../hooks/useApi';
import { HotkeyConfig, DEFAULT_HOTKEYS } from '../../../shared/types';
import { useToast } from '../contexts/ToastContext';
import { useFeatures } from '../contexts/FeaturesContext';
import { hotkeyVisible } from '../../../shared/features';

export default function HotkeysPanel() {
  const { toast } = useToast();
  const { features } = useFeatures();
  const { data: hotkeys, refetch } = useApi<HotkeyConfig>('/settings/hotkeys');
  const [editValues, setEditValues] = useState<HotkeyConfig>({ ...DEFAULT_HOTKEYS });
  const [editing, setEditing] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const HOTKEY_LABELS: Record<string, string> = {
    challenge_toggle: 'Ziel für heute starten oder beenden',
    timer_toggle: 'Uhr anhalten oder weiterlaufen lassen',
    hype_moment: 'Hype-Moment merken',
    challenge_done: 'Ziel geschafft',
    challenge_failed: 'Ziel nicht geschafft',
    roulette: 'Glücksrad drehen',
    milestone_minor: 'Kleinen Meilenstein abhaken',
    milestone_major: 'Großen Meilenstein abhaken',
    milestone_epic: 'Epischen Meilenstein abhaken',
  };

  useEffect(() => {
    if (hotkeys) {
      setEditValues({ ...hotkeys });
    }
  }, [hotkeys]);

  const handleChange = (key: string, value: string) => {
    setEditValues((prev) => ({ ...prev, [key]: value }));
  };

  const saveHotkeys = async () => {
    const result = await apiPost('/settings/hotkeys', editValues);
    if (!result) { toast.error('Aktion fehlgeschlagen'); return; }
    setSaved(true);
    refetch();
    setTimeout(() => setSaved(false), 3000);
  };

  if (!hotkeys) return <div className="panel"><p>Laden …</p></div>;

  return (
    <div className="panel settings-panel">
      <p className="panel-desc">Tastenkürzel, die überall gelten – auch wenn das Tool im Hintergrund läuft.</p>

      <div className="settings-section">
        <h3>Tastenkürzel</h3>
        <p className="setup-info" dangerouslySetInnerHTML={{ __html: 'Schreibweise: <code>CommandOrControl+Shift+Taste</code>. <code>CommandOrControl</code> ist unter Windows Strg, auf dem Mac Cmd.' }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
          {Object.keys(HOTKEY_LABELS).filter((key) => hotkeyVisible(features, key)).map((key) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ flex: '0 0 200px', fontSize: '14px' }}>{HOTKEY_LABELS[key]}</span>
              <input
                type="text"
                value={editValues[key as keyof HotkeyConfig] || ''}
                onChange={(e) => handleChange(key, e.target.value)}
                disabled={editing !== key}
                style={{ flex: 1, fontSize: '13px' }}
              />
              <button
                style={{ padding: '4px 12px', fontSize: '13px' }}
                onClick={() => setEditing(editing === key ? null : key)}
              >
                {editing === key ? 'Fertig' : 'Ändern'}
              </button>
            </div>
          ))}
        </div>

        <div style={{ marginTop: '16px', display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button className="btn-connect" onClick={saveHotkeys}>Speichern</button>
          {saved && <span style={{ color: '#2ecc71', fontSize: '14px' }}>Gespeichert</span>}
        </div>

        <p className="setup-info" style={{ marginTop: '12px', fontStyle: 'italic' }}>
          Hinweis: Änderungen werden erst nach einem Neustart der App wirksam.
        </p>
      </div>
    </div>
  );
}

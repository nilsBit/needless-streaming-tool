import React, { useState, useEffect } from 'react';
import { useApi, apiPost } from '../hooks/useApi';
import { HotkeyConfig, DEFAULT_HOTKEYS } from '../../../shared/types';

const HOTKEY_LABELS: Record<string, string> = {
  challenge_toggle: 'Challenge umschalten',
  timer_toggle: 'Timer umschalten',
  hype_moment: 'Hype Moment',
  challenge_done: 'Challenge geschafft',
  challenge_failed: 'Challenge fehlgeschlagen',
  roulette: 'Glücksrad',
  milestone_minor: 'Milestone (Minor)',
  milestone_major: 'Milestone (Major)',
  milestone_epic: 'Milestone (Epic)',
};

export default function HotkeysPanel() {
  const { data: hotkeys, refetch } = useApi<HotkeyConfig>('/settings/hotkeys');
  const [editValues, setEditValues] = useState<HotkeyConfig>({ ...DEFAULT_HOTKEYS });
  const [editing, setEditing] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (hotkeys) {
      setEditValues({ ...hotkeys });
    }
  }, [hotkeys]);

  const handleChange = (key: string, value: string) => {
    setEditValues((prev) => ({ ...prev, [key]: value }));
  };

  const saveHotkeys = async () => {
    await apiPost('/settings/hotkeys', editValues);
    setSaved(true);
    refetch();
    setTimeout(() => setSaved(false), 3000);
  };

  if (!hotkeys) return <div className="panel"><p>Laden...</p></div>;

  return (
    <div className="panel settings-panel">
      <h2>⌨️ Hotkeys</h2>
      <p className="panel-desc">Globale Tastenkürzel konfigurieren.</p>

      <div className="settings-section">
        <h3>Tastenkürzel</h3>
        <p className="setup-info">
          Format: <code>CommandOrControl+Shift+Taste</code> — Verwende <code>CommandOrControl</code> für plattformübergreifende Kompatibilität.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
          {Object.keys(HOTKEY_LABELS).map((key) => (
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
                {editing === key ? 'OK' : 'Ändern'}
              </button>
            </div>
          ))}
        </div>

        <div style={{ marginTop: '16px', display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button className="btn-connect" onClick={saveHotkeys}>💾 Speichern</button>
          {saved && <span style={{ color: '#2ecc71', fontSize: '14px' }}>Gespeichert!</span>}
        </div>

        <p className="setup-info" style={{ marginTop: '12px', fontStyle: 'italic' }}>
          Hinweis: Änderungen werden erst nach einem Neustart der App wirksam.
        </p>
      </div>
    </div>
  );
}

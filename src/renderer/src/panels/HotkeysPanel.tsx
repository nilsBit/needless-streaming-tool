import React, { useState, useEffect } from 'react';
import { useApi, apiPost } from '../hooks/useApi';
import { HotkeyConfig, DEFAULT_HOTKEYS } from '../../../shared/types';
import { useTranslation } from '../i18n/LanguageContext';
import { useToast } from '../i18n/ToastContext';

export default function HotkeysPanel() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: hotkeys, refetch } = useApi<HotkeyConfig>('/settings/hotkeys');
  const [editValues, setEditValues] = useState<HotkeyConfig>({ ...DEFAULT_HOTKEYS });
  const [editing, setEditing] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const HOTKEY_LABELS: Record<string, string> = {
    challenge_toggle: t('hotkeys.challenge_toggle'),
    timer_toggle: t('hotkeys.timer_toggle'),
    hype_moment: t('hotkeys.hype_moment'),
    challenge_done: t('hotkeys.challenge_done'),
    challenge_failed: t('hotkeys.challenge_failed'),
    roulette: t('hotkeys.roulette'),
    milestone_minor: t('hotkeys.milestone_minor'),
    milestone_major: t('hotkeys.milestone_major'),
    milestone_epic: t('hotkeys.milestone_epic'),
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
    if (!result) { toast.error(t('error.action_failed')); return; }
    setSaved(true);
    refetch();
    setTimeout(() => setSaved(false), 3000);
  };

  if (!hotkeys) return <div className="panel"><p>{t('hotkeys.loading')}</p></div>;

  return (
    <div className="panel settings-panel">
      <h2>⌨️ Hotkeys</h2>
      <p className="panel-desc">{t('hotkeys.desc')}</p>

      <div className="settings-section">
        <h3>{t('hotkeys.section_title')}</h3>
        <p className="setup-info" dangerouslySetInnerHTML={{ __html: t('hotkeys.format_hint') }} />

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
                {editing === key ? 'OK' : t('hotkeys.edit')}
              </button>
            </div>
          ))}
        </div>

        <div style={{ marginTop: '16px', display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button className="btn-connect" onClick={saveHotkeys}>💾 {t('hotkeys.save')}</button>
          {saved && <span style={{ color: '#2ecc71', fontSize: '14px' }}>{t('hotkeys.saved')}</span>}
        </div>

        <p className="setup-info" style={{ marginTop: '12px', fontStyle: 'italic' }}>
          {t('hotkeys.restart_hint')}
        </p>
      </div>
    </div>
  );
}

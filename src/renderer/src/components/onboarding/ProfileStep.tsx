import React, { useState } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import { apiPost } from '../../hooks/useApi';
import { useToast } from '../../i18n/ToastContext';
import { applyProfilePreset, ProfileKey } from '../../hooks/useDashboardLayout';
import type { TranslationKey } from '../../i18n/translations';

const PROFILES: { key: ProfileKey; emoji: string; titleKey: TranslationKey; descKey: TranslationKey }[] = [
  { key: 'creative', emoji: '🎨', titleKey: 'profile.creative', descKey: 'profile.creative_desc' },
  { key: 'gaming', emoji: '🎮', titleKey: 'profile.gaming', descKey: 'profile.gaming_desc' },
  { key: 'coding', emoji: '💻', titleKey: 'profile.coding', descKey: 'profile.coding_desc' },
  { key: 'chatting', emoji: '🎙️', titleKey: 'profile.chatting', descKey: 'profile.chatting_desc' },
  { key: 'all', emoji: '⚙️', titleKey: 'profile.all', descKey: 'profile.all_desc' },
];

export default function ProfileStep() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [selected, setSelected] = useState<ProfileKey>('all');
  const [saving, setSaving] = useState(false);

  const selectProfile = async (key: ProfileKey) => {
    if (key === selected || saving) return;
    const prev = selected;
    setSelected(key);
    setSaving(true);
    try {
      await apiPost('/settings/set', { key: 'stream_profile', value: key });
      applyProfilePreset(key);
    } catch {
      setSelected(prev);
      toast.error(t('onboarding.save_failed'));
    }
    setSaving(false);
  };

  return (
    <div className="onboarding-step">
      <h1>{t('profile.title')}</h1>
      <p className="welcome-text">{t('profile.subtitle')}</p>
      <div className="profile-grid">
        {PROFILES.map(p => (
          <button
            key={p.key}
            className={`profile-card ${selected === p.key ? 'active' : ''}`}
            onClick={() => selectProfile(p.key)}
            disabled={saving}
          >
            <span className="profile-card-emoji">{p.emoji}</span>
            <span className="profile-card-title">{t(p.titleKey)}</span>
            <span className="profile-card-desc">{t(p.descKey)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

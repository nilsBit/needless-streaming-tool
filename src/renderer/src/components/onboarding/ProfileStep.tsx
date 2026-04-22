import React, { useState } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import { apiPost } from '../../hooks/useApi';
import { applyProfilePreset, ProfileKey } from '../../hooks/useDashboardLayout';

const PROFILES: { key: ProfileKey; emoji: string; titleKey: string; descKey: string }[] = [
  { key: 'creative', emoji: '🎨', titleKey: 'profile.creative', descKey: 'profile.creative_desc' },
  { key: 'gaming', emoji: '🎮', titleKey: 'profile.gaming', descKey: 'profile.gaming_desc' },
  { key: 'coding', emoji: '💻', titleKey: 'profile.coding', descKey: 'profile.coding_desc' },
  { key: 'chatting', emoji: '🎙️', titleKey: 'profile.chatting', descKey: 'profile.chatting_desc' },
  { key: 'all', emoji: '⚙️', titleKey: 'profile.all', descKey: 'profile.all_desc' },
];

export default function ProfileStep({ onNext }: { onNext: () => void }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<ProfileKey>('all');

  const confirm = async () => {
    await apiPost('/settings/set', { key: 'stream_profile', value: selected });
    applyProfilePreset(selected);
    onNext();
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
            onClick={() => setSelected(p.key)}
          >
            <span className="profile-card-emoji">{p.emoji}</span>
            <span className="profile-card-title">{t(p.titleKey as any)}</span>
            <span className="profile-card-desc">{t(p.descKey as any)}</span>
          </button>
        ))}
      </div>
      <button className="btn-primary" onClick={confirm} style={{ marginTop: '20px' }}>
        {t('onboarding.next')}
      </button>
    </div>
  );
}

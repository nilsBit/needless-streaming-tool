import React, { useState } from 'react';
import { useApi, apiPost } from '../../hooks/useApi';
import { useTranslation } from '../../i18n/LanguageContext';
import NotionDatabasePicker from '../NotionDatabasePicker';

export default function NotionStep() {
  const { t } = useTranslation();
  const { data: notionInfo, refetch: refetchNotion } = useApi<{ configured: boolean }>('/settings/notion');
  const [token, setToken] = useState('');

  const saveToken = async () => {
    if (!token.trim()) return;
    await apiPost('/settings/notion', { token: token.trim() });
    setToken('');
    refetchNotion();
  };

  return (
    <div className="onboarding-step">
      <h2>{t('notion.title')}</h2>
      <p className="step-desc">{t('notion.desc')}</p>

      {!notionInfo?.configured ? (
        <div className="input-row">
          <input
            type="text"
            placeholder="ntn_..."
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveToken()}
          />
          <button onClick={saveToken}>{t('settings.save')}</button>
        </div>
      ) : (
        <>
          <div className="onboarding-check">{t('notion.token_saved')}</div>
          <NotionDatabasePicker />
        </>
      )}
    </div>
  );
}

import React, { useState } from 'react';
import { useApi, apiPost } from '../../hooks/useApi';
import { useTranslation } from '../../i18n/LanguageContext';
import NotionDatabasePicker from '../NotionDatabasePicker';

interface Props {
  onComplete?: () => void;
}

export default function NotionStep({ onComplete }: Props) {
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
        <>
          <div className="onboarding-steps-list">
            <div className="setup-instruction">
              <span className="instruction-number">1</span>
              <span>{t('notion.step1')}</span>
            </div>
            <div className="setup-instruction">
              <span className="instruction-number">2</span>
              <span>{t('notion.step2')}</span>
            </div>
            <div className="setup-instruction">
              <span className="instruction-number">3</span>
              <span>{t('notion.step3')}</span>
            </div>
            <div className="setup-instruction">
              <span className="instruction-number">4</span>
              <span>{t('notion.step4')}</span>
            </div>
            <div className="setup-instruction">
              <span className="instruction-number">5</span>
              <span>{t('notion.step5')}</span>
            </div>
          </div>

          <div className="input-row">
            <input
              type="text"
              placeholder={t('notion.token_placeholder')}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveToken()}
            />
            <button onClick={saveToken}>{t('settings.save')}</button>
          </div>

          <p className="step-hint">{t('notion.share_hint')}</p>
        </>
      ) : (
        <>
          <div className="onboarding-check">{t('notion.token_saved')}</div>
          <NotionDatabasePicker onConfigured={onComplete} />
        </>
      )}
    </div>
  );
}

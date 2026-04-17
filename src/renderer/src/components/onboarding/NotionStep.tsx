import React, { useState } from 'react';
import { useApi, apiPost } from '../../hooks/useApi';
import { useTranslation } from '../../i18n/LanguageContext';

export default function NotionStep() {
  const { t } = useTranslation();
  const { data: notionInfo, refetch: refetchNotion } = useApi<{ configured: boolean }>('/settings/notion');
  const { data: notionDb, refetch: refetchDb } = useApi<{ configured: boolean }>('/settings/notion/database');
  const [token, setToken] = useState('');
  const [dbId, setDbId] = useState('');

  const saveToken = async () => {
    if (!token.trim()) return;
    await apiPost('/settings/notion', { token: token.trim() });
    setToken('');
    refetchNotion();
  };

  const saveDb = async () => {
    if (!dbId.trim()) return;
    await apiPost('/settings/notion/database', { database_id: dbId.trim() });
    setDbId('');
    refetchDb();
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
          </div>

          <div className="input-row">
            <input type="text" placeholder="ntn_..." value={token} onChange={(e) => setToken(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveToken()} />
            <button onClick={saveToken}>{t('settings.save')}</button>
          </div>
        </>
      ) : (
        <>
          <div className="onboarding-check">{t('notion.token_saved')}</div>

          {!notionDb?.configured ? (
            <>
              <div className="onboarding-steps-list" style={{ marginTop: '12px' }}>
                <div className="setup-instruction">
                  <span className="instruction-number">4</span>
                  <span>{t('notion.step4')}</span>
                </div>
                <div className="setup-instruction">
                  <span className="instruction-number">5</span>
                  <span>{t('notion.step5')}</span>
                </div>
                <div className="setup-instruction">
                  <span className="instruction-number">6</span>
                  <span>{t('notion.step6')}</span>
                </div>
              </div>

              <div className="input-row">
                <input type="text" placeholder={t('notion.db_placeholder')} value={dbId} onChange={(e) => setDbId(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveDb()} />
                <button onClick={saveDb}>{t('settings.save')}</button>
              </div>
            </>
          ) : (
            <div className="onboarding-check">{t('notion.complete')}</div>
          )}
        </>
      )}
    </div>
  );
}

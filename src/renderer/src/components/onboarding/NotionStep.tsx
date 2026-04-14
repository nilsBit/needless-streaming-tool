import React, { useState } from 'react';
import { useApi, apiPost } from '../../hooks/useApi';

export default function NotionStep() {
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
      <h2>Notion (optional)</h2>
      <p className="step-desc">
        Clips werden automatisch in Notion gesynct. Erstelle eine Integration auf
        notion.so/my-integrations und teile die Clips-Datenbank mit der Integration.
      </p>

      {!notionInfo?.configured ? (
        <div className="onboarding-field">
          <label>Integration Token:</label>
          <div className="input-row">
            <input type="text" placeholder="ntn_..." value={token} onChange={(e) => setToken(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveToken()} />
            <button onClick={saveToken}>Speichern</button>
          </div>
        </div>
      ) : (
        <div className="onboarding-check">Token gespeichert</div>
      )}

      {notionInfo?.configured && !notionDb?.configured && (
        <div className="onboarding-field">
          <label>Clips-Datenbank ID oder URL:</label>
          <div className="input-row">
            <input type="text" placeholder="Notion Database ID..." value={dbId} onChange={(e) => setDbId(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveDb()} />
            <button onClick={saveDb}>Speichern</button>
          </div>
        </div>
      )}

      {notionDb?.configured && (
        <div className="onboarding-check">Notion komplett eingerichtet</div>
      )}
    </div>
  );
}

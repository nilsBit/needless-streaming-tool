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
      <p className="step-desc">Wenn du Notion nutzt, kannst du deine Clips automatisch dorthin syncen. Falls nicht, überspringe diesen Schritt.</p>

      {!notionInfo?.configured ? (
        <>
          <div className="onboarding-steps-list">
            <div className="setup-instruction">
              <span className="instruction-number">1</span>
              <span>Öffne <strong>notion.so/my-integrations</strong> in deinem Browser</span>
            </div>
            <div className="setup-instruction">
              <span className="instruction-number">2</span>
              <span>Klicke auf <strong>"New integration"</strong> → Name z.B. "Stream Toolkit" → <strong>"Submit"</strong></span>
            </div>
            <div className="setup-instruction">
              <span className="instruction-number">3</span>
              <span>Kopiere den <strong>"Internal Integration Secret"</strong> (fängt mit <strong>ntn_</strong> an) und füge ihn hier ein:</span>
            </div>
          </div>

          <div className="input-row">
            <input type="text" placeholder="ntn_..." value={token} onChange={(e) => setToken(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveToken()} />
            <button onClick={saveToken}>Speichern</button>
          </div>
        </>
      ) : (
        <>
          <div className="onboarding-check">Notion-Token gespeichert</div>

          {!notionDb?.configured ? (
            <>
              <div className="onboarding-steps-list" style={{ marginTop: '12px' }}>
                <div className="setup-instruction">
                  <span className="instruction-number">4</span>
                  <span>Erstelle in Notion eine <strong>Datenbank</strong> für deine Clips (oder nutze eine bestehende)</span>
                </div>
                <div className="setup-instruction">
                  <span className="instruction-number">5</span>
                  <span>Klicke in der Datenbank oben rechts auf <strong>"..."</strong> → <strong>"Add connections"</strong> → wähle deine Integration aus</span>
                </div>
                <div className="setup-instruction">
                  <span className="instruction-number">6</span>
                  <span>Kopiere die <strong>Datenbank-URL</strong> aus der Browser-Adressleiste und füge sie hier ein:</span>
                </div>
              </div>

              <div className="input-row">
                <input type="text" placeholder="Notion Datenbank-URL oder ID..." value={dbId} onChange={(e) => setDbId(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveDb()} />
                <button onClick={saveDb}>Speichern</button>
              </div>
            </>
          ) : (
            <div className="onboarding-check">Notion komplett eingerichtet — Clips werden automatisch gesynct!</div>
          )}
        </>
      )}
    </div>
  );
}

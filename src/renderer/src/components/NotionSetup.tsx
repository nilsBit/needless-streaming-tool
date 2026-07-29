import React, { useState } from 'react';
import { useApi, apiPost } from '../hooks/useApi';
import { useToast } from '../contexts/ToastContext';
import NotionDatabasePicker from './NotionDatabasePicker';

interface Props {
  onComplete?: () => void;
}

export default function NotionSetup({ onComplete }: Props) {
  const { toast } = useToast();
  const { data: notionInfo, refetch: refetchNotion } = useApi<{ configured: boolean }>('/settings/notion');
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);

  const saveToken = async () => {
    if (!token.trim()) return;
    setSaving(true);
    try {
      await apiPost('/settings/notion', { token: token.trim() });
      setToken('');
      refetchNotion();
    } catch {
      toast.error('Speichern fehlgeschlagen');
    }
    setSaving(false);
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
              <span>Öffne notion.so/my-integrations in deinem Browser und logge dich mit deinem Notion-Account ein</span>
            </div>
            <div className="setup-instruction">
              <span className="instruction-number">2</span>
              <span>Klicke auf "+ New integration" (oder "Neue Integration")</span>
            </div>
            <div className="setup-instruction">
              <span className="instruction-number">3</span>
              <span>Vergib einen Namen (z. B. "Stream Toolkit"), wähle deinen Workspace und Type "Internal". Dann auf "Save" klicken.</span>
            </div>
            <div className="setup-instruction">
              <span className="instruction-number">4</span>
              <span>Klicke auf "Show" beim "Internal Integration Secret" und kopiere den Token (beginnt mit ntn_ oder secret_)</span>
            </div>
            <div className="setup-instruction">
              <span className="instruction-number">5</span>
              <span>Füge den Token hier unten ein und speichere:</span>
            </div>
          </div>

          <div className="input-row">
            <input
              type="text"
              placeholder="ntn_... oder secret_..."
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveToken()}
            />
            <button onClick={saveToken} disabled={!token.trim() || saving}>
              {saving ? 'Laden...' : 'Speichern'}
            </button>
          </div>
          <p className="step-hint" style={{ fontSize: '11px', marginTop: '4px' }}>Token beginnt mit ntn_ oder secret_</p>

          <p className="step-hint">Im nächsten Schritt verbindest du eine Notion-Seite oder Datenbank mit der Integration.</p>
        </>
      ) : (
        <>
          <div className="onboarding-check">Notion-Token gespeichert</div>
          <NotionDatabasePicker onConfigured={onComplete} />
        </>
      )}
    </div>
  );
}

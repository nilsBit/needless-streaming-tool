import React, { useState, useEffect } from 'react';
import { useApi, apiPost } from '../../hooks/useApi';

export default function ObsStep() {
  const { data: obsStatus, refetch: refetchStatus } = useApi<{ connected: boolean }>('/obs/status');
  const { data: obsConfig, refetch: refetchConfig } = useApi<{ configured: boolean }>('/obs/config');
  const [host, setHost] = useState('localhost');
  const [port, setPort] = useState('4455');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (obsStatus?.connected) return;
    const interval = setInterval(refetchStatus, 2000);
    return () => clearInterval(interval);
  }, [refetchStatus, obsStatus?.connected]);

  const saveAndConnect = async () => {
    await apiPost('/obs/config', {
      host: host.trim() || 'localhost',
      port: parseInt(port) || 4455,
      password,
    });
    refetchConfig();
    await apiPost('/obs/connect', {});
    refetchStatus();
  };

  return (
    <div className="onboarding-step">
      <h2>OBS verbinden</h2>
      <p className="step-desc">Das Toolkit steuert OBS ueber eine WebSocket-Verbindung. Du musst diese einmal in OBS aktivieren.</p>

      <div className="onboarding-status">
        <span className="status-dot" style={{ background: obsStatus?.connected ? '#2ecc71' : '#e74c3c' }} />
        <span>{obsStatus?.connected ? 'Verbunden mit OBS' : 'Nicht verbunden'}</span>
      </div>

      {!obsStatus?.connected && (
        <>
          <div className="onboarding-steps-list">
            <div className="setup-instruction">
              <span className="instruction-number">1</span>
              <span>Oeffne <strong>OBS Studio</strong></span>
            </div>
            <div className="setup-instruction">
              <span className="instruction-number">2</span>
              <span>Gehe oben im Menue auf <strong>Tools</strong> (oder <strong>Werkzeuge</strong>) → <strong>WebSocket Server Settings</strong></span>
            </div>
            <div className="setup-instruction">
              <span className="instruction-number">3</span>
              <span>Setze den Haken bei <strong>"Enable WebSocket Server"</strong></span>
            </div>
            <div className="setup-instruction">
              <span className="instruction-number">4</span>
              <span>Optional: Klicke auf <strong>"Show Connect Info"</strong> um Port und Passwort zu sehen. Trage sie unten ein.</span>
            </div>
          </div>

          <p className="step-desc" style={{ marginTop: '8px' }}>Verbindungsdaten (Standard-Werte sind meistens richtig):</p>

          <div className="onboarding-fields">
            <div className="input-row">
              <input type="text" placeholder="Host (localhost)" value={host} onChange={(e) => setHost(e.target.value)} style={{ flex: 2 }} />
              <input type="text" placeholder="Port (4455)" value={port} onChange={(e) => setPort(e.target.value)} style={{ flex: 1 }} />
            </div>
            <div className="input-row">
              <input type="password" placeholder="Passwort (leer lassen wenn keins gesetzt)" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <button className="btn-primary" onClick={saveAndConnect}>Verbinden</button>
          </div>

          <p className="step-hint">Tipp: Wenn du kein Passwort in OBS gesetzt hast, lass das Feld einfach leer.</p>
        </>
      )}

      {obsStatus?.connected && (
        <div className="onboarding-check">OBS ist verbunden! Szenen-Wechsel und mehr funktionieren jetzt.</div>
      )}
    </div>
  );
}

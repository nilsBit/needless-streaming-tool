import React, { useState, useEffect } from 'react';
import { useApi, apiPost } from '../../hooks/useApi';

export default function ObsStep() {
  const { data: obsStatus, refetch: refetchStatus } = useApi<{ connected: boolean }>('/obs/status');
  const { data: obsConfig, refetch: refetchConfig } = useApi<{ configured: boolean }>('/obs/config');
  const [host, setHost] = useState('localhost');
  const [port, setPort] = useState('4455');
  const [password, setPassword] = useState('');

  useEffect(() => {
    const interval = setInterval(refetchStatus, 2000);
    return () => clearInterval(interval);
  }, [refetchStatus]);

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
      <p className="step-desc">
        Aktiviere in OBS unter <strong>Tools → WebSocket Server Settings</strong> den WebSocket Server.
        Standard-Port ist 4455.
      </p>

      <div className="onboarding-status">
        <span className="status-dot" style={{ background: obsStatus?.connected ? '#2ecc71' : '#e74c3c' }} />
        <span>{obsStatus?.connected ? 'Verbunden mit OBS' : 'Nicht verbunden'}</span>
      </div>

      {!obsStatus?.connected && (
        <div className="onboarding-fields">
          <div className="input-row">
            <input type="text" placeholder="Host (localhost)" value={host} onChange={(e) => setHost(e.target.value)} style={{ flex: 2 }} />
            <input type="text" placeholder="Port (4455)" value={port} onChange={(e) => setPort(e.target.value)} style={{ flex: 1 }} />
          </div>
          <div className="input-row">
            <input type="password" placeholder="Passwort (optional)" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button className="btn-primary" onClick={saveAndConnect}>Verbinden</button>
        </div>
      )}
    </div>
  );
}

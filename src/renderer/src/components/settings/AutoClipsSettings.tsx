import React, { useState, useEffect } from 'react';
import { apiPost, apiFetch } from '../../hooks/useApi';
import { useToast } from '../../contexts/ToastContext';

// The tool marking Clip Moments on its own. Moved here from the old
// Settings → Features → "Auto-Clips" card; same settings keys, same API.
export default function AutoClipsSettings() {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(true);
  const [triggerReward, setTriggerReward] = useState(true);
  const [triggerHype, setTriggerHype] = useState(true);
  const [triggerMilestone, setTriggerMilestone] = useState(true);

  useEffect(() => {
    const keys = ['auto_clips_enabled', 'auto_clip_trigger_reward', 'auto_clip_trigger_hype', 'auto_clip_trigger_milestone'];
    Promise.all(keys.map(k => apiFetch(`/settings/get/${k}`).then(r => r.json()).then(d => [k, d.value] as [string, string | null]))).then(entries => {
      const m = Object.fromEntries(entries);
      if (m['auto_clips_enabled'] !== null) setEnabled(m['auto_clips_enabled'] !== 'false');
      if (m['auto_clip_trigger_reward'] !== null) setTriggerReward(m['auto_clip_trigger_reward'] !== 'false');
      if (m['auto_clip_trigger_hype'] !== null) setTriggerHype(m['auto_clip_trigger_hype'] !== 'false');
      if (m['auto_clip_trigger_milestone'] !== null) setTriggerMilestone(m['auto_clip_trigger_milestone'] !== 'false');
    }).catch(() => {});
  }, []);

  const save = async () => {
    const result = await apiPost('/settings/batch', {
      auto_clips_enabled: String(enabled),
      auto_clip_trigger_reward: String(triggerReward),
      auto_clip_trigger_hype: String(triggerHype),
      auto_clip_trigger_milestone: String(triggerMilestone),
    });
    if (!result) { toast.error('Aktion fehlgeschlagen'); return; }
    toast.success('Gespeichert');
  };

  return (
    <div className="panel settings-cards">
      <div className="s-card">
        <div className="s-card-header">
          <div className="s-card-info">
            <div>
              <div className="s-card-title">Von selbst merken</div>
              <div className="s-card-status" style={{ color: enabled ? '#2ecc71' : '#888' }}>
                {enabled ? 'An – das Tool setzt die Marke selbst, wenn etwas Besonderes passiert.' : 'Aus – nur du merkst Momente.'}
              </div>
            </div>
          </div>
          <div className="s-toggle-row compact">
            <button className={`s-toggle-btn ${enabled ? 'active' : ''}`} onClick={() => setEnabled(true)}>An</button>
            <button className={`s-toggle-btn ${!enabled ? 'active' : ''}`} onClick={() => setEnabled(false)}>Aus</button>
          </div>
        </div>
        <div className="s-card-body">
          <label className="s-checkbox"><input type="checkbox" checked={triggerReward} onChange={e => setTriggerReward(e.target.checked)} /> bei eingelösten Kanalpunkten</label>
          <label className="s-checkbox"><input type="checkbox" checked={triggerHype} onChange={e => setTriggerHype(e.target.checked)} /> bei einem Hype-Moment</label>
          <label className="s-checkbox"><input type="checkbox" checked={triggerMilestone} onChange={e => setTriggerMilestone(e.target.checked)} /> bei einem abgehakten Meilenstein</label>
          <button className="s-card-action primary" onClick={save}>Speichern</button>
        </div>
      </div>
    </div>
  );
}

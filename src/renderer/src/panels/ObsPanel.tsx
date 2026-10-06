import React, { useState, useEffect } from 'react';
import { useApi, apiPost } from '../hooks/useApi';
import { useWebSocket } from '../hooks/useWebSocket';
import { BotStatus } from '../../../shared/types';
import { useToast } from '../contexts/ToastContext';
import { useFeatures } from '../contexts/FeaturesContext';

interface SceneMapping {
  reward_title: string;
  scene_name: string;
  duration_seconds?: number;
  revert_scene?: string;
}

interface Reward {
  id: string;
  title: string;
}

interface ScreenResult {
  overlay: string;
  scene: string;
  status: 'created' | 'exists' | 'taken';
  missing?: string[];
}

const SCREEN_LABELS: Record<string, string> = { start: 'Startbild', pause: 'Pausenbild', end: 'Endbild' };

function describeScreen(s: ScreenResult): string {
  const label = SCREEN_LABELS[s.overlay] ?? s.overlay;
  if (s.status === 'exists') return `${label}: steht schon in der Szene „${s.scene}“.`;
  if (s.status === 'taken') return `${label}: Eine Szene „${s.scene}“ gibt es schon, sie zeigt aber etwas anderes — nicht angerührt.`;
  const missing = s.missing?.length ? ` Nicht mitgekommen: ${s.missing.join(', ')}.` : '';
  return `${label}: Szene „${s.scene}“ angelegt.${missing}`;
}

export default function ObsPanel() {
  const { toast } = useToast();
  const { isOn } = useFeatures();

  const { data: obsStatus, refetch: refetchObs } = useApi<{ connected: boolean }>('/obs/status');
  const { data: botStatus } = useApi<BotStatus>('/settings/bot-status');
  const { data: scenesData, refetch: refetchScenes } = useApi<{ scenes: string[]; current: string | null }>('/obs/scenes');
  const { data: rewardsData } = useApi<{ rewards: Reward[] }>('/auth/twitch/rewards');
  const { data: savedMappings } = useApi<SceneMapping[]>('/obs/mappings');

  const [mappings, setMappings] = useState<SceneMapping[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [screens, setScreens] = useState<ScreenResult[] | null>(null);
  const [creatingScreens, setCreatingScreens] = useState(false);

  useWebSocket((event) => {
    if (event === 'obs-status') {
      refetchObs();
      refetchScenes();
    }
  });

  useEffect(() => {
    if (savedMappings) setMappings(savedMappings);
  }, [savedMappings]);

  const save = async () => {
    const valid = mappings.filter((m) => m.reward_title && m.scene_name);
    setSaving(true);
    try {
      await apiPost('/obs/mappings', { mappings: valid });
      setDirty(false);
      toast.success('Mapping gespeichert');
    } catch {
      toast.error('Aktion fehlgeschlagen');
    }
    setSaving(false);
  };

  const createScreens = async () => {
    setCreatingScreens(true);
    const result = await apiPost<{ screens: ScreenResult[] }>('/obs/screens', {});
    setCreatingScreens(false);
    if (!result) {
      toast.error('Szenen konnten nicht angelegt werden');
      return;
    }
    setScreens(result.screens);
    refetchScenes();
    const created = result.screens.filter((s) => s.status === 'created').length;
    toast.success(created ? `${created} ${created === 1 ? 'Szene' : 'Szenen'} angelegt` : 'Alle Szenen stehen schon');
  };

  const updateMapping = (index: number, field: keyof SceneMapping, value: string | number) => {
    setMappings(mappings.map((m, i) => (i === index ? { ...m, [field]: value } : m)));
    setDirty(true);
  };

  const addMapping = () => {
    setMappings([...mappings, { reward_title: '', scene_name: '' }]);
    setDirty(true);
  };

  const removeMapping = (index: number) => {
    setMappings(mappings.filter((_, i) => i !== index));
    setDirty(true);
  };

  const obsConnected = !!obsStatus?.connected;
  const twitchConnected = !!botStatus?.connected;
  const scenes = scenesData?.scenes || [];
  const rewards = rewardsData?.rewards || [];

  return (
    <div className="panel obs-panel">
      <div className="obs-status-bar">
        <div className="obs-status-item">
          <span className="status-dot" style={{ background: obsConnected ? '#2ecc71' : '#e74c3c' }} />
          <span>{obsConnected ? 'Verbunden mit OBS' : 'Nicht verbunden'}</span>
        </div>
        <div className="obs-status-item">
          <span className="status-dot" style={{ background: twitchConnected ? '#2ecc71' : '#e74c3c' }} />
          <span>{twitchConnected ? `Twitch: ${botStatus?.channel}` : 'Nicht verbunden'}</span>
        </div>
      </div>

      {!obsConnected && (
        <p className="obs-hint">OBS ist nicht verbunden. Verbinde OBS in den Einstellungen.</p>
      )}
      {!twitchConnected && (
        <p className="obs-hint">Twitch ist nicht verbunden.</p>
      )}

      {isOn('bilder') && (
      <div className="obs-mappings-section">
        <h3>Start, Pause, Ende</h3>
        <p className="setup-info">Legt in OBS je eine Szene für Startbild („start“), Pausenbild („brb“) und Endbild („end“) an. Steht eine davon schon, werden die neuen wie sie aufgebaut: dieselben Quellen an denselben Stellen, nur das Bild getauscht. Vorhandene Szenen bleiben, wie sie sind.</p>
        <div className="obs-mapping-actions">
          <button className="btn-settings-primary" onClick={createScreens} disabled={!obsConnected || creatingScreens}>
            {creatingScreens ? 'Legt an …' : 'Szenen anlegen'}
          </button>
        </div>
        {screens && screens.map((s) => (
          <p key={s.overlay} className="setup-info">{describeScreen(s)}</p>
        ))}
      </div>
      )}

      {isOn('belohnungen') && (
      <div className="obs-mappings-section">
        <h3>Szene per Kanalpunkt</h3>
        <p className="setup-info">Löst jemand diese Belohnung ein, wechselt OBS in die Szene. Danach kann es von selbst zurückwechseln. Belohnungen legst du in Twitch an (Creator-Dashboard → Kanalpunkte); das Tool liest sie von dort.</p>

        <div className="obs-mappings-list">
          {mappings.map((mapping, i) => (
            <div key={i} className="obs-mapping-card">
              <div className="obs-mapping-row">
                <select
                  value={mapping.reward_title}
                  onChange={(e) => updateMapping(i, 'reward_title', e.target.value)}
                  disabled={!twitchConnected}
                >
                  <option value="">{
                    !twitchConnected ? 'Twitch ist nicht verbunden.' :
                    rewards.length === 0 ? 'Keine Belohnungen gefunden' :
                    'Belohnung wählen …'
                  }</option>
                  {rewards.map((r) => (
                    <option key={r.id} value={r.title}>{r.title}</option>
                  ))}
                </select>

                <span className="obs-mapping-arrow">→</span>

                <select
                  value={mapping.scene_name}
                  onChange={(e) => updateMapping(i, 'scene_name', e.target.value)}
                  disabled={!obsConnected}
                >
                  <option value="">{
                    !obsConnected ? 'OBS ist nicht verbunden. Verbinde OBS in den Einstellungen.' :
                    scenes.length === 0 ? 'Keine Szenen gefunden' :
                    'Szene wählen …'
                  }</option>
                  {scenes.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>

                <button type="button" className="card-link" onClick={() => removeMapping(i)}>Entfernen</button>
              </div>

              <div className="obs-mapping-timer-row">
                <label>Zurück nach</label>
                <input
                  type="number"
                  className="obs-mapping-duration"
                  value={mapping.duration_seconds || ''}
                  onChange={(e) => updateMapping(i, 'duration_seconds', parseInt(e.target.value) || 0)}
                  placeholder="Sek."
                  min="0"
                />
                <label>zu</label>
                <select
                  value={mapping.revert_scene || ''}
                  onChange={(e) => updateMapping(i, 'revert_scene', e.target.value)}
                  disabled={!obsConnected}
                >
                  <option value="">Vorherige Szene</option>
                  {scenes.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>

        <div className="obs-mapping-actions">
          <button
            className="btn-settings-ghost"
            onClick={addMapping}
            disabled={!obsConnected || !twitchConnected}
          >
            + Zuordnung hinzufügen
          </button>
          <button
            className="btn-settings-primary"
            onClick={save}
            disabled={!dirty || saving}
          >
            {saving ? 'Speichert …' : 'Speichern'}
          </button>
        </div>
      </div>
      )}
    </div>
  );
}

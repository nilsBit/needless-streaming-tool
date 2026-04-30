import React, { useState, useEffect } from 'react';
import { useApi, apiPost } from '../hooks/useApi';
import { useWebSocket } from '../hooks/useWebSocket';
import { BotStatus } from '../../../shared/types';
import { useTranslation } from '../i18n/LanguageContext';
import { useToast } from '../i18n/ToastContext';

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

export default function ObsPanel() {
  const { t } = useTranslation();
  const { toast } = useToast();

  const { data: obsStatus, refetch: refetchObs } = useApi<{ connected: boolean }>('/obs/status');
  const { data: botStatus } = useApi<BotStatus>('/settings/bot-status');
  const { data: scenesData, refetch: refetchScenes } = useApi<{ scenes: string[]; current: string | null }>('/obs/scenes');
  const { data: rewardsData } = useApi<{ rewards: Reward[] }>('/auth/twitch/rewards');
  const { data: savedMappings } = useApi<SceneMapping[]>('/obs/mappings');

  const [mappings, setMappings] = useState<SceneMapping[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

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
      toast.success(t('obs.mapping_saved'));
    } catch {
      toast.error(t('error.action_failed'));
    }
    setSaving(false);
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
          <span>{obsConnected ? t('settings.obs_connected') : t('settings.obs_not_connected')}</span>
        </div>
        <div className="obs-status-item">
          <span className="status-dot" style={{ background: twitchConnected ? '#2ecc71' : '#e74c3c' }} />
          <span>{twitchConnected ? `Twitch: ${botStatus?.channel}` : t('settings.not_connected')}</span>
        </div>
      </div>

      {!obsConnected && (
        <p className="obs-hint">{t('obs.no_obs_hint')}</p>
      )}
      {!twitchConnected && (
        <p className="obs-hint">{t('obs.no_twitch_hint')}</p>
      )}

      <div className="obs-mappings-section">
        <h3>{t('obs.scene_mappings')}</h3>
        <p className="setup-info">{t('obs.scene_mappings_desc')}</p>

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
                    !twitchConnected ? t('obs.no_twitch_hint') :
                    rewards.length === 0 ? t('obs.no_rewards') :
                    t('obs.reward_placeholder')
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
                    !obsConnected ? t('obs.no_obs_hint') :
                    scenes.length === 0 ? t('obs.no_scenes') :
                    t('obs.scene_placeholder')
                  }</option>
                  {scenes.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>

                <button className="obs-mapping-delete" onClick={() => removeMapping(i)} title="Delete">
                  ✕
                </button>
              </div>

              <div className="obs-mapping-timer-row">
                <label>{t('obs.revert_after')}</label>
                <input
                  type="number"
                  className="obs-mapping-duration"
                  value={mapping.duration_seconds || ''}
                  onChange={(e) => updateMapping(i, 'duration_seconds', parseInt(e.target.value) || 0)}
                  placeholder={t('obs.duration_placeholder')}
                  min="0"
                />
                <label>{t('obs.revert_to')}</label>
                <select
                  value={mapping.revert_scene || ''}
                  onChange={(e) => updateMapping(i, 'revert_scene', e.target.value)}
                  disabled={!obsConnected}
                >
                  <option value="">{t('obs.use_previous')}</option>
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
            + {t('obs.add_mapping')}
          </button>
          <button
            className="btn-settings-primary"
            onClick={save}
            disabled={!dirty || saving}
          >
            {saving ? t('onboarding.loading') : t('settings.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

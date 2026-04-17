import React from 'react';
import { useApi } from '../hooks/useApi';
import { useWebSocket } from '../hooks/useWebSocket';
import { Raid } from '../../../shared/types';
import { useTranslation } from '../i18n/LanguageContext';

export default function RaidsPanel() {
  const { t } = useTranslation();
  const { data: raids, loading, refetch } = useApi<Raid[]>('/raids');

  useWebSocket((event) => {
    if (event === 'raid-created' || event === 'raid-deleted') refetch();
  });

  if (loading && !raids) {
    return <div className="panel"><p className="empty">{t('common.loading')}</p></div>;
  }

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="panel raids-panel">
      <h2>⚔️ Raids</h2>
      <p className="panel-desc">{t('raids.desc')}</p>

      <div className="raids-list">
        {(!raids || raids.length === 0) && <p className="empty">{t('raids.empty')}</p>}
        {raids?.map((r) => (
          <div key={r.id} className="raid-item">
            <span className="raid-streamer">{r.streamer_name}</span>
            <span className="raid-viewers">{r.viewer_count} {t('raids.viewers')}</span>
            <span className="raid-time">{formatTime(r.created_at)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

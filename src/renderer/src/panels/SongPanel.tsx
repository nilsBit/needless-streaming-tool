import React, { useState } from 'react';
import { useApi, apiPost } from '../hooks/useApi';
import { useWebSocket } from '../hooks/useWebSocket';
import { useTranslation } from '../i18n/LanguageContext';
import { useToast } from '../i18n/ToastContext';

export default function SongPanel() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data, loading, refetch } = useApi<{ song: string | null }>('/actions/song');
  const [newSong, setNewSong] = useState('');

  useWebSocket((event) => {
    if (event === 'song-update' || event === 'song-clear') refetch();
  });

  if (loading && !data) {
    return <div className="panel"><p className="empty">{t('common.loading')}</p></div>;
  }

  const setSong = async () => {
    if (!newSong.trim()) return;
    const result = await apiPost('/actions/song', { song: newSong.trim() });
    if (!result) { toast.error(t('error.action_failed')); return; }
    setNewSong('');
    refetch();
  };

  const clearSong = async () => {
    const result = await apiPost('/actions/song', { song: null });
    if (!result) { toast.error(t('error.action_failed')); return; }
    refetch();
  };

  return (
    <div className="panel song-panel">
      <h2>🎵 Now Playing</h2>
      <p className="panel-desc">{t('song.desc')}</p>

      {!data?.song && (
        <p className="empty">{t('song.no_song')}</p>
      )}

      {data?.song && (
        <div className="song-current">
          <span className="song-title">{data.song}</span>
          <button className="btn-reset" onClick={clearSong}>{t('song.clear')}</button>
        </div>
      )}

      <div className="song-input">
        <input
          type="text"
          placeholder={t('song.placeholder')}
          value={newSong}
          onChange={(e) => setNewSong(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && setSong()}
        />
        <button onClick={setSong}>{t('song.set')}</button>
      </div>
    </div>
  );
}

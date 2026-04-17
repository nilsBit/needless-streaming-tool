import React, { useState } from 'react';
import { useApi, apiPost } from '../hooks/useApi';
import { useWebSocket } from '../hooks/useWebSocket';
import { useTranslation } from '../i18n/LanguageContext';

export default function SongPanel() {
  const { t } = useTranslation();
  const { data, refetch } = useApi<{ song: string | null }>('/actions/song');
  const [newSong, setNewSong] = useState('');

  useWebSocket((event) => {
    if (event === 'song-update' || event === 'song-clear') refetch();
  });

  const setSong = async () => {
    if (!newSong.trim()) return;
    await apiPost('/actions/song', { song: newSong.trim() });
    setNewSong('');
    refetch();
  };

  const clearSong = async () => {
    await apiPost('/actions/song', { song: null });
    refetch();
  };

  return (
    <div className="panel song-panel">
      <h2>🎵 Now Playing</h2>
      <p className="panel-desc">{t('song.desc')}</p>

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

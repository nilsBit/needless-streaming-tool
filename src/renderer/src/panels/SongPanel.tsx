import React, { useState } from 'react';
import { useApi, apiPost, apiDelete } from '../hooks/useApi';
import { useWebSocket } from '../hooks/useWebSocket';
import { useTranslation } from '../i18n/LanguageContext';
import { useToast } from '../i18n/ToastContext';
import { SongRequest } from '../../../shared/types';
import ChatCommands from '../components/ChatCommands';

interface SongData { title: string; artist: string; source: string }
interface SongResponse {
  song: SongData | null;
  auto_detect: boolean;
  auto_detect_supported: boolean;
  auto_detect_running: boolean;
}

function prettySource(source: string): string {
  if (!source) return '';
  if (source === 'manual') return 'Manual';
  if (source === 'test') return 'Test';
  const lower = source.toLowerCase();
  if (lower.includes('spotify')) return 'Spotify';
  if (lower.includes('chrome')) return 'Chrome';
  if (lower.includes('firefox')) return 'Firefox';
  if (lower.includes('edge')) return 'Edge';
  if (lower.includes('vlc')) return 'VLC';
  if (lower.includes('potplayer')) return 'PotPlayer';
  if (lower.includes('itunes') || lower.includes('apple')) return 'Apple Music';
  return source.split('.')[0].split('!')[0];
}

export default function SongPanel() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data, loading, refetch } = useApi<SongResponse>('/actions/song');
  const [showManual, setShowManual] = useState(false);
  const [manualTitle, setManualTitle] = useState('');
  const [manualArtist, setManualArtist] = useState('');

  const { data: queue, refetch: refetchQueue } = useApi<SongRequest[]>('/song-requests');

  useWebSocket((event) => {
    if (event === 'song-update' || event === 'song-clear') refetch();
    if (event === 'sr-update') refetchQueue();
  });

  if (loading && !data) {
    return <div className="panel"><p className="empty">{t('common.loading')}</p></div>;
  }

  const toggleAutoDetect = async () => {
    const result = await apiPost<{ success: boolean; enabled: boolean }>('/actions/song/auto-detect', {
      enabled: !data?.auto_detect,
    });
    if (!result) { toast.error(t('error.action_failed')); return; }
    refetch();
  };

  const setManualSong = async () => {
    if (!manualTitle.trim()) return;
    const result = await apiPost('/actions/song', {
      title: manualTitle.trim(),
      artist: manualArtist.trim(),
      source: 'manual',
    });
    if (!result) { toast.error(t('error.action_failed')); return; }
    setManualTitle('');
    setManualArtist('');
    setShowManual(false);
    refetch();
  };

  const clearSong = async () => {
    const result = await apiPost('/actions/song', { title: null });
    if (!result) { toast.error(t('error.action_failed')); return; }
    refetch();
  };

  const playSong = async (id: number) => {
    const result = await apiPost(`/song-requests/${id}/play`, {});
    if (!result) { toast.error(t('error.action_failed')); return; }
    refetchQueue();
  };

  const skipSong = async (id: number) => {
    const result = await apiPost(`/song-requests/${id}/skip`, {});
    if (!result) { toast.error(t('error.action_failed')); return; }
    refetchQueue();
  };

  const deleteSong = async (id: number) => {
    const ok = await apiDelete(`/song-requests/${id}`);
    if (!ok) { toast.error(t('error.action_failed')); return; }
    refetchQueue();
  };

  const clearQueue = async () => {
    const result = await apiPost('/song-requests/clear', {});
    if (!result) { toast.error(t('error.action_failed')); return; }
    toast.success(t('sr.cleared'));
    refetchQueue();
  };

  const pendingQueue = (queue || []).filter(s => s.status === 'pending');
  const playingNow = (queue || []).find(s => s.status === 'playing');

  const autoSupported = data?.auto_detect_supported ?? false;
  const autoOn = data?.auto_detect ?? false;
  const song = data?.song ?? null;

  return (
    <div className="panel song-panel">
      <h2>🎵 Now Playing</h2>
      <p className="panel-desc">{t('song.desc_auto')}</p>

      {autoSupported && (
        <div className="song-auto-toggle">
          <label className="song-toggle-label">
            <input type="checkbox" checked={autoOn} onChange={toggleAutoDetect} />
            <span>{t('song.auto_detect')}</span>
          </label>
          {autoOn && data?.auto_detect_running && (
            <span className="song-status-dot song-status-dot--live" title="Live" />
          )}
        </div>
      )}

      {!autoSupported && (
        <p className="song-platform-note">{t('song.auto_unsupported')}</p>
      )}

      {song ? (
        <div className="song-current">
          <div className="song-current-info">
            <span className="song-title">{song.title}</span>
            {song.artist && <span className="song-artist">{song.artist}</span>}
            {song.source && <span className="song-source">{prettySource(song.source)}</span>}
          </div>
          <button className="btn-reset" onClick={clearSong}>{t('song.clear')}</button>
        </div>
      ) : (
        <p className="empty">{autoOn ? t('song.waiting') : t('song.no_song')}</p>
      )}

      <div className="song-manual">
        <button className="song-manual-toggle" onClick={() => setShowManual(!showManual)}>
          <span>{showManual ? '▼' : '▶'}</span>
          <span>{t('song.manual_override')}</span>
        </button>
        {showManual && (
          <div className="song-manual-form">
            <input
              type="text"
              placeholder={t('song.title_placeholder')}
              value={manualTitle}
              onChange={(e) => setManualTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && setManualSong()}
            />
            <input
              type="text"
              placeholder={t('song.artist_placeholder')}
              value={manualArtist}
              onChange={(e) => setManualArtist(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && setManualSong()}
            />
            <button onClick={setManualSong} disabled={!manualTitle.trim()}>{t('song.set')}</button>
          </div>
        )}
      </div>
      <div className="sr-section">
        <div className="sr-header">
          <h3>🎵 {t('sr.title')} <span className="sr-badge">{pendingQueue.length}</span></h3>
          {pendingQueue.length > 0 && (
            <button className="btn-export-small" onClick={clearQueue}>{t('sr.clear')}</button>
          )}
        </div>

        {playingNow && (
          <div className="sr-row sr-playing">
            <span className="sr-row-pos">▶</span>
            <span className="sr-row-title">{playingNow.title}{playingNow.artist ? ` — ${playingNow.artist}` : ''}</span>
            <span className="sr-row-source">{playingNow.source === 'youtube' ? '🔴' : '🟢'}</span>
            <span className="sr-row-user">@{playingNow.requested_by}</span>
            <a className="sr-row-link" href={playingNow.url} target="_blank" rel="noopener noreferrer" title="Open">🔗</a>
            <button className="btn-clip-delete" onClick={() => skipSong(playingNow.id)} title={t('sr.skip')}>⏭</button>
          </div>
        )}

        {pendingQueue.length === 0 && !playingNow ? (
          <p className="empty">{t('sr.empty')}</p>
        ) : (
          pendingQueue.map((sr, i) => (
            <div key={sr.id} className="sr-row">
              <span className="sr-row-pos">{i + 1}</span>
              <span className="sr-row-title">{sr.title}{sr.artist ? ` — ${sr.artist}` : ''}</span>
              <span className="sr-row-source">{sr.source === 'youtube' ? '🔴' : '🟢'}</span>
              <span className="sr-row-user">@{sr.requested_by}</span>
              <a className="sr-row-link" href={sr.url} target="_blank" rel="noopener noreferrer" title="Open">🔗</a>
              <button className="btn-clip-delete" onClick={() => playSong(sr.id)} title={t('sr.play')}>▶</button>
              <button className="btn-clip-delete" onClick={() => skipSong(sr.id)} title={t('sr.skip')}>⏭</button>
              <button className="btn-clip-delete" onClick={() => deleteSong(sr.id)} title={t('tooltip.delete')}>✕</button>
            </div>
          ))
        )}
      </div>

      <ChatCommands commands={[
        { cmd: '!sr', desc: t('sr.cmd_sr') },
        { cmd: '!queue', desc: t('sr.cmd_queue') },
      ]} />
    </div>
  );
}

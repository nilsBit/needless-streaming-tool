import React, { useState } from 'react';
import { useApi, apiPost, apiDelete } from '../hooks/useApi';
import { useWebSocket } from '../hooks/useWebSocket';
import { useToast } from '../contexts/ToastContext';
import { SongRequest, SongData } from '../../../shared/types';
import Dialog from '../components/ux/Dialog';

interface SongResponse {
  song: SongData | null;
  auto_detect: boolean;
  auto_detect_supported: boolean;
  auto_detect_running: boolean;
}

function prettySource(source: string): string {
  if (!source) return '';
  if (source === 'manual') return 'von Hand';
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

// "Musik" on "Im Stream": what plays right now and whether the tool listens
// on its own. Setting a song by hand and the viewers' requests sit in dialogs.
export default function SongPanel() {
  const { toast } = useToast();
  const { data, loading, refetch } = useApi<SongResponse>('/actions/song');
  const { data: queue, refetch: refetchQueue } = useApi<SongRequest[]>('/song-requests');
  const [manual, setManual] = useState(false);
  const [manualTitle, setManualTitle] = useState('');
  const [manualArtist, setManualArtist] = useState('');
  const [showQueue, setShowQueue] = useState(false);

  useWebSocket((event) => {
    if (event === 'song-update' || event === 'song-clear') refetch();
    if (event === 'sr-update') refetchQueue();
  });

  if (loading && !data) return <div className="panel"><p className="empty">Laden …</p></div>;

  const toggleAutoDetect = async () => {
    const result = await apiPost<{ success: boolean; enabled: boolean }>('/actions/song/auto-detect', { enabled: !data?.auto_detect });
    if (!result) { toast.error('Aktion fehlgeschlagen'); return; }
    refetch();
  };
  const setManualSong = async () => {
    if (!manualTitle.trim()) return;
    const result = await apiPost('/actions/song', { title: manualTitle.trim(), artist: manualArtist.trim(), source: 'manual' });
    if (!result) { toast.error('Song nicht gesetzt'); return; }
    setManualTitle(''); setManualArtist(''); setManual(false);
    refetch();
  };
  const clearSong = async () => {
    const result = await apiPost('/actions/song', { title: null });
    if (!result) { toast.error('Aktion fehlgeschlagen'); return; }
    refetch();
  };
  const playSong = async (id: number) => {
    const result = await apiPost(`/song-requests/${id}/play`, {});
    if (!result) { toast.error('Aktion fehlgeschlagen'); return; }
    refetchQueue();
  };
  const skipSong = async (id: number) => {
    const result = await apiPost(`/song-requests/${id}/skip`, {});
    if (!result) { toast.error('Aktion fehlgeschlagen'); return; }
    refetchQueue();
  };
  const deleteSong = async (id: number) => {
    const ok = await apiDelete(`/song-requests/${id}`);
    if (!ok) { toast.error('Aktion fehlgeschlagen'); return; }
    refetchQueue();
  };
  const clearQueue = async () => {
    const result = await apiPost('/song-requests/clear', {});
    if (!result) { toast.error('Aktion fehlgeschlagen'); return; }
    toast.success('Reihe geleert');
    refetchQueue();
  };

  const pending = (queue ?? []).filter((s) => s.status === 'pending');
  const playingNow = (queue ?? []).find((s) => s.status === 'playing');
  const autoSupported = data?.auto_detect_supported ?? false;
  const autoOn = data?.auto_detect ?? false;
  const song = data?.song ?? null;

  const next = pending.length === 0 ? 'Als Nächstes: noch keine Wünsche' : `Als Nächstes: ${pending.length} ${pending.length === 1 ? 'Wunsch' : 'Wünsche'}`;

  return (
    <div className="panel card-slim">
      <div className="card-now">
        {song ? (
          <>
            <span className="card-now-title">{song.title}</span>
            <span className="card-now-sub">{[song.artist, song.source ? prettySource(song.source) : ''].filter(Boolean).join(' · ')}</span>
          </>
        ) : (
          <span className="card-now-empty">{autoOn ? 'Warte auf Musik …' : 'Gerade läuft nichts'}</span>
        )}
      </div>
      {autoSupported ? (
        <label className="card-check">
          <input type="checkbox" checked={autoOn} onChange={toggleAutoDetect} />
          <span>Automatisch erkennen, was läuft</span>
          {autoOn && data?.auto_detect_running && <span className="card-live-dot" title="hört zu" />}
        </label>
      ) : (
        <div className="card-status"><span>Automatisch erkennen geht nur unter Windows. Hier setzt du den Titel von Hand.</span></div>
      )}
      <div className="card-status"><span>{next}</span></div>
      <div className="card-links">
        <button type="button" className="card-link" onClick={() => setManual(true)}>Titel von Hand setzen</button>
        <button type="button" className="card-link" onClick={() => setShowQueue(true)}>Wünsche verwalten</button>
        {song && <button type="button" className="card-link" onClick={clearSong}>Anzeige leeren</button>}
      </div>

      {manual && (
        <Dialog
          title="Titel von Hand setzen"
          sentence="Überschreibt, was das Overlay zeigt, bis der nächste Song erkannt wird."
          onClose={() => setManual(false)}
          width={560}
          footer={<>
            <button type="button" className="card-secondary" onClick={() => setManual(false)}>Abbrechen</button>
            <button type="button" className="card-primary" onClick={setManualSong} disabled={!manualTitle.trim()}>Übernehmen</button>
          </>}
        >
          <div className="dialog-field">
            <label htmlFor="song-title">Titel</label>
            <input id="song-title" type="text" value={manualTitle} onChange={(e) => setManualTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && setManualSong()} />
          </div>
          <div className="dialog-field">
            <label htmlFor="song-artist">Interpret (optional)</label>
            <input id="song-artist" type="text" value={manualArtist} onChange={(e) => setManualArtist(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && setManualSong()} />
          </div>
        </Dialog>
      )}

      {showQueue && (
        <Dialog
          title="Wünsche verwalten"
          sentence="Was Zuschauer mit !sr gewünscht haben, in der Reihe, wie der Chat sie mit !queue sieht."
          onClose={() => setShowQueue(false)}
          footer={<>
            {pending.length > 0 && <button type="button" className="card-secondary" onClick={clearQueue}>Reihe leeren</button>}
            <button type="button" className="card-primary" onClick={() => setShowQueue(false)}>Fertig</button>
          </>}
        >
          {playingNow && (
            <>
              <h3 className="dialog-section">Läuft gerade</h3>
              <ul className="dialog-list">
                <li>
                  <span className="dialog-list-text">{playingNow.title}{playingNow.artist ? ` – ${playingNow.artist}` : ''} <span className="dialog-hint">von {playingNow.requested_by}</span></span>
                  <a className="card-link" href={playingNow.url} target="_blank" rel="noopener noreferrer">Öffnen</a>
                  <button type="button" className="card-secondary" onClick={() => skipSong(playingNow.id)}>Überspringen</button>
                </li>
              </ul>
            </>
          )}
          <h3 className="dialog-section">Als Nächstes ({pending.length})</h3>
          {pending.length === 0 && <p className="dialog-empty">Keine Wünsche. Zuschauer schreiben !sr und einen Link zu YouTube oder Spotify.</p>}
          <ul className="dialog-list">
            {pending.map((sr, i) => (
              <li key={sr.id}>
                <span className="dialog-list-pos">{i + 1}</span>
                <span className="dialog-list-text">{sr.title}{sr.artist ? ` – ${sr.artist}` : ''} <span className="dialog-hint">von {sr.requested_by} · {sr.source === 'youtube' ? 'YouTube' : 'Spotify'}</span></span>
                <a className="card-link" href={sr.url} target="_blank" rel="noopener noreferrer">Öffnen</a>
                <button type="button" className="card-secondary" onClick={() => playSong(sr.id)}>Abspielen</button>
                <button type="button" className="card-link" onClick={() => skipSong(sr.id)}>Überspringen</button>
                <button type="button" className="card-link" onClick={() => deleteSong(sr.id)}>Löschen</button>
              </li>
            ))}
          </ul>
        </Dialog>
      )}
    </div>
  );
}

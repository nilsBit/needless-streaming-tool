/**
 * A song request from chat is a link to one track on YouTube or Spotify —
 * nothing else. The link is parsed as a URL (not matched somewhere inside a
 * string), the host must be one of the known ones, and what gets stored and
 * shown is a canonical address rebuilt from the track id. A viewer can
 * therefore never smuggle another site into the "Öffnen" link.
 */
export interface SongLink {
  source: 'youtube' | 'spotify';
  id: string;
  url: string;
}

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com']);
const ID = /^[\w-]{6,64}$/;

const youtube = (id: string): SongLink => ({ source: 'youtube', id, url: `https://www.youtube.com/watch?v=${id}` });
const spotify = (id: string): SongLink => ({ source: 'spotify', id, url: `https://open.spotify.com/track/${id}` });

export function parseSongUrl(text: string): SongLink | null {
  let u: URL;
  try {
    u = new URL(text.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase();

  if (host === 'youtu.be') {
    const id = u.pathname.slice(1).split('/')[0];
    return ID.test(id) ? youtube(id) : null;
  }
  if (YOUTUBE_HOSTS.has(host)) {
    if (u.pathname === '/watch') {
      const id = u.searchParams.get('v') ?? '';
      return ID.test(id) ? youtube(id) : null;
    }
    const shorts = /^\/shorts\/([\w-]+)/.exec(u.pathname);
    return shorts && ID.test(shorts[1]) ? youtube(shorts[1]) : null;
  }
  if (host === 'open.spotify.com') {
    const track = /^\/(?:intl-[a-z]{2}\/)?track\/([A-Za-z0-9]+)/.exec(u.pathname);
    return track && ID.test(track[1]) ? spotify(track[1]) : null;
  }
  return null;
}

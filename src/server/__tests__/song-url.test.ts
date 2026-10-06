import { describe, it, expect } from 'vitest';
import { parseSongUrl } from '../song-url';

// A song request is a link to one track on YouTube or Spotify, parsed as a
// URL and rebuilt from its id — never the viewer's raw text.

describe('song links from chat', () => {
  it('accepts the usual YouTube and Spotify shapes and rebuilds a canonical address', () => {
    expect(parseSongUrl('https://youtu.be/dQw4w9WgXcQ')).toEqual({ source: 'youtube', id: 'dQw4w9WgXcQ', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
    expect(parseSongUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s&list=PL123')?.url).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(parseSongUrl('https://music.youtube.com/watch?v=dQw4w9WgXcQ')?.source).toBe('youtube');
    expect(parseSongUrl('https://youtube.com/shorts/abcDEF123_-')?.id).toBe('abcDEF123_-');
    expect(parseSongUrl('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=xyz')).toEqual({ source: 'spotify', id: '4uLU6hMCjMI75M1A2tKUQC', url: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC' });
    expect(parseSongUrl('https://open.spotify.com/intl-de/track/4uLU6hMCjMI75M1A2tKUQC')?.source).toBe('spotify');
  });

  it('refuses anything that only mentions YouTube somewhere, other hosts and other schemes', () => {
    expect(parseSongUrl('https://evil.example/#youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(parseSongUrl('https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(parseSongUrl('javascript:alert(1)//youtu.be/dQw4w9WgXcQ')).toBeNull();
    expect(parseSongUrl('https://www.youtube.com/channel/UCabc')).toBeNull();
    expect(parseSongUrl('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M')).toBeNull();
    expect(parseSongUrl('dQw4w9WgXcQ')).toBeNull();
    expect(parseSongUrl('')).toBeNull();
  });
});

import React, { useState } from 'react';
import { useApi, apiPost, apiDelete } from '../hooks/useApi';
import { Clip } from '../../../shared/types';
import { useWebSocket } from '../hooks/useWebSocket';

const PRESET_TAGS = ['highlight', 'fail', 'funny', 'tutorial', 'bug'];

const TAG_EMOJI: Record<string, string> = {
  highlight: '⭐',
  fail: '💀',
  funny: '😂',
  tutorial: '📚',
  bug: '🐛',
};

export default function ClipsPanel() {
  const today = new Date().toISOString().split('T')[0];
  const { data: clips, refetch } = useApi<Clip[]>(`/clips?session_date=${today}`);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [selectedTag, setSelectedTag] = useState('highlight');

  useWebSocket((event) => {
    if (event.startsWith('clip-')) refetch();
  });

  const addClip = async (tag: string) => {
    await apiPost('/clips', { tag, note: note || undefined });
    setNote('');
    refetch();
  };

  const deleteClip = async (id: number) => {
    await apiDelete(`/clips/${id}`);
    refetch();
  };

  const filtered = activeFilter
    ? clips?.filter((c) => c.tag === activeFilter)
    : clips;

  return (
    <div className="panel clips-panel">
      <h2>🎬 Clip Moments</h2>
      <p className="panel-desc">Session: {today}</p>

      <div className="clip-tags">
        {PRESET_TAGS.map((tag) => (
          <button
            key={tag}
            className={`tag-btn ${activeFilter === tag ? 'active' : ''}`}
            onClick={() => setActiveFilter(activeFilter === tag ? null : tag)}
          >
            {TAG_EMOJI[tag] || '🏷️'} {tag}
          </button>
        ))}
      </div>

      <div className="clip-custom">
        <select value={selectedTag} onChange={(e) => setSelectedTag(e.target.value)}>
          {PRESET_TAGS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input
          type="text"
          placeholder="Notiz (optional)..."
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button onClick={() => addClip(selectedTag)}>+ Clip</button>
      </div>

      <div className="clip-list">
        {(!filtered || filtered.length === 0) && <p className="empty">Keine Clips heute</p>}
        {filtered?.map((clip) => (
          <div key={clip.id} className="clip-item">
            <span className="clip-time">{new Date(clip.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
            <span className="clip-tag">{TAG_EMOJI[clip.tag] || '🏷️'} {clip.tag}</span>
            {clip.note && <span className="clip-note">{clip.note}</span>}
            <button className="btn-delete-small" onClick={() => deleteClip(clip.id)}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

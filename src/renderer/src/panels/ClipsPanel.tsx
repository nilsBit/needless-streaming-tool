import React, { useState } from 'react';
import { useApi, apiPost, apiDelete, getApiToken } from '../hooks/useApi';
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

interface SessionInfo {
  session_date: string;
  count: number;
}

export default function ClipsPanel() {
  const today = new Date().toISOString().split('T')[0];
  const { data: sessions, refetch: refetchSessions } = useApi<SessionInfo[]>('/clips/sessions');
  const { data: allClips, refetch: refetchClips } = useApi<Clip[]>('/clips');
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [selectedTag, setSelectedTag] = useState('highlight');
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set());

  useWebSocket((event) => {
    if (event.startsWith('clip-')) { refetchClips(); refetchSessions(); }
  });

  const addClip = async (tag: string) => {
    await apiPost('/clips', { tag, note: note || undefined });
    setNote('');
    refetchClips();
    refetchSessions();
  };

  const deleteClip = async (id: number) => {
    await apiDelete(`/clips/${id}`);
    refetchClips();
    refetchSessions();
  };

  const exportDay = (sessionDate: string) => {
    const token = getApiToken();
    window.open(`http://localhost:4000/api/clips/export?session_date=${sessionDate}&token=${token}`, '_blank');
  };

  const toggleDay = (date: string) => {
    const next = new Set(collapsedDays);
    if (next.has(date)) next.delete(date);
    else next.add(date);
    setCollapsedDays(next);
  };

  // Group clips by session_date
  const clipsByDay = new Map<string, Clip[]>();
  if (allClips) {
    for (const clip of allClips) {
      const list = clipsByDay.get(clip.session_date) || [];
      list.push(clip);
      clipsByDay.set(clip.session_date, list);
    }
  }

  // Sort days descending (newest first)
  const sortedDays = Array.from(clipsByDay.keys()).sort((a, b) => b.localeCompare(a));

  const filterClips = (clips: Clip[]) =>
    activeFilter ? clips.filter((c) => c.tag === activeFilter) : clips;

  return (
    <div className="panel clips-panel">
      <h2>🎬 Clip Moments</h2>

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
          onKeyDown={(e) => e.key === 'Enter' && addClip(selectedTag)}
        />
        <button onClick={() => addClip(selectedTag)}>+ Clip</button>
      </div>

      <div className="clip-sessions">
        {sortedDays.length === 0 && <p className="empty">Keine Clips</p>}
        {sortedDays.map((date) => {
          const dayClips = filterClips(clipsByDay.get(date) || []);
          const isToday = date === today;
          const isCollapsed = collapsedDays.has(date);

          return (
            <div key={date} className={`clip-day ${isToday ? 'today' : ''}`}>
              <div className="clip-day-header" onClick={() => toggleDay(date)}>
                <span className="day-toggle">{isCollapsed ? '▶' : '▼'}</span>
                <span className="day-date">{isToday ? `Heute (${date})` : date}</span>
                <span className="day-count">{dayClips.length} Clips</span>
                <button className="btn-export" onClick={(e) => { e.stopPropagation(); exportDay(date); }}>📥 DaVinci</button>
              </div>

              {!isCollapsed && (
                <div className="clip-list">
                  {dayClips.length === 0 && <p className="empty">Keine Clips{activeFilter ? ` mit Tag "${activeFilter}"` : ''}</p>}
                  {dayClips.map((clip) => (
                    <div key={clip.id} className="clip-item">
                      <span className="clip-time">{new Date(clip.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                      <span className="clip-tag">{TAG_EMOJI[clip.tag] || '🏷️'} {clip.tag}</span>
                      {clip.note && <span className="clip-note">{clip.note}</span>}
                      <button className="btn-delete-small" onClick={() => deleteClip(clip.id)}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

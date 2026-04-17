import React, { useState } from 'react';
import { useApi, apiPost, apiDelete, getApiToken } from '../hooks/useApi';
import { useTranslation } from '../i18n/LanguageContext';
import { useToast } from '../i18n/ToastContext';

interface SyncResult {
  synced: number;
  failed: number;
  total: number;
}
import { Clip } from '../../../shared/types';
import { useWebSocket } from '../hooks/useWebSocket';

const PRESET_TAGS = ['highlight', 'fail', 'funny', 'tutorial', 'issue'];

const TAG_EMOJI: Record<string, string> = {
  highlight: '⭐',
  fail: '💀',
  funny: '😂',
  tutorial: '📚',
  issue: '⚠️',
};

interface ClipTag {
  tag: string;
  emoji: string;
  preset: boolean;
}

interface SessionInfo {
  session_date: string;
  count: number;
}

export default function ClipsPanel() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const today = new Date().toISOString().split('T')[0];
  const { data: sessions, refetch: refetchSessions } = useApi<SessionInfo[]>('/clips/sessions');
  const { data: allClips, refetch: refetchClips } = useApi<Clip[]>('/clips');
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [selectedTag, setSelectedTag] = useState('highlight');
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set());
  const [syncingDay, setSyncingDay] = useState<string | null>(null);
  const { data: clipTags, refetch: refetchTags } = useApi<ClipTag[]>('/clip-tags');
  const [newTagName, setNewTagName] = useState('');
  const [showNewTagInput, setShowNewTagInput] = useState(false);

  useWebSocket((event) => {
    if (event.startsWith('clip-')) { refetchClips(); refetchSessions(); }
    if (event === 'clip-tags-changed') { refetchTags(); }
  });

  const addClip = async (tag: string) => {
    const result = await apiPost('/clips', { tag, note: note || undefined });
    if (!result) { toast.error(t('error.action_failed')); return; }
    setNote('');
    refetchClips();
    refetchSessions();
  };

  const deleteClip = async (id: number) => {
    const ok = await apiDelete(`/clips/${id}`);
    if (!ok) { toast.error(t('error.action_failed')); return; }
    refetchClips();
    refetchSessions();
  };

  const syncToNotion = async (sessionDate: string) => {
    setSyncingDay(sessionDate);
    const result = await apiPost<SyncResult>('/clips/sync', { session_date: sessionDate });
    if (!result) {
      toast.error(t('error.action_failed'));
    } else {
      console.log(`[Clips] Synced ${result.synced}/${result.total} clips to Notion`);
    }
    setSyncingDay(null);
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

  const addCustomTag = async () => {
    const trimmed = newTagName.trim().toLowerCase();
    if (!trimmed) return;
    const result = await apiPost('/clip-tags', { tag: trimmed });
    if (!result) { toast.error(t('error.action_failed')); return; }
    setNewTagName('');
    setShowNewTagInput(false);
    refetchTags();
  };

  const deleteCustomTag = async (tag: string) => {
    const ok = await apiDelete(`/clip-tags/${tag}`);
    if (!ok) { toast.error(t('error.action_failed')); return; }
    refetchTags();
  };

  const customTags = clipTags?.filter((t) => !t.preset) || [];
  const allTagNames = [...PRESET_TAGS, ...customTags.map((t) => t.tag)];

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

  const formatClipTime = (clip: Clip) => {
    const wallClock = new Date(clip.created_at + 'Z').toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const parts: string[] = [];
    if (clip.stream_timecode) parts.push(`🔴 ${clip.stream_timecode}`);
    if (clip.recording_timecode) parts.push(`⏺ ${clip.recording_timecode}`);
    if (parts.length > 0) return `${parts.join(' ')} | ${wallClock}`;
    return wallClock;
  };

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
        {customTags.map((ct) => (
          <button
            key={ct.tag}
            className={`tag-btn ${activeFilter === ct.tag ? 'active' : ''}`}
            onClick={() => setActiveFilter(activeFilter === ct.tag ? null : ct.tag)}
          >
            🏷️ {ct.tag}
            <span className="tag-delete" onClick={(e) => { e.stopPropagation(); deleteCustomTag(ct.tag); }}>✕</span>
          </button>
        ))}
        {showNewTagInput ? (
          <span className="tag-add-input">
            <input
              type="text"
              placeholder="Tag name..."
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addCustomTag();
                if (e.key === 'Escape') { setShowNewTagInput(false); setNewTagName(''); }
              }}
              autoFocus
            />
            <button onClick={addCustomTag}>✓</button>
          </span>
        ) : (
          <button className="tag-btn tag-add" onClick={() => setShowNewTagInput(true)}>+</button>
        )}
      </div>

      <div className="clip-custom">
        <select value={selectedTag} onChange={(e) => setSelectedTag(e.target.value)}>
          {allTagNames.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input
          type="text"
          placeholder={t('clips.note_placeholder')}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addClip(selectedTag)}
        />
        <button onClick={() => addClip(selectedTag)}>{t('clips.add')}</button>
      </div>

      <div className="clip-sessions">
        {sortedDays.length === 0 && <p className="empty">{t('clips.empty')}</p>}
        {sortedDays.map((date) => {
          const dayClips = filterClips(clipsByDay.get(date) || []);
          const isToday = date === today;
          const isCollapsed = collapsedDays.has(date);

          return (
            <div key={date} className={`clip-day ${isToday ? 'today' : ''}`}>
              <div className="clip-day-header" onClick={() => toggleDay(date)}>
                <span className="day-toggle">{isCollapsed ? '▶' : '▼'}</span>
                <span className="day-date">{isToday ? `${t('clips.today')} (${date})` : date}</span>
                <span className="day-count">{dayClips.length} Clips</span>
                <button className="btn-export" onClick={(e) => { e.stopPropagation(); syncToNotion(date); }} disabled={syncingDay === date}>
                  {syncingDay === date ? '⏳' : '📤'} Notion
                </button>
                <button className="btn-export" onClick={(e) => { e.stopPropagation(); exportDay(date); }}>📥 DaVinci</button>
              </div>

              {!isCollapsed && (
                <div className="clip-list">
                  {dayClips.length === 0 && <p className="empty">{activeFilter ? `${t('clips.empty')} ${t('clips.with_tag')} "${activeFilter}"` : t('clips.empty')}</p>}
                  {dayClips.map((clip) => (
                    <div key={clip.id} className="clip-item">
                      <span className="clip-time">{formatClipTime(clip)}</span>
                      <span className="clip-tag">{TAG_EMOJI[clip.tag] || '🏷️'} {clip.tag}</span>
                      {clip.note && <span className="clip-note">{clip.note}</span>}
                      <button className="btn-delete-small" title={t('tooltip.delete')} onClick={() => deleteClip(clip.id)}>✕</button>
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

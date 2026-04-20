import React, { useState } from 'react';
import { useApi, apiPost, apiDelete, apiPatch, getApiToken } from '../hooks/useApi';
import { useTranslation } from '../i18n/LanguageContext';
import { useToast } from '../i18n/ToastContext';
import ClipSyncBadge, { SyncState } from '../components/ClipSyncBadge';

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
  const { data: dbInfo } = useApi<{ configured: boolean }>('/settings/notion/database');
  const { data: autoSyncRaw, refetch: refetchAutoSync } = useApi<{ value: string | null }>('/settings/get/notion_auto_sync');
  const notionConfigured = !!dbInfo?.configured;
  const autoSync = autoSyncRaw?.value === 'true';
  const [failedIds, setFailedIds] = useState<Set<number>>(new Set());

  useWebSocket((event, data) => {
    if (event.startsWith('clip-')) { refetchClips(); refetchSessions(); }
    if (event === 'clip-tags-changed') { refetchTags(); }
    if (event === 'clip-sync-failed' && data && typeof data === 'object' && 'id' in data) {
      setFailedIds((prev) => new Set(prev).add((data as { id: number }).id));
    }
    if (event === 'clip-updated' && data && typeof data === 'object' && 'id' in data) {
      setFailedIds((prev) => { const n = new Set(prev); n.delete((data as { id: number }).id); return n; });
    }
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

  const toggleAutoSync = async () => {
    const next = autoSync ? 'false' : 'true';
    await apiPost('/settings/set', { key: 'notion_auto_sync', value: next });
    refetchAutoSync();
  };

  const retryClip = async (id: number) => {
    setFailedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
    const clip = allClips?.find((c) => c.id === id);
    if (clip) syncToNotion(clip.session_date);
  };

  const syncStateFor = (clip: Clip): SyncState => {
    if (!notionConfigured) return 'disabled';
    if (clip.notion_page_id) return 'synced';
    if (failedIds.has(clip.id)) return 'failed';
    return 'pending';
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

  const filterClips = (clips: Clip[]) => {
    if (!activeFilter) return clips;
    if (activeFilter === 'auto') return clips.filter((c) => c.tag.startsWith('auto-'));
    return clips.filter((c) => c.tag === activeFilter);
  };

  const isAutoClip = (clip: Clip) => clip.tag.startsWith('auto-');

  const confirmClip = async (clip: Clip) => {
    const newTag = clip.tag.replace('auto-', '');
    const result = await apiPatch(`/clips/${clip.id}`, { tag: newTag || 'highlight' });
    if (!result) { toast.error(t('error.action_failed')); return; }
    refetchClips();
  };

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
      <div className="clips-panel-header">
        <h2>🎬 Clip Moments</h2>
        {notionConfigured && (
          <button className={`auto-sync-toggle ${autoSync ? 'on' : 'off'}`} onClick={toggleAutoSync} title={t('clips.auto_sync_label')}>
            ☁️ {t('clips.auto_sync_label')}: {autoSync ? t('clips.auto_sync_on') : t('clips.auto_sync_off')}
          </button>
        )}
      </div>

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
        <button
          key="auto"
          className={`tag-btn ${activeFilter === 'auto' ? 'active' : ''}`}
          onClick={() => setActiveFilter(activeFilter === 'auto' ? null : 'auto')}
        >
          🤖 Auto
        </button>
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
                <span className="day-breakdown">
                  {Array.from(
                    (clipsByDay.get(date) || []).reduce((m, c) => {
                      const key = c.tag.startsWith('auto-') ? c.tag.replace('auto-', '') : c.tag;
                      m.set(key, (m.get(key) || 0) + 1);
                      return m;
                    }, new Map<string, number>()).entries()
                  ).map(([tag, count]) => (
                    <span key={tag} className="tag-chip">{TAG_EMOJI[tag] || '🏷️'}{count}</span>
                  ))}
                </span>
                <span className="day-count">{dayClips.length} Clips</span>
                {notionConfigured && (
                  <button className="btn-export" onClick={(e) => { e.stopPropagation(); syncToNotion(date); }} disabled={syncingDay === date}>
                    {syncingDay === date ? '⏳' : '📤'} {t('clips.re_sync')}
                  </button>
                )}
                <button className="btn-export" onClick={(e) => { e.stopPropagation(); exportDay(date); }}>📥 DaVinci</button>
              </div>

              {!isCollapsed && (
                <div className="clip-list">
                  {dayClips.length === 0 && <p className="empty">{activeFilter ? `${t('clips.empty')} ${t('clips.with_tag')} "${activeFilter}"` : t('clips.empty')}</p>}
                  {dayClips.map((clip) => (
                    <div key={clip.id} className={`clip-item ${isAutoClip(clip) ? 'auto-clip' : ''}`}>
                      <div className="clip-row-top">
                        <span className="clip-time">{formatClipTime(clip)}</span>
                        <ClipSyncBadge state={syncStateFor(clip)} onRetry={() => retryClip(clip.id)} />
                      </div>
                      <div className="clip-row-mid">
                        <span className="clip-tag">
                          {isAutoClip(clip) && '🤖 '}
                          {TAG_EMOJI[clip.tag.replace('auto-', '')] || '🏷️'} {clip.tag}
                          {clip.confidence && (
                            <span className={`confidence-dot ${clip.confidence}`} title={clip.confidence}>
                              {clip.confidence === 'high' ? '🟢' : '🟡'}
                            </span>
                          )}
                        </span>
                        {isAutoClip(clip) ? (
                          <div className="auto-clip-actions">
                            <button className="btn-confirm-small" onClick={() => confirmClip(clip)} title={t('auto_clips.confirm')}>✓</button>
                            <button className="btn-delete-small" onClick={() => deleteClip(clip.id)} title={t('auto_clips.reject')}>✕</button>
                          </div>
                        ) : (
                          <button className="btn-delete-small" onClick={() => deleteClip(clip.id)} title={t('tooltip.delete')}>✕</button>
                        )}
                      </div>
                      {clip.note && <div className="clip-row-note">"{clip.note}"</div>}
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

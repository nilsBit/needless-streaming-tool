import React, { useState, useRef } from 'react';
import { useApi, apiPost, apiDelete, apiPatch, getApiToken } from '../hooks/useApi';
import { useTranslation } from '../i18n/LanguageContext';
import { useToast } from '../i18n/ToastContext';
import ClipSyncBadge, { SyncState } from '../components/ClipSyncBadge';
import GuidedTour, { TourStep } from '../components/ux/GuidedTour';
import { useFirstTouch } from '../components/ux/useFirstTouch';
import { celebrate } from '../components/ux/celebrate';
import NotionSetupModal from '../components/NotionSetupModal';

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
  const tourComplete = useFirstTouch('clips.tour_completed');
  const [tourActive, setTourActive] = useState(false);
  const [tourEvent, setTourEvent] = useState<string | null>(null);
  const [notionModalOpen, setNotionModalOpen] = useState(false);
  const autoSyncToggleRef = useRef<HTMLButtonElement>(null);

  const tourSteps: TourStep[] = [
    { targetSelector: '.clips-panel-header', title: t('tour.clips.step1_title'), text: t('tour.clips.step1_text'), waitFor: 'tour-acknowledged', tooltipPosition: 'bottom' },
    { targetSelector: '.clip-custom select', title: t('tour.clips.step2_title'), text: t('tour.clips.step2_text'), waitFor: 'tag-selected', tooltipPosition: 'bottom' },
    { targetSelector: '.clip-custom input', title: t('tour.clips.step3_title'), text: t('tour.clips.step3_text'), waitFor: 'clip-created', tooltipPosition: 'bottom' },
    { targetSelector: '.clip-tags .tag-btn', title: t('tour.clips.step4_title'), text: t('tour.clips.step4_text'), waitFor: 'tag-filtered', tooltipPosition: 'bottom' },
    { targetSelector: '.clip-tags .tag-add', title: t('tour.clips.step5_title'), text: t('tour.clips.step5_text'), waitFor: 'tag-add-clicked', tooltipPosition: 'left' },
    { targetSelector: '.clip-tags .tag-add-input input', title: t('tour.clips.step6_title'), text: t('tour.clips.step6_text'), waitFor: 'custom-tag-created', tooltipPosition: 'bottom' },
  ];

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
    if (tourActive) setTourEvent('clip-created');
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
    if (tourActive) setTourEvent('custom-tag-created');
  };

  const deleteCustomTag = async (tag: string) => {
    const ok = await apiDelete(`/clip-tags/${tag}`);
    if (!ok) { toast.error(t('error.action_failed')); return; }
    refetchTags();
  };

  const toggleAutoSync = async () => {
    if (!notionConfigured) {
      if (!notionModalOpen) setNotionModalOpen(true);
      return;
    }
    const next = autoSync ? 'false' : 'true';
    await apiPost('/settings/set', { key: 'notion_auto_sync', value: next });
    refetchAutoSync();
  };

  const handleNotionSetupComplete = async () => {
    setNotionModalOpen(false);
    await apiPost('/settings/set', { key: 'notion_auto_sync', value: 'true' });
    refetchAutoSync();
    if (autoSyncToggleRef.current) celebrate('success', autoSyncToggleRef.current);
    toast.success('Notion verbunden — Auto-Sync aktiv');
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

  const buildTimecodeTooltip = (clip: Clip): string => {
    const parts: string[] = [];
    const wallClock = new Date(clip.created_at + 'Z').toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    parts.push(`Wall: ${wallClock}`);
    if (clip.stream_timecode) parts.push(`Stream: ${clip.stream_timecode}`);
    if (clip.recording_timecode) parts.push(`Recording: ${clip.recording_timecode}`);
    return parts.join(' | ');
  };

  return (
    <div className="panel clips-panel">
      <div className="clips-panel-header">
        <h2>🎬 Clip Moments</h2>
        {!tourComplete.seen && !tourComplete.loading && (
          <button className="btn-export-small" onClick={() => setTourActive(true)} title={t('tour.start')}>🎯 {t('tour.start')}</button>
        )}
        <button
          ref={autoSyncToggleRef}
          className={`auto-sync-toggle ${notionConfigured && autoSync ? 'on' : 'off'}`}
          onClick={toggleAutoSync}
          title={t('clips.auto_sync_label')}
        >
          ☁️ {t('clips.auto_sync_label')}: {notionConfigured && autoSync ? t('clips.auto_sync_on') : t('clips.auto_sync_off')}
        </button>
      </div>

      <div className="clip-tags">
        {PRESET_TAGS.map((tag) => (
          <button
            key={tag}
            className={`tag-btn ${activeFilter === tag ? 'active' : ''}`}
            onClick={() => { setActiveFilter(activeFilter === tag ? null : tag); if (tourActive) setTourEvent('tag-filtered'); }}
          >
            {TAG_EMOJI[tag] || '🏷️'} {tag}
          </button>
        ))}
        {customTags.map((ct) => (
          <button
            key={ct.tag}
            className={`tag-btn ${activeFilter === ct.tag ? 'active' : ''}`}
            onClick={() => { setActiveFilter(activeFilter === ct.tag ? null : ct.tag); if (tourActive) setTourEvent('tag-filtered'); }}
          >
            🏷️ {ct.tag}
            <span className="tag-delete" onClick={(e) => { e.stopPropagation(); deleteCustomTag(ct.tag); }}>✕</span>
          </button>
        ))}
        <button
          key="auto"
          className={`tag-btn ${activeFilter === 'auto' ? 'active' : ''}`}
          onClick={() => { setActiveFilter(activeFilter === 'auto' ? null : 'auto'); if (tourActive) setTourEvent('tag-filtered'); }}
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
          <button className="tag-btn tag-add" onClick={() => { setShowNewTagInput(true); if (tourActive) setTourEvent('tag-add-clicked'); }}>+</button>
        )}
      </div>

      <div className="clip-custom">
        <select value={selectedTag} onChange={(e) => { setSelectedTag(e.target.value); if (tourActive) setTourEvent('tag-selected'); }}>
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
                    <div key={clip.id} className={`clip-row ${isAutoClip(clip) ? 'auto-clip' : ''}`}>
                      <span className="clip-row-time" title={buildTimecodeTooltip(clip)}>
                        {(() => {
                          const wall = new Date(clip.created_at + 'Z').toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                          const parts: string[] = [];
                          if (clip.stream_timecode) parts.push(`🔴 ${clip.stream_timecode}`);
                          if (clip.recording_timecode) parts.push(`⏺ ${clip.recording_timecode}`);
                          return parts.length === 0 ? wall : `${parts.join(' ')} | ${wall}`;
                        })()}
                      </span>
                      <span className="clip-row-tag">
                        {isAutoClip(clip) && '🤖 '}
                        {TAG_EMOJI[clip.tag.replace('auto-', '')] || '🏷️'} {clip.tag}
                        {clip.confidence && (
                          <span className={`confidence-dot ${clip.confidence}`} title={clip.confidence}>
                            {clip.confidence === 'high' ? '🟢' : '🟡'}
                          </span>
                        )}
                      </span>
                      <span className="clip-row-note">{clip.note && `"${clip.note}"`}</span>
                      <ClipSyncBadge state={syncStateFor(clip)} onRetry={() => retryClip(clip.id)} />
                      {isAutoClip(clip) ? (
                        <>
                          <button className="btn-clip-confirm" onClick={() => confirmClip(clip)} title={t('auto_clips.confirm')}>✓</button>
                          <button className="btn-clip-reject" onClick={() => deleteClip(clip.id)} title={t('auto_clips.reject')}>✕</button>
                        </>
                      ) : (
                        <button className="btn-row-action" onClick={() => deleteClip(clip.id)} title={t('tooltip.delete')}>✕</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {tourActive && (
        <GuidedTour
          steps={tourSteps}
          currentEvent={tourEvent}
          onEventConsumed={() => setTourEvent(null)}
          onComplete={() => {
            setTourActive(false);
            tourComplete.markSeen();
            celebrate('success', null);
            toast.success(t('tour.complete_toast'));
          }}
          onSkip={() => {
            setTourActive(false);
            setTourEvent(null);
          }}
        />
      )}
      <NotionSetupModal
        open={notionModalOpen}
        onClose={() => setNotionModalOpen(false)}
        onComplete={handleNotionSetupComplete}
      />
    </div>
  );
}

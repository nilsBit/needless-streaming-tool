import React, { useState, useEffect } from 'react';
import { useApi, apiPost, apiPatch, apiDelete, getApiToken } from '../hooks/useApi';
import { ProjectItem, StreamState } from '../../../shared/types';
import { useWebSocket } from '../hooks/useWebSocket';
import ChatCommands from '../components/ChatCommands';
import { useTranslation } from '../i18n/LanguageContext';
import { useToast } from '../i18n/ToastContext';

interface ProgressData {
  project_name: string | null;
  items: ProjectItem[];
}

export default function ProgressPanel() {
  const { data, loading, refetch } = useApi<ProgressData>('/progress');
  const [newItem, setNewItem] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [projectName, setProjectName] = useState('');
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: streamState } = useApi<StreamState>('/stream-state');
  const [liveSeconds, setLiveSeconds] = useState(0);

  useWebSocket((event) => {
    if (event.startsWith('progress-')) refetch();
  });

  useEffect(() => {
    if (streamState) setLiveSeconds(streamState.timer_seconds);
  }, [streamState]);

  useEffect(() => {
    if (!streamState?.timer_running) return;
    const interval = setInterval(() => {
      setLiveSeconds(s => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [streamState?.timer_running]);

  const addItem = async () => {
    if (!newItem.trim()) return;
    const result = await apiPost('/progress/items', { title: newItem.trim() });
    if (!result) { toast.error(t('error.action_failed')); return; }
    setNewItem('');
    refetch();
  };

  const cycleStatus = async (item: ProjectItem) => {
    const next = item.status === 'pending' ? 'in_progress' : item.status === 'in_progress' ? 'done' : 'pending';
    const result = await apiPatch(`/progress/items/${item.id}`, {
      status: next,
      current_timer_seconds: liveSeconds,
    });
    if (!result) { toast.error(t('error.action_failed')); return; }
    refetch();
  };

  const deleteItem = async (id: number) => {
    const ok = await apiDelete(`/progress/items/${id}`);
    if (!ok) { toast.error(t('error.action_failed')); return; }
    refetch();
  };

  const saveProjectName = async () => {
    const result = await apiPatch('/progress/project', { project_name: projectName });
    if (!result) { toast.error(t('error.action_failed')); return; }
    setEditingName(false);
    refetch();
  };

  const exportCsv = () => {
    const token = getApiToken();
    window.open(`http://localhost:4000/api/progress/export?token=${token}`, '_blank');
  };

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return t('progress.less_than_minute');
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  if (loading && !data) {
    return <div className="panel"><p className="empty">{t('common.loading')}</p></div>;
  }

  const items = data?.items || [];
  const done = items.filter((i) => i.status === 'done').length;

  const statusEmoji = (s: string) => s === 'done' ? '✅' : s === 'in_progress' ? '🔨' : '⬜';

  return (
    <div className="panel progress-panel">
      <h2>📊 Progress Tracker</h2>

      <div className="progress-header">
        {editingName ? (
          <div className="project-name-edit">
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveProjectName()}
              placeholder={t('progress.project_placeholder')}
            />
            <button onClick={saveProjectName}>💾</button>
          </div>
        ) : (
          <div className="project-name" onClick={() => { setEditingName(true); setProjectName(data?.project_name || ''); }}>
            <strong>{data?.project_name || t('progress.no_project')}</strong> ✏️
          </div>
        )}
        <span className="progress-count">{done}/{items.length} done</span>
        <button className="btn-export-small" onClick={exportCsv} title={t('progress.export_csv')}>📥</button>
      </div>

      <div className="progress-bar-container">
        <div className="progress-bar" style={{ width: items.length > 0 ? `${(done / items.length) * 100}%` : '0%' }} />
      </div>

      <div className="progress-items">
        {items.map((item) => {
          const isActive = item.status === 'in_progress';
          const displayTime = isActive ? item.time_spent + liveSeconds : item.time_spent;
          return (
            <div key={item.id} className={`progress-item status-${item.status}`}>
              <button className="status-toggle" onClick={() => cycleStatus(item)}>{statusEmoji(item.status)}</button>
              <span className="item-title">{item.title}</span>
              {displayTime > 0 && <span className="item-time">{formatTime(displayTime)}</span>}
              <button className="btn-delete-small" onClick={() => deleteItem(item.id)} title={t('tooltip.delete')}>✕</button>
            </div>
          );
        })}
      </div>

      <div className="add-item">
        <input
          type="text"
          placeholder={t('progress.item_placeholder')}
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addItem()}
        />
        <button onClick={addItem}>+</button>
      </div>

      <ChatCommands commands={[
        { cmd: '!progress', desc: t('progress.cmd_progress') },
      ]} />
    </div>
  );
}

import React, { useState } from 'react';
import { useApi, apiPost, apiPatch, apiDelete } from '../hooks/useApi';
import { ProjectItem } from '../../../shared/types';
import { useWebSocket } from '../hooks/useWebSocket';
import ChatCommands from '../components/ChatCommands';
import { useTranslation } from '../i18n/LanguageContext';

interface ProgressData {
  project_name: string | null;
  items: ProjectItem[];
}

export default function ProgressPanel() {
  const { data, refetch } = useApi<ProgressData>('/progress');
  const [newItem, setNewItem] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [projectName, setProjectName] = useState('');
  const { t } = useTranslation();

  useWebSocket((event) => {
    if (event.startsWith('progress-')) refetch();
  });

  const addItem = async () => {
    if (!newItem.trim()) return;
    await apiPost('/progress/items', { title: newItem.trim() });
    setNewItem('');
    refetch();
  };

  const cycleStatus = async (item: ProjectItem) => {
    const next = item.status === 'pending' ? 'in_progress' : item.status === 'in_progress' ? 'done' : 'pending';
    await apiPatch(`/progress/items/${item.id}`, { status: next });
    refetch();
  };

  const deleteItem = async (id: number) => {
    await apiDelete(`/progress/items/${id}`);
    refetch();
  };

  const saveProjectName = async () => {
    await apiPatch('/progress/project', { project_name: projectName });
    setEditingName(false);
    refetch();
  };

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
      </div>

      <div className="progress-bar-container">
        <div className="progress-bar" style={{ width: items.length > 0 ? `${(done / items.length) * 100}%` : '0%' }} />
      </div>

      <div className="progress-items">
        {items.map((item) => (
          <div key={item.id} className={`progress-item status-${item.status}`}>
            <button className="status-toggle" onClick={() => cycleStatus(item)}>{statusEmoji(item.status)}</button>
            <span className="item-title">{item.title}</span>
            <button className="btn-delete-small" onClick={() => deleteItem(item.id)}>✕</button>
          </div>
        ))}
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

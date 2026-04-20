import React, { useState, useEffect } from 'react';
import { useApi, apiPost, apiPatch, apiDelete, getApiToken } from '../hooks/useApi';
import { ProjectItem, StreamState } from '../../../shared/types';
import { useWebSocket } from '../hooks/useWebSocket';
import ChatCommands from '../components/ChatCommands';
import { useTranslation } from '../i18n/LanguageContext';
import { useToast } from '../i18n/ToastContext';
import EmptyState from '../components/ux/EmptyState';

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
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  const [newTodoText, setNewTodoText] = useState<Record<number, string>>({});
  const [focusItemId, setFocusItemId] = useState<number | null>(null);

  useWebSocket((event) => {
    if (event.startsWith('progress-')) refetch();
  });

  // Auto-expand active items that have no sub-todos — guides the user to add some
  useEffect(() => {
    const items = data?.items;
    if (!items) return;
    const emptyActive = items.filter(i => i.status === 'in_progress' && (i.todos || []).length === 0);
    if (emptyActive.length === 0) return;
    setExpandedItems(prev => {
      const next = new Set(prev);
      let changed = false;
      for (const i of emptyActive) {
        if (!next.has(i.id)) { next.add(i.id); changed = true; }
      }
      return changed ? next : prev;
    });
  }, [data?.items]);

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

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return t('progress.less_than_minute');
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

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
    if (next === 'in_progress' && (item.todos || []).length === 0) {
      toast.info(t('progress.subtodo_hint_toast').replace('{title}', item.title));
      setFocusItemId(item.id);
    }
    refetch();
  };

  const deleteItem = async (id: number) => {
    const ok = await apiDelete(`/progress/items/${id}`);
    if (!ok) { toast.error(t('error.action_failed')); return; }
    refetch();
  };

  const toggleExpand = (id: number) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addTodo = async (itemId: number) => {
    const text = newTodoText[itemId]?.trim();
    if (!text) return;
    const result = await apiPost(`/progress/items/${itemId}/todos`, { title: text });
    if (!result) { toast.error(t('error.action_failed')); return; }
    setNewTodoText(prev => ({ ...prev, [itemId]: '' }));
    refetch();
  };

  const toggleTodo = async (todoId: number, currentDone: number) => {
    const result = await apiPatch(`/progress/todos/${todoId}`, { done: currentDone ? 0 : 1 });
    if (!result) { toast.error(t('error.action_failed')); return; }
    refetch();
  };

  const deleteTodo = async (todoId: number) => {
    const ok = await apiDelete(`/progress/todos/${todoId}`);
    if (!ok) { toast.error(t('error.action_failed')); return; }
    refetch();
  };

  const saveProjectName = async () => {
    const result = await apiPatch('/progress/project', { project_name: projectName });
    if (!result) { toast.error(t('error.action_failed')); return; }
    setEditingName(false);
    refetch();
  };

  const seedExamples = async () => {
    const result = await apiPost('/progress/seed-examples', {});
    if (!result) { toast.error(t('progress.seed_error')); return; }
    toast.success(t('progress.seed_success'));
    refetch();
  };

  const exportCsv = () => {
    const token = getApiToken();
    window.open(`http://localhost:4000/api/progress/export?token=${token}`, '_blank');
  };

  // Drag-and-drop handlers
  const handleDragStart = (e: React.DragEvent, itemId: number) => {
    e.dataTransfer.setData('text/plain', String(itemId));
    e.dataTransfer.effectAllowed = 'move';
    (e.target as HTMLElement).classList.add('dragging');
  };

  const handleDragEnd = (e: React.DragEvent) => {
    (e.target as HTMLElement).classList.remove('dragging');
    setDragOverColumn(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnter = (status: string) => {
    setDragOverColumn(status);
  };

  const handleDragLeave = (e: React.DragEvent, status: string) => {
    // Only clear if leaving the column entirely (not entering a child)
    const related = e.relatedTarget as HTMLElement;
    if (!related || !(e.currentTarget as HTMLElement).contains(related)) {
      if (dragOverColumn === status) setDragOverColumn(null);
    }
  };

  const handleDrop = async (targetStatus: string, e: React.DragEvent) => {
    e.preventDefault();
    setDragOverColumn(null);
    const itemId = Number(e.dataTransfer.getData('text/plain'));
    if (!itemId) return;

    const item = items.find(i => i.id === itemId);
    if (!item || item.status === targetStatus) return;

    const result = await apiPatch(`/progress/items/${itemId}`, {
      status: targetStatus,
      current_timer_seconds: liveSeconds,
    });
    if (!result) { toast.error(t('error.action_failed')); return; }
    if (targetStatus === 'in_progress' && (item.todos || []).length === 0) {
      toast.info(t('progress.subtodo_hint_toast').replace('{title}', item.title));
      setFocusItemId(itemId);
    }
    refetch();
  };

  if (loading && !data) {
    return <div className="panel"><p className="empty">{t('common.loading')}</p></div>;
  }

  const items = data?.items || [];
  const backlog = items.filter(i => i.status === 'pending').sort((a, b) => a.sort_order - b.sort_order);
  const inProgress = items.filter(i => i.status === 'in_progress').sort((a, b) => a.sort_order - b.sort_order);
  const done = items.filter(i => i.status === 'done').sort((a, b) => a.sort_order - b.sort_order);
  const doneCount = done.length;

  const statusEmoji = (s: string) => s === 'done' ? '✅' : s === 'in_progress' ? '🔨' : '⬜';

  const renderItem = (item: ProjectItem) => {
    const isActive = item.status === 'in_progress';
    const displayTime = isActive ? item.time_spent + liveSeconds : item.time_spent;
    const isExpanded = expandedItems.has(item.id);
    const todos = item.todos || [];
    const doneTodos = todos.filter(td => td.done);
    const hasTodos = todos.length > 0;

    return (
      <div
        key={item.id}
        className={`kanban-item status-${item.status} ${isExpanded ? 'expanded' : ''}`}
      >
        <div
          className="kanban-item-header"
          draggable
          onDragStart={e => handleDragStart(e, item.id)}
          onDragEnd={handleDragEnd}
        >
          <button className="status-toggle" onClick={e => { e.stopPropagation(); cycleStatus(item); }}>{statusEmoji(item.status)}</button>
          <span className="item-title" onClick={() => toggleExpand(item.id)}>{item.title}</span>
          {hasTodos && <span className="todo-count">{doneTodos.length}/{todos.length} ✓</span>}
          {displayTime > 0 && <span className="item-time">{formatTime(displayTime)}</span>}
          <button className="btn-delete-small" onClick={e => { e.stopPropagation(); deleteItem(item.id); }} title={t('tooltip.delete')}>✕</button>
        </div>
        {isExpanded && (
          <div className="kanban-item-todos">
            {isActive && todos.length === 0 && (
              <div className="sub-todos-hint">📺 {t('progress.subtodo_hint')}</div>
            )}
            {todos.map(td => (
              <div key={td.id} className={`sub-todo ${td.done ? 'done' : ''}`}>
                <button className="sub-todo-check" onClick={() => toggleTodo(td.id, td.done)}>
                  {td.done ? '☑' : '☐'}
                </button>
                <span className="sub-todo-title">{td.title}</span>
                <button className="btn-delete-small" onClick={() => deleteTodo(td.id)} title={t('tooltip.delete')}>✕</button>
              </div>
            ))}
            <div className="sub-todo-add">
              <input
                ref={el => {
                  if (el && focusItemId === item.id) {
                    el.focus();
                    setFocusItemId(null);
                  }
                }}
                type="text"
                placeholder={t('todos.placeholder')}
                value={newTodoText[item.id] || ''}
                onChange={e => setNewTodoText(prev => ({ ...prev, [item.id]: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && addTodo(item.id)}
                onClick={e => e.stopPropagation()}
              />
              <button onClick={() => addTodo(item.id)}>+</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderColumn = (status: string, label: string, emoji: string, columnItems: ProjectItem[]) => (
    <div
      className={`kanban-column ${dragOverColumn === status ? 'drag-over' : ''}`}
      onDragOver={handleDragOver}
      onDragEnter={() => handleDragEnter(status)}
      onDragLeave={e => handleDragLeave(e, status)}
      onDrop={e => handleDrop(status, e)}
    >
      <div className="kanban-column-header">
        <span>{emoji} {label}</span>
        <span className="kanban-count">{columnItems.length}</span>
      </div>
      <div className="kanban-items">
        {columnItems.map(renderItem)}
        {columnItems.length === 0 && (
          <p className="kanban-empty">{t('kanban.drop_here')}</p>
        )}
      </div>
      {status === 'pending' && (
        <div className="kanban-add">
          <input
            type="text"
            placeholder={t('progress.item_placeholder')}
            value={newItem}
            onChange={e => setNewItem(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addItem()}
          />
          <button onClick={addItem}>+</button>
        </div>
      )}
    </div>
  );

  return (
    <div className="panel progress-panel">
      <h2>📊 Progress Tracker</h2>

      <div className="progress-header">
        {editingName ? (
          <div className="project-name-edit">
            <input
              type="text"
              value={projectName}
              onChange={e => setProjectName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveProjectName()}
              placeholder={t('progress.project_placeholder')}
            />
            <button onClick={saveProjectName}>💾</button>
          </div>
        ) : (
          <div className="project-name" onClick={() => { setEditingName(true); setProjectName(data?.project_name || ''); }}>
            <strong>{data?.project_name || t('progress.no_project')}</strong> ✏️
          </div>
        )}
        <span className="progress-count">{doneCount}/{items.length} done</span>
        <button className="btn-export-small" onClick={exportCsv} title={t('progress.export_csv')}>📥</button>
      </div>

      <div className="progress-bar-container">
        <div className="progress-bar" style={{ width: items.length > 0 ? `${(doneCount / items.length) * 100}%` : '0%' }} />
      </div>

      {items.length === 0 ? (
        <>
          <EmptyState
            icon="📋"
            title={t('empty.kanban.title')}
            description={t('empty.kanban.desc')}
            cta={{ label: t('empty.kanban.cta'), onClick: () => {
              const el = document.getElementById('kanban-empty-input');
              if (el instanceof HTMLInputElement) el.focus();
            } }}
            secondaryLeadIn={t('empty.kanban.secondary_lead')}
            secondaryCta={{ label: t('empty.kanban.seed'), onClick: seedExamples }}
          />
          <div className="kanban-add kanban-add-empty">
            <input
              id="kanban-empty-input"
              type="text"
              placeholder={t('progress.item_placeholder')}
              value={newItem}
              onChange={e => setNewItem(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addItem()}
            />
            <button onClick={addItem}>+</button>
          </div>
        </>
      ) : (
        <div className="kanban-board">
          {renderColumn('pending', t('kanban.backlog'), '⬜', backlog)}
          {renderColumn('in_progress', t('kanban.in_progress'), '🔨', inProgress)}
          {renderColumn('done', t('kanban.done'), '✅', done)}
        </div>
      )}

      <ChatCommands commands={[
        { cmd: '!progress', desc: t('progress.cmd_progress') },
      ]} />
    </div>
  );
}

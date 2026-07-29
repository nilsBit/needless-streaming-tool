import React, { useState, useEffect, useRef } from 'react';
import { useApi, apiGet, apiPost, apiPatch, apiDelete, apiFetch, getApiToken, getApiBase } from '../hooks/useApi';
import { ProjectItem, StreamState, Milestone } from '../../../shared/types';
import { useWebSocket } from '../hooks/useWebSocket';
import ChatCommands from '../components/ChatCommands';
import { useToast } from '../contexts/ToastContext';
import EmptyState from '../components/ux/EmptyState';
import TryThisBadge from '../components/ux/TryThisBadge';
import { celebrate } from '../components/ux/celebrate';
import { useFirstTouch } from '../components/ux/useFirstTouch';

const LEVEL_CONFIG_PROGRESS = {
  minor: { emoji: '✨' },
  major: { emoji: '🎉' },
  epic: { emoji: '🏆' },
} as const;

interface ProgressData {
  project_name: string | null;
  items: ProjectItem[];
}

export default function ProgressPanel() {
  const { data, loading, refetch } = useApi<ProgressData>('/progress');
  const [newItem, setNewItem] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [projectName, setProjectName] = useState('');
  const { toast } = useToast();
  const { data: streamState } = useApi<StreamState>('/stream-state');
  const { data: milestones, refetch: refetchMilestones } = useApi<Milestone[]>('/milestones');
  const [liveSeconds, setLiveSeconds] = useState(0);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  const [newTodoText, setNewTodoText] = useState<Record<number, string>>({});
  const [focusItemId, setFocusItemId] = useState<number | null>(null);
  const firstActivate = useFirstTouch('progress.activate_item');
  const firstCheck = useFirstTouch('progress.first_todo_checked');
  const [milestonePickerTodo, setMilestonePickerTodo] = useState<number | null>(null);

  useWebSocket((event) => {
    if (event.startsWith('progress-')) refetch();
    if (event.startsWith('milestone-')) refetchMilestones();
  });

  // Auto-seed 3 example items on first ever panel-mount when board is empty
  // (Trello/Notion-Pattern, see docs/superpowers/specs/2026-04-21-progress-auto-seed-design.md)
  const triedSeedRef = useRef(false);
  useEffect(() => {
    if (loading) return;
    if (!data) return;
    if (data.items.length !== 0) return;
    if (triedSeedRef.current) return;

    triedSeedRef.current = true;

    (async () => {
      const marker = await apiGet<{ value: string | null }>('/settings/get/progress_seeded_v1');
      if (marker?.value === 'true') return;

      const res = await apiFetch('/progress/seed-examples', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      if (res.status === 201) {
        await apiPost('/settings/set', { key: 'progress_seeded_v1', value: 'true' });
        refetch();
      } else if (res.status === 409) {
        // Defensive: items already exist (race), mark as seeded so we don't retry next mount
        await apiPost('/settings/set', { key: 'progress_seeded_v1', value: 'true' });
      } else {
        // Network/server error — silently allow retry on next mount
        triedSeedRef.current = false;
      }
    })();
  }, [loading, data, refetch]);

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
    if (seconds < 60) return '< 1m';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const addItem = async () => {
    if (!newItem.trim()) return;
    const result = await apiPost('/progress/items', { title: newItem.trim() });
    if (!result) { toast.error('Aktion fehlgeschlagen'); return; }
    setNewItem('');
    refetch();
  };

  const cycleStatus = async (item: ProjectItem) => {
    const next = item.status === 'pending' ? 'in_progress' : item.status === 'in_progress' ? 'done' : 'pending';
    const result = await apiPatch(`/progress/items/${item.id}`, {
      status: next,
      current_timer_seconds: liveSeconds,
    });
    if (!result) { toast.error('Aktion fehlgeschlagen'); return; }
    if (next === 'in_progress' && (item.todos || []).length === 0) {
      if (!firstActivate.seen && !firstActivate.loading) {
        toast.info(`💡 Füge Sub-Tasks zu „${item.title}" hinzu — sie erscheinen live im Overlay`);
        firstActivate.markSeen();
      }
      setFocusItemId(item.id);
    }
    refetch();
  };

  const deleteItem = async (id: number) => {
    const ok = await apiDelete(`/progress/items/${id}`);
    if (!ok) { toast.error('Aktion fehlgeschlagen'); return; }
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
    if (!result) { toast.error('Aktion fehlgeschlagen'); return; }
    setNewTodoText(prev => ({ ...prev, [itemId]: '' }));
    refetch();
  };

  const toggleTodo = async (todoId: number, currentDone: number, el?: HTMLElement | null) => {
    const result = await apiPatch(`/progress/todos/${todoId}`, { done: currentDone ? 0 : 1 });
    if (!result) { toast.error('Aktion fehlgeschlagen'); return; }
    if (currentDone === 0 && !firstCheck.seen && !firstCheck.loading) {
      if (el) celebrate('check', el);
      toast.success('Erstes Task erledigt 🎯 — das erscheint live im Overlay.');
      firstCheck.markSeen();
    }
    refetch();
  };

  const deleteTodo = async (todoId: number) => {
    const ok = await apiDelete(`/progress/todos/${todoId}`);
    if (!ok) { toast.error('Aktion fehlgeschlagen'); return; }
    refetch();
  };

  const linkTodoToMilestone = async (todoId: number, milestoneId: number | null) => {
    const result = await apiPatch(`/progress/todos/${todoId}`, { milestone_id: milestoneId });
    if (!result) { toast.error('Aktion fehlgeschlagen'); return; }
    setMilestonePickerTodo(null);
    refetch();
    refetchMilestones();
  };

  const saveProjectName = async () => {
    const result = await apiPatch('/progress/project', { project_name: projectName });
    if (!result) { toast.error('Aktion fehlgeschlagen'); return; }
    setEditingName(false);
    refetch();
  };

  const exportCsv = () => {
    const token = getApiToken();
    window.open(`${getApiBase()}/progress/export?token=${token}`, '_blank');
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
    if (!result) { toast.error('Aktion fehlgeschlagen'); return; }
    if (targetStatus === 'in_progress' && (item.todos || []).length === 0) {
      if (!firstActivate.seen && !firstActivate.loading) {
        toast.info(`💡 Füge Sub-Tasks zu „${item.title}" hinzu — sie erscheinen live im Overlay`);
        firstActivate.markSeen();
      }
      setFocusItemId(itemId);
    }
    refetch();
  };

  if (loading && !data) {
    return <div className="panel"><p className="empty">Laden...</p></div>;
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
          <span className={`item-title ${hasTodos && doneTodos.length === todos.length ? 'all-done' : ''}`} onClick={() => toggleExpand(item.id)}>{item.title}</span>
          {hasTodos && <span className="todo-count">☑ {doneTodos.length}/{todos.length}</span>}
          {displayTime > 0 && <span className="item-time">{formatTime(displayTime)}</span>}
          <button className="btn-delete-small" onClick={e => { e.stopPropagation(); deleteItem(item.id); }} title="Löschen">✕</button>
        </div>
        {hasTodos && (
          <div className="kanban-item-progress">
            <div
              className={`kanban-item-progress-fill ${doneTodos.length === todos.length ? 'full' : ''}`}
              style={{ width: `${(doneTodos.length / todos.length) * 100}%` }}
            />
          </div>
        )}
        {isExpanded && (
          <div className="kanban-item-todos">
            {isActive && todos.length === 0 && (
              <div className="sub-todos-hint">📺 Sub-Tasks erscheinen live im Overlay — füge hier welche hinzu 👇</div>
            )}
            {todos.map(td => {
              const projectMilestones = (milestones || []).filter(
                ms => ms.project_id === item.id && ms.status === 'pending'
              );
              const linkedMs = td.milestone_id
                ? (milestones || []).find(ms => ms.id === td.milestone_id)
                : null;
              const showIcon = linkedMs || projectMilestones.length > 0;

              return (
                <div key={td.id} className={`sub-todo ${td.done ? 'done' : ''}`}>
                  <button
                    className="sub-todo-check"
                    onClick={e => toggleTodo(td.id, td.done, e.currentTarget)}
                  >
                    {td.done ? '☑' : '☐'}
                  </button>
                  <span className="sub-todo-title">{td.title}</span>
                  {showIcon && (
                    <span className="sub-todo-milestone-wrapper">
                      <button
                        className={`sub-todo-milestone ${linkedMs ? 'linked' : 'unlinked'}`}
                        onClick={() => setMilestonePickerTodo(milestonePickerTodo === td.id ? null : td.id)}
                        title={linkedMs ? linkedMs.title : 'Mit Milestone verknüpfen'}
                      >
                        🏆
                      </button>
                      {milestonePickerTodo === td.id && (
                        <div className="milestone-picker">
                          {linkedMs && (
                            <button
                              className="milestone-picker-item unlink"
                              onClick={() => linkTodoToMilestone(td.id, null)}
                            >
                              ✕ Trennen
                            </button>
                          )}
                          {projectMilestones.map(ms => (
                            <button
                              key={ms.id}
                              className={`milestone-picker-item ${td.milestone_id === ms.id ? 'active' : ''}`}
                              onClick={() => linkTodoToMilestone(td.id, ms.id)}
                            >
                              {LEVEL_CONFIG_PROGRESS[ms.level]?.emoji} {ms.title}
                            </button>
                          ))}
                          {projectMilestones.length === 0 && !linkedMs && (
                            <span className="milestone-picker-empty">Keine Milestones für dieses Projekt</span>
                          )}
                        </div>
                      )}
                    </span>
                  )}
                  <button className="btn-delete-small" onClick={() => deleteTodo(td.id)} title="Löschen">✕</button>
                </div>
              );
            })}
            <TryThisBadge hint="Füge hier deine erste Sub-Task hinzu" done={!isActive || todos.length > 0}>
              <div className="sub-todo-add">
                <input
                  ref={el => {
                    if (el && focusItemId === item.id) {
                      el.focus();
                      setFocusItemId(null);
                    }
                  }}
                  type="text"
                  placeholder="Neues Todo..."
                  value={newTodoText[item.id] || ''}
                  onChange={e => setNewTodoText(prev => ({ ...prev, [item.id]: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && addTodo(item.id)}
                  onClick={e => e.stopPropagation()}
                />
                <button onClick={() => addTodo(item.id)}>+</button>
              </div>
            </TryThisBadge>
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
          <p className="kanban-empty">Hierher ziehen</p>
        )}
      </div>
      {status === 'pending' && (
        <div className="kanban-add">
          <input
            type="text"
            placeholder="Neues Item..."
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
              placeholder="Projektname..."
            />
            <button onClick={saveProjectName}>💾</button>
          </div>
        ) : (
          <div className="project-name" onClick={() => { setEditingName(true); setProjectName(data?.project_name || ''); }}>
            <strong>{data?.project_name || 'Kein Projekt'}</strong> ✏️
          </div>
        )}
        <span className="progress-count">{doneCount}/{items.length} done</span>
        <button className="btn-export-small" onClick={exportCsv} title="CSV Export">📥</button>
      </div>

      <div className="progress-bar-container">
        <div className="progress-bar" style={{ width: items.length > 0 ? `${(doneCount / items.length) * 100}%` : '0%' }} />
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon="📋"
          title="Dein Kanban ist leer"
          description="Features und Tasks, die du streamst, verwaltest du hier. Fang klein an."
          inlineInput={{
            value: newItem,
            onChange: setNewItem,
            onSubmit: addItem,
            placeholder: 'Neues Item...',
          }}
        />
      ) : (
        <div className="kanban-board">
          {renderColumn('pending', 'Backlog', '⬜', backlog)}
          {renderColumn('in_progress', 'Aktiv', '🔨', inProgress)}
          {renderColumn('done', 'Erledigt', '✅', done)}
        </div>
      )}

      <ChatCommands commands={[
        { cmd: '!progress', desc: 'Zeigt Projektfortschritt' },
      ]} />
    </div>
  );
}

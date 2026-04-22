import React, { useState, useEffect, useRef } from 'react';
import { useApi, apiGet, apiPost, apiPatch, apiDelete, apiFetch, getApiToken } from '../hooks/useApi';
import { ProjectItem, StreamState, Milestone } from '../../../shared/types';
import { useWebSocket } from '../hooks/useWebSocket';
import ChatCommands from '../components/ChatCommands';
import { useTranslation } from '../i18n/LanguageContext';
import { useToast } from '../i18n/ToastContext';
import EmptyState from '../components/ux/EmptyState';
import TryThisBadge from '../components/ux/TryThisBadge';
import { celebrate } from '../components/ux/celebrate';
import { useFirstTouch } from '../components/ux/useFirstTouch';
import GuidedTour, { TourStep } from '../components/ux/GuidedTour';

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
  const { t } = useTranslation();
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
  const tourComplete = useFirstTouch('progress.tour_completed');
  const [tourActive, setTourActive] = useState(false);
  const [tourEvent, setTourEvent] = useState<string | null>(null);
  const [milestonePickerTodo, setMilestonePickerTodo] = useState<number | null>(null);

  const tourSteps: TourStep[] = [
    { targetSelector: '.kanban-board', title: t('tour.progress.step1_title'), text: t('tour.progress.step1_text'), waitFor: 'tour-acknowledged', tooltipPosition: 'bottom' },
    { targetSelector: '.kanban-column:first-child .kanban-add input', title: t('tour.progress.step2_title'), text: t('tour.progress.step2_text'), waitFor: 'item-created', tooltipPosition: 'top' },
    { targetSelector: '.kanban-column:first-child .kanban-item:last-child .status-toggle', title: t('tour.progress.step3_title'), text: t('tour.progress.step3_text'), waitFor: 'item-activated', tooltipPosition: 'right' },
    { targetSelector: '.kanban-item.expanded .sub-todo-add input', title: t('tour.progress.step4_title'), text: t('tour.progress.step4_text'), waitFor: 'todo-created', tooltipPosition: 'top' },
    { targetSelector: '.kanban-item.expanded .sub-todo-check', title: t('tour.progress.step5_title'), text: t('tour.progress.step5_text'), waitFor: 'todo-checked', tooltipPosition: 'right' },
  ];

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
    if (tourActive) setTourEvent('item-created');
  };

  const cycleStatus = async (item: ProjectItem) => {
    const next = item.status === 'pending' ? 'in_progress' : item.status === 'in_progress' ? 'done' : 'pending';
    const result = await apiPatch(`/progress/items/${item.id}`, {
      status: next,
      current_timer_seconds: liveSeconds,
    });
    if (!result) { toast.error(t('error.action_failed')); return; }
    if (tourActive && next === 'in_progress') setTourEvent('item-activated');
    if (next === 'in_progress' && (item.todos || []).length === 0) {
      if (!firstActivate.seen && !firstActivate.loading) {
        toast.info(t('progress.subtodo_hint_toast').replace('{title}', item.title));
        firstActivate.markSeen();
      }
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
    if (tourActive) setTourEvent('todo-created');
  };

  const toggleTodo = async (todoId: number, currentDone: number, el?: HTMLElement | null) => {
    const result = await apiPatch(`/progress/todos/${todoId}`, { done: currentDone ? 0 : 1 });
    if (!result) { toast.error(t('error.action_failed')); return; }
    if (tourActive && currentDone === 0) setTourEvent('todo-checked');
    if (currentDone === 0 && !firstCheck.seen && !firstCheck.loading) {
      if (el) celebrate('check', el);
      toast.success(t('celebrate.first_todo_done'));
      firstCheck.markSeen();
    }
    refetch();
  };

  const deleteTodo = async (todoId: number) => {
    const ok = await apiDelete(`/progress/todos/${todoId}`);
    if (!ok) { toast.error(t('error.action_failed')); return; }
    refetch();
  };

  const linkTodoToMilestone = async (todoId: number, milestoneId: number | null) => {
    const result = await apiPatch(`/progress/todos/${todoId}`, { milestone_id: milestoneId });
    if (!result) { toast.error(t('error.action_failed')); return; }
    setMilestonePickerTodo(null);
    refetch();
    refetchMilestones();
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
    if (tourActive && targetStatus === 'in_progress') setTourEvent('item-activated');
    if (targetStatus === 'in_progress' && (item.todos || []).length === 0) {
      if (!firstActivate.seen && !firstActivate.loading) {
        toast.info(t('progress.subtodo_hint_toast').replace('{title}', item.title));
        firstActivate.markSeen();
      }
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
          <span className={`item-title ${hasTodos && doneTodos.length === todos.length ? 'all-done' : ''}`} onClick={() => toggleExpand(item.id)}>{item.title}</span>
          {hasTodos && <span className="todo-count">☑ {doneTodos.length}/{todos.length}</span>}
          {displayTime > 0 && <span className="item-time">{formatTime(displayTime)}</span>}
          <button className="btn-delete-small" onClick={e => { e.stopPropagation(); deleteItem(item.id); }} title={t('tooltip.delete')}>✕</button>
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
              <div className="sub-todos-hint">📺 {t('progress.subtodo_hint')}</div>
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
                  <button className="btn-delete-small" onClick={() => deleteTodo(td.id)} title={t('tooltip.delete')}>✕</button>
                </div>
              );
            })}
            <TryThisBadge hint={t('try_this.add_subtodo')} done={!isActive || todos.length > 0}>
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
        {!tourComplete.seen && !tourComplete.loading && (
          <button className="btn-export-small" onClick={() => setTourActive(true)} title={t('tour.start')}>🎯 {t('tour.start')}</button>
        )}
      </div>

      <div className="progress-bar-container">
        <div className="progress-bar" style={{ width: items.length > 0 ? `${(doneCount / items.length) * 100}%` : '0%' }} />
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon="📋"
          title={t('empty.kanban.title')}
          description={t('empty.kanban.desc')}
          inlineInput={{
            value: newItem,
            onChange: setNewItem,
            onSubmit: addItem,
            placeholder: t('progress.item_placeholder'),
          }}
        />
      ) : (
        <div className="kanban-board">
          {renderColumn('pending', t('kanban.backlog'), '⬜', backlog)}
          {renderColumn('in_progress', t('kanban.in_progress'), '🔨', inProgress)}
          {renderColumn('done', t('kanban.done'), '✅', done)}
        </div>
      )}

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

      <ChatCommands commands={[
        { cmd: '!progress', desc: t('progress.cmd_progress') },
      ]} />
    </div>
  );
}

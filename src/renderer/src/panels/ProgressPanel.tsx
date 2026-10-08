import React, { useState, useEffect, useRef } from 'react';
import { useApi, apiPost, apiPatch, apiDelete, apiDownload } from '../hooks/useApi';
import { ProjectItem, StreamState, Milestone } from '../../../shared/types';
import { useWebSocket } from '../hooks/useWebSocket';
import { useVisibleInterval } from '../hooks/useVisibleInterval';
import { useToast } from '../contexts/ToastContext';
import { celebrate } from '../components/ux/celebrate';
import Dialog from '../components/ux/Dialog';

const LEVEL_WORD: Record<Milestone['level'], string> = { minor: 'klein', major: 'groß', epic: 'episch' };

interface ProgressData {
  project_name: string | null;
  items: ProjectItem[];
}

// "Fortschritt" on "Im Stream": the project, its bar, and the tasks of what
// is active right now — tick them off here. The whole board (backlog, active,
// done, drag & drop, milestones, export) sits behind "Aufgaben bearbeiten".
export default function ProgressPanel() {
  const { data, loading, refetch } = useApi<ProgressData>('/progress');
  const { toast } = useToast();
  const { data: streamState } = useApi<StreamState>('/stream-state');
  const { data: milestones, refetch: refetchMilestones } = useApi<Milestone[]>('/milestones');
  const [newItem, setNewItem] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [liveSeconds, setLiveSeconds] = useState(0);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [newTodoText, setNewTodoText] = useState<Record<number, string>>({});
  const [milestonePickerTodo, setMilestonePickerTodo] = useState<number | null>(null);
  const [board, setBoard] = useState(false);

  useWebSocket((event) => {
    if (event.startsWith('progress-')) refetch();
    if (event.startsWith('milestone-')) refetchMilestones();
  });

  // The time shows minutes, so it is worked out from when the server's count
  // was read, every 15 s and on show — not counted up every second, which
  // re-rendered the whole board each second, also hidden (08.10.).
  const readAt = useRef(Date.now());
  useEffect(() => {
    if (!streamState) return;
    readAt.current = Date.now();
    setLiveSeconds(streamState.timer_seconds);
  }, [streamState]);
  useVisibleInterval(() => {
    if (!streamState) return;
    setLiveSeconds(streamState.timer_seconds + Math.floor((Date.now() - readAt.current) / 1000));
  }, 15_000, !!streamState?.timer_running);

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return '< 1 min';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h} h ${m} min` : `${m} min`;
  };

  const addItem = async () => {
    if (!newItem.trim()) return;
    const result = await apiPost('/progress/items', { title: newItem.trim() });
    if (!result) { toast.error('Punkt nicht gespeichert'); return; }
    setNewItem('');
    refetch();
  };
  const setStatus = async (item: ProjectItem, status: string) => {
    if (item.status === status) return;
    const result = await apiPatch(`/progress/items/${item.id}`, { status, current_timer_seconds: liveSeconds });
    if (!result) { toast.error('Aktion fehlgeschlagen'); return; }
    refetch();
  };
  const deleteItem = async (id: number) => {
    const ok = await apiDelete(`/progress/items/${id}`);
    if (!ok) { toast.error('Aktion fehlgeschlagen'); return; }
    refetch();
  };
  const addTodo = async (itemId: number) => {
    const text = newTodoText[itemId]?.trim();
    if (!text) return;
    const result = await apiPost(`/progress/items/${itemId}/todos`, { title: text });
    if (!result) { toast.error('Aufgabe nicht gespeichert'); return; }
    setNewTodoText((prev) => ({ ...prev, [itemId]: '' }));
    refetch();
  };
  const toggleTodo = async (todoId: number, currentDone: number, el?: HTMLElement | null) => {
    const result = await apiPatch(`/progress/todos/${todoId}`, { done: currentDone ? 0 : 1 });
    if (!result) { toast.error('Aktion fehlgeschlagen'); return; }
    if (currentDone === 0 && el) celebrate('check', el);
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
    if (!result) { toast.error('Name nicht gespeichert'); return; }
    setEditingName(false);
    refetch();
  };
  const exportCsv = () => {
    void apiDownload('/progress/export', 'fortschritt.csv');
  };

  // Drag & drop between the three columns of the board.
  const handleDragStart = (e: React.DragEvent, itemId: number) => {
    e.dataTransfer.setData('text/plain', String(itemId));
    e.dataTransfer.effectAllowed = 'move';
    (e.target as HTMLElement).classList.add('dragging');
  };
  const handleDragEnd = (e: React.DragEvent) => {
    (e.target as HTMLElement).classList.remove('dragging');
    setDragOverColumn(null);
  };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
  const handleDragLeave = (e: React.DragEvent, status: string) => {
    const related = e.relatedTarget as HTMLElement;
    if (!related || !(e.currentTarget as HTMLElement).contains(related)) {
      if (dragOverColumn === status) setDragOverColumn(null);
    }
  };
  const handleDrop = async (targetStatus: string, e: React.DragEvent) => {
    e.preventDefault();
    setDragOverColumn(null);
    const itemId = Number(e.dataTransfer.getData('text/plain'));
    const item = items.find((i) => i.id === itemId);
    if (!item) return;
    await setStatus(item, targetStatus);
  };

  if (loading && !data) return <div className="panel"><p className="empty">Laden …</p></div>;

  const items = data?.items ?? [];
  const bySort = (a: ProjectItem, b: ProjectItem) => a.sort_order - b.sort_order;
  const backlog = items.filter((i) => i.status === 'pending').sort(bySort);
  const inProgress = items.filter((i) => i.status === 'in_progress').sort(bySort);
  const done = items.filter((i) => i.status === 'done').sort(bySort);
  const pct = items.length > 0 ? (done.length / items.length) * 100 : 0;

  const renderTodos = (item: ProjectItem, withMilestones: boolean) => {
    const todos = item.todos ?? [];
    return (
      <ul className="card-todos">
        {todos.map((td) => {
          const projectMilestones = (milestones ?? []).filter((ms) => ms.project_id === item.id && ms.status === 'pending');
          const linked = td.milestone_id ? (milestones ?? []).find((ms) => ms.id === td.milestone_id) : null;
          return (
            <li key={td.id} className={td.done ? 'done' : ''}>
              <label className="card-todo">
                <input type="checkbox" checked={!!td.done} onChange={(e) => toggleTodo(td.id, td.done, e.currentTarget)} />
                <span>{td.title}</span>
              </label>
              {withMilestones && (
                <span className="card-todo-tools">
                  {linked && <span className="dialog-hint">Meilenstein: {linked.title}</span>}
                  {(linked || projectMilestones.length > 0) && (
                    <button type="button" className="card-link" onClick={() => setMilestonePickerTodo(milestonePickerTodo === td.id ? null : td.id)}>
                      {linked ? 'Meilenstein ändern' : 'Meilenstein'}
                    </button>
                  )}
                  <button type="button" className="card-link" onClick={() => deleteTodo(td.id)}>Löschen</button>
                </span>
              )}
              {withMilestones && milestonePickerTodo === td.id && (
                <div className="card-picker">
                  {linked && <button type="button" className="card-link" onClick={() => linkTodoToMilestone(td.id, null)}>Vom Meilenstein lösen</button>}
                  {projectMilestones.map((ms) => (
                    <button key={ms.id} type="button" className={`card-secondary ${td.milestone_id === ms.id ? 'active' : ''}`} onClick={() => linkTodoToMilestone(td.id, ms.id)}>
                      {ms.title} ({LEVEL_WORD[ms.level]})
                    </button>
                  ))}
                  {projectMilestones.length === 0 && !linked && <span className="dialog-hint">Kein offener Meilenstein für diesen Punkt.</span>}
                </div>
              )}
            </li>
          );
        })}
        <li className="card-todo-add">
          <input
            type="text"
            placeholder="Aufgabe hinzufügen"
            aria-label={`Aufgabe für ${item.title}`}
            value={newTodoText[item.id] ?? ''}
            onChange={(e) => setNewTodoText((prev) => ({ ...prev, [item.id]: e.target.value }))}
            onKeyDown={(e) => e.key === 'Enter' && addTodo(item.id)}
          />
          <button type="button" className="card-secondary" onClick={() => addTodo(item.id)} disabled={!(newTodoText[item.id] ?? '').trim()}>Hinzufügen</button>
        </li>
      </ul>
    );
  };

  const renderColumn = (status: string, label: string, columnItems: ProjectItem[]) => (
    <div
      className={`kanban-column ${dragOverColumn === status ? 'drag-over' : ''}`}
      onDragOver={handleDragOver}
      onDragEnter={() => setDragOverColumn(status)}
      onDragLeave={(e) => handleDragLeave(e, status)}
      onDrop={(e) => handleDrop(status, e)}
    >
      <div className="kanban-column-header"><span>{label}</span><span className="kanban-count">{columnItems.length}</span></div>
      <div className="kanban-items">
        {columnItems.map((item) => {
          const todos = item.todos ?? [];
          const doneTodos = todos.filter((t) => t.done).length;
          const time = item.status === 'in_progress' ? item.time_spent + liveSeconds : item.time_spent;
          return (
            <div key={item.id} className={`kanban-item status-${item.status} expanded`}>
              <div className="kanban-item-header" draggable onDragStart={(e) => handleDragStart(e, item.id)} onDragEnd={handleDragEnd}>
                <span className="item-title">{item.title}</span>
                {todos.length > 0 && <span className="todo-count">{doneTodos}/{todos.length}</span>}
                {time > 0 && <span className="item-time">{formatTime(time)}</span>}
              </div>
              <div className="card-row card-wrap">
                {status !== 'pending' && <button type="button" className="card-link" onClick={() => setStatus(item, 'pending')}>Zurück in den Vorrat</button>}
                {status !== 'in_progress' && <button type="button" className="card-link" onClick={() => setStatus(item, 'in_progress')}>Aktiv setzen</button>}
                {status !== 'done' && <button type="button" className="card-link" onClick={() => setStatus(item, 'done')}>Erledigt</button>}
                <button type="button" className="card-link" onClick={() => deleteItem(item.id)}>Löschen</button>
              </div>
              {renderTodos(item, true)}
            </div>
          );
        })}
        {columnItems.length === 0 && <p className="kanban-empty">Hierher ziehen</p>}
      </div>
    </div>
  );

  return (
    <div className="panel card-slim">
      <div className="card-line">
        <span className="card-goal-title">{data?.project_name || 'Kein Projekt benannt'}</span>
        <span className="card-status">{done.length} von {items.length} erledigt</span>
      </div>
      <div className="progress-bar-container"><div className="progress-bar" style={{ width: `${pct}%` }} /></div>

      {inProgress.length === 0 ? (
        <div className="card-status"><span>{items.length === 0 ? 'Noch keine Punkte. Unter „Aufgaben bearbeiten“ legst du den ersten an.' : 'Nichts aktiv. Unter „Aufgaben bearbeiten“ setzt du einen Punkt aktiv.'}</span></div>
      ) : (
        inProgress.map((item) => (
          <div key={item.id} className="card-active-item">
            <div className="card-active-title">Aktiv: {item.title}</div>
            {renderTodos(item, false)}
          </div>
        ))
      )}

      <div className="card-links">
        <button type="button" className="card-link" onClick={() => setBoard(true)}>Aufgaben bearbeiten</button>
      </div>

      {board && (
        <Dialog
          title="Aufgaben bearbeiten"
          sentence="Alle Punkte des Projekts in drei Spalten. Ziehen oder per Knopf verschieben; Aufgaben hängen am Punkt, Meilensteine an Aufgaben."
          onClose={() => setBoard(false)}
          width={1040}
          footer={<>
            <button type="button" className="card-link" onClick={exportCsv}>Als CSV exportieren</button>
            <span style={{ flex: 1 }} />
            <button type="button" className="card-primary" onClick={() => setBoard(false)}>Fertig</button>
          </>}
        >
          <div className="card-row">
            {editingName ? (
              <>
                <input type="text" value={projectName} placeholder="Projektname" aria-label="Projektname" onChange={(e) => setProjectName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveProjectName()} />
                <button type="button" className="card-primary" onClick={saveProjectName}>Speichern</button>
              </>
            ) : (
              <>
                <span className="card-goal-title card-grow">{data?.project_name || 'Kein Projekt benannt'}</span>
                <button type="button" className="card-secondary" onClick={() => { setEditingName(true); setProjectName(data?.project_name ?? ''); }}>Umbenennen</button>
              </>
            )}
          </div>
          <div className="card-row">
            <input type="text" placeholder="Neuer Punkt für den Vorrat" aria-label="Neuer Punkt" value={newItem} onChange={(e) => setNewItem(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addItem()} />
            <button type="button" className="card-secondary" onClick={addItem} disabled={!newItem.trim()}>Hinzufügen</button>
          </div>
          <div className="kanban-board">
            {renderColumn('pending', 'Vorrat', backlog)}
            {renderColumn('in_progress', 'Aktiv', inProgress)}
            {renderColumn('done', 'Erledigt', done)}
          </div>
        </Dialog>
      )}
    </div>
  );
}

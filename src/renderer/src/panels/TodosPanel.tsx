import React, { useState } from 'react';
import { useApi, apiPost, apiPatch, apiDelete } from '../hooks/useApi';
import { Todo } from '../../../shared/types';
import { useWebSocket } from '../hooks/useWebSocket';
import { useTranslation } from '../i18n/LanguageContext';
import { useToast } from '../i18n/ToastContext';

export default function TodosPanel() {
  const { data: todos, loading, refetch } = useApi<Todo[]>('/todos');
  const [newTodo, setNewTodo] = useState('');
  const { t } = useTranslation();
  const { toast } = useToast();

  useWebSocket((event) => {
    if (event === 'todo-updated') refetch();
  });

  const addTodo = async () => {
    if (!newTodo.trim()) return;
    const result = await apiPost('/todos', { title: newTodo.trim() });
    if (!result) { toast.error(t('error.action_failed')); return; }
    setNewTodo('');
    refetch();
  };

  const toggleTodo = async (id: number, currentDone: number) => {
    const result = await apiPatch(`/todos/${id}`, { done: !currentDone });
    if (!result) { toast.error(t('error.action_failed')); return; }
    refetch();
  };

  const deleteTodo = async (id: number) => {
    const ok = await apiDelete(`/todos/${id}`);
    if (!ok) { toast.error(t('error.action_failed')); return; }
    refetch();
  };

  if (loading && !todos) {
    return <div className="panel"><p className="empty">{t('common.loading')}</p></div>;
  }

  const pending = todos?.filter((t) => !t.done) || [];
  const done = todos?.filter((t) => t.done) || [];

  return (
    <div className="panel todos-panel">
      <h2>📋 Todos</h2>
      <p className="panel-desc">{t('todos.desc')}</p>

      <div className="todo-input">
        <input
          type="text"
          placeholder={t('todos.placeholder')}
          value={newTodo}
          onChange={(e) => setNewTodo(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addTodo()}
        />
        <button onClick={addTodo}>+</button>
      </div>

      <div className="todo-list">
        {pending.length === 0 && done.length === 0 && <p className="empty">{t('todos.empty')}</p>}
        {pending.map((todo) => (
          <div key={todo.id} className="todo-item">
            <button className="todo-check" onClick={() => toggleTodo(todo.id, todo.done)}>☐</button>
            <span className="todo-title">{todo.title}</span>
            <button className="todo-delete" onClick={() => deleteTodo(todo.id)} title={t('tooltip.delete')}>🗑️</button>
          </div>
        ))}
        {done.length > 0 && (
          <>
            <h3>{`${t('todos.done_section')} (${done.length})`}</h3>
            {done.map((todo) => (
              <div key={todo.id} className="todo-item done">
                <button className="todo-check" onClick={() => toggleTodo(todo.id, todo.done)}>☑</button>
                <span className="todo-title">{todo.title}</span>
                <button className="todo-delete" onClick={() => deleteTodo(todo.id)} title={t('tooltip.delete')}>🗑️</button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

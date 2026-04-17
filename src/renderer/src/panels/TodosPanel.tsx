import React, { useState } from 'react';
import { useApi, apiPost, apiPatch, apiDelete } from '../hooks/useApi';
import { Todo } from '../../../shared/types';
import { useWebSocket } from '../hooks/useWebSocket';
import { useTranslation } from '../i18n/LanguageContext';

export default function TodosPanel() {
  const { data: todos, refetch } = useApi<Todo[]>('/todos');
  const [newTodo, setNewTodo] = useState('');
  const { t } = useTranslation();

  useWebSocket((event) => {
    if (event === 'todo-updated') refetch();
  });

  const addTodo = async () => {
    if (!newTodo.trim()) return;
    await apiPost('/todos', { title: newTodo.trim() });
    setNewTodo('');
    refetch();
  };

  const toggleTodo = async (id: number, currentDone: number) => {
    await apiPatch(`/todos/${id}`, { done: !currentDone });
    refetch();
  };

  const deleteTodo = async (id: number) => {
    await apiDelete(`/todos/${id}`);
    refetch();
  };

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
        {pending.map((t) => (
          <div key={t.id} className="todo-item">
            <button className="todo-check" onClick={() => toggleTodo(t.id, t.done)}>☐</button>
            <span className="todo-title">{t.title}</span>
            <button className="todo-delete" onClick={() => deleteTodo(t.id)}>🗑️</button>
          </div>
        ))}
        {done.length > 0 && (
          <>
            <h3>{`${t('todos.done_section')} (${done.length})`}</h3>
            {done.map((t) => (
              <div key={t.id} className="todo-item done">
                <button className="todo-check" onClick={() => toggleTodo(t.id, t.done)}>☑</button>
                <span className="todo-title">{t.title}</span>
                <button className="todo-delete" onClick={() => deleteTodo(t.id)}>🗑️</button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

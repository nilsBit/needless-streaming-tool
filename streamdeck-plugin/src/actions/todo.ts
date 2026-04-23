import { action, KeyDownEvent, SingletonAction, WillAppearEvent } from '@elgato/streamdeck';
import type { JsonObject } from '@elgato/streamdeck';
import { apiGet, apiPatch } from '../api.js';
import { connectionManager } from '../connection.js';

interface TodoSettings extends JsonObject {
  todoId?: string;
}

interface ProgressTodo {
  id: number;
  done: number;
}

interface ProgressItem {
  todos?: ProgressTodo[];
}

interface ProgressResponse {
  items?: ProgressItem[];
}

let openCount = 0;

function flattenTodos(p: ProgressResponse): ProgressTodo[] {
  const out: ProgressTodo[] = [];
  for (const it of p?.items ?? []) {
    for (const t of it.todos ?? []) out.push(t);
  }
  return out;
}

async function fetchCount(): Promise<void> {
  try {
    const p = await apiGet<ProgressResponse>('/public/progress');
    openCount = flattenTodos(p).filter((t) => t.done === 0).length;
  } catch { /* leave as-is */ }
}

@action({ UUID: 'com.nst.deck.todo' })
export class TodoAction extends SingletonAction<TodoSettings> {
  constructor() {
    super();
    connectionManager.on('stateChange', async (state: string) => {
      if (state === 'connected') await fetchCount();
      this.updateAll();
    });
    connectionManager.on('message', async (event: string) => {
      if (event === 'progress-update') {
        await fetchCount();
        this.updateAll();
      }
    });
  }

  override async onWillAppear(_ev: WillAppearEvent<TodoSettings>): Promise<void> {
    this.updateAll();
  }

  override async onKeyDown(ev: KeyDownEvent<TodoSettings>): Promise<void> {
    if (!connectionManager.isConnected()) {
      await ev.action.showAlert();
      return;
    }
    const todoId = ev.payload.settings.todoId?.trim() || 'next';
    try {
      let targetId: number | string;
      if (todoId === 'next') {
        const p = await apiGet<ProgressResponse>('/public/progress');
        const next = flattenTodos(p).find((t) => t.done === 0);
        if (!next) {
          await ev.action.showAlert();
          return;
        }
        targetId = next.id;
      } else {
        targetId = todoId;
      }
      await apiPatch(`/api/progress/todos/${targetId}`, { done: 1 });
      await ev.action.showOk();
    } catch {
      await ev.action.showAlert();
    }
  }

  private updateAll(): void {
    const titleStr = !connectionManager.isConnected() ? 'OFFLINE' : `${openCount} Todos`;
    for (const a of this.actions) {
      a.setTitle(titleStr).catch(() => { /* ignore */ });
    }
  }
}

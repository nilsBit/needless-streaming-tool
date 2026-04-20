import { Router } from 'express';
import { getDb } from '../db/index';
import { broadcast } from '../websocket/index';
import { VALID_PROJECT_ITEM_STATUS } from '../../shared/types';
import { validateEnum } from './validate';

const router = Router();

// GET project + all items
router.get('/', (_req, res) => {
  const state = getDb().prepare('SELECT project_name FROM stream_state WHERE id = 1').get() as { project_name: string | null };
  const items = getDb().prepare('SELECT * FROM project_items ORDER BY sort_order ASC, created_at ASC').all() as Array<Record<string, unknown>>;
  for (const item of items) {
    item.todos = getDb().prepare('SELECT * FROM todos WHERE parent_id = ? ORDER BY done ASC, sort_order ASC, created_at ASC').all(item.id as number);
  }
  res.json({ project_name: state?.project_name || null, items });
});

// PATCH project name
router.patch('/project', (req, res) => {
  const { project_name } = req.body;
  if (project_name === undefined) { res.status(400).json({ error: 'project_name required' }); return; }
  getDb().prepare('UPDATE stream_state SET project_name = ? WHERE id = 1').run(project_name);
  const state = getDb().prepare('SELECT project_name FROM stream_state WHERE id = 1').get();
  broadcast('progress-update', state);
  res.json(state);
});

// POST new item
router.post('/items', (req, res) => {
  const { title } = req.body;
  if (!title) { res.status(400).json({ error: 'title required' }); return; }

  const maxOrder = getDb().prepare('SELECT MAX(sort_order) as max FROM project_items').get() as { max: number | null };
  const sortOrder = (maxOrder?.max ?? -1) + 1;

  const result = getDb().prepare('INSERT INTO project_items (title, sort_order) VALUES (?, ?)').run(title, sortOrder);
  const item = getDb().prepare('SELECT * FROM project_items WHERE id = ?').get(result.lastInsertRowid);
  broadcast('progress-update', { action: 'item-created', item });
  res.status(201).json(item);
});

// POST /seed-examples — creates 3 pre-made kanban items with sub-todos when the board is empty
router.post('/seed-examples', (_req, res) => {
  const db = getDb();
  const count = db.prepare('SELECT COUNT(*) as c FROM project_items').get() as { c: number };
  if (count.c > 0) { res.status(409).json({ error: 'already_has_items' }); return; }

  const EXAMPLES: Array<{ title: string; todos: string[] }> = [
    {
      title: '🎨 Intro überarbeiten',
      todos: ['Neue Musik aussuchen', 'Titel-Card designen', 'In OBS einfügen & testen'],
    },
    {
      title: '🔧 Overlay-Set erneuern',
      todos: ['Farbschema festlegen', 'Alerts stylen', 'Chat-Box stylen'],
    },
    {
      title: '🎮 Nächste Stream-Session planen',
      todos: ['Thema wählen', 'Discord-Post vorbereiten'],
    },
  ];

  const inserted: Array<Record<string, unknown>> = [];
  const doSeed = db.transaction(() => {
    EXAMPLES.forEach((ex, idx) => {
      const itemResult = db.prepare('INSERT INTO project_items (title, status, sort_order) VALUES (?, ?, ?)').run(ex.title, 'pending', idx);
      const itemId = Number(itemResult.lastInsertRowid);
      ex.todos.forEach((title, j) => {
        db.prepare('INSERT INTO todos (title, sort_order, parent_id) VALUES (?, ?, ?)').run(title, j, itemId);
      });
      const item = db.prepare('SELECT * FROM project_items WHERE id = ?').get(itemId) as Record<string, unknown>;
      item.todos = db.prepare('SELECT * FROM todos WHERE parent_id = ? ORDER BY sort_order ASC').all(itemId);
      inserted.push(item);
    });
  });

  doSeed();

  broadcast('progress-update', { action: 'items-seeded', count: inserted.length });
  res.status(201).json({ items: inserted });
});

// PATCH item (status, title, sort_order) — with timer linking
router.patch('/items/:id', (req, res) => {
  const { title, status, sort_order, current_timer_seconds } = req.body;
  const db = getDb();

  if (status !== undefined && !validateEnum(status, VALID_PROJECT_ITEM_STATUS, 'status', res)) return;

  const existing = db.prepare('SELECT * FROM project_items WHERE id = ?').get(req.params.id) as { id: number; title: string; status: string; time_spent: number; sort_order: number } | undefined;
  if (!existing) { res.status(404).json({ error: 'Item not found' }); return; }

  // Non-status changes (title, sort_order only)
  if (status === undefined) {
    const fields: string[] = [];
    const values: unknown[] = [];
    if (title !== undefined) { fields.push('title = ?'); values.push(title); }
    if (sort_order !== undefined) { fields.push('sort_order = ?'); values.push(sort_order); }
    if (fields.length === 0) { res.status(400).json({ error: 'No fields to update' }); return; }
    values.push(req.params.id);
    db.prepare(`UPDATE project_items SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    // If active item title changed, update challenge_title
    if (title !== undefined && existing.status === 'in_progress') {
      db.prepare('UPDATE stream_state SET challenge_title = ? WHERE id = 1').run(title);
      broadcast('stream-state', db.prepare('SELECT * FROM stream_state WHERE id = 1').get());
    }

    const item = db.prepare('SELECT * FROM project_items WHERE id = ?').get(req.params.id);
    broadcast('progress-update', { action: 'item-updated', item });
    res.json(item);
    return;
  }

  // Status change — wrapped in transaction
  const doStatusChange = db.transaction(() => {
    const state = db.prepare('SELECT * FROM stream_state WHERE id = 1').get() as { timer_seconds: number; timer_running: number; challenge_title: string | null };
    const timerValue = current_timer_seconds !== undefined ? current_timer_seconds : state.timer_seconds;

    if (status === 'in_progress') {
      // Pause any currently active item
      const activeItem = db.prepare('SELECT * FROM project_items WHERE status = ? AND id != ?').get('in_progress', req.params.id) as { id: number; time_spent: number } | undefined;
      if (activeItem) {
        db.prepare('UPDATE project_items SET status = ?, time_spent = time_spent + ? WHERE id = ?').run('pending', timerValue, activeItem.id);
      }
      // Set new item to in_progress
      db.prepare('UPDATE project_items SET status = ? WHERE id = ?').run('in_progress', req.params.id);
      // Link to challenge timer (resume from item's saved time)
      const itemTitle = title !== undefined ? title : existing.title;
      db.prepare('UPDATE stream_state SET challenge_title = ?, challenge_status = ?, timer_seconds = ?, timer_running = 1 WHERE id = 1').run(itemTitle, 'in_progress', existing.time_spent);
    } else if (status === 'done') {
      if (existing.status === 'in_progress') {
        db.prepare('UPDATE project_items SET status = ?, time_spent = time_spent + ? WHERE id = ?').run('done', timerValue, req.params.id);
        db.prepare('UPDATE stream_state SET challenge_status = ?, timer_running = 0 WHERE id = 1').run('done');
      } else {
        db.prepare('UPDATE project_items SET status = ? WHERE id = ?').run('done', req.params.id);
      }
    } else if (status === 'pending') {
      if (existing.status === 'in_progress') {
        db.prepare('UPDATE project_items SET status = ?, time_spent = time_spent + ? WHERE id = ?').run('pending', timerValue, req.params.id);
        db.prepare('UPDATE stream_state SET challenge_title = NULL, challenge_status = ?, timer_seconds = 0, timer_running = 0 WHERE id = 1').run('idle');
      } else {
        db.prepare('UPDATE project_items SET status = ? WHERE id = ?').run('pending', req.params.id);
      }
    }

    // Also update title/sort_order if provided alongside status
    if (title !== undefined) db.prepare('UPDATE project_items SET title = ? WHERE id = ?').run(title, req.params.id);
    if (sort_order !== undefined) db.prepare('UPDATE project_items SET sort_order = ? WHERE id = ?').run(sort_order, req.params.id);
  });

  doStatusChange();

  const item = db.prepare('SELECT * FROM project_items WHERE id = ?').get(req.params.id);
  const streamState = db.prepare('SELECT * FROM stream_state WHERE id = 1').get();
  broadcast('progress-update', { action: 'item-updated', item });
  broadcast('stream-state', streamState);
  res.json(item);
});

// DELETE item — with active item cleanup
router.delete('/items/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM project_items WHERE id = ?').get(req.params.id) as { id: number; status: string; time_spent: number } | undefined;
  if (!existing) { res.status(404).json({ error: 'Item not found' }); return; }

  const doDelete = db.transaction(() => {
    if (existing.status === 'in_progress') {
      const state = db.prepare('SELECT timer_seconds FROM stream_state WHERE id = 1').get() as { timer_seconds: number };
      db.prepare('UPDATE project_items SET time_spent = time_spent + ? WHERE id = ?').run(state.timer_seconds, req.params.id);
      db.prepare('UPDATE stream_state SET challenge_title = NULL, challenge_status = ?, timer_seconds = 0, timer_running = 0 WHERE id = 1').run('idle');
    }
    db.prepare('DELETE FROM todos WHERE parent_id = ?').run(req.params.id);
    db.prepare('DELETE FROM project_items WHERE id = ?').run(req.params.id);
  });

  doDelete();
  broadcast('progress-update', { action: 'item-deleted', id: Number(req.params.id) });
  if (existing.status === 'in_progress') {
    broadcast('stream-state', db.prepare('SELECT * FROM stream_state WHERE id = 1').get());
  }
  res.status(204).send();
});

// GET CSV export
router.get('/export', (_req, res) => {
  const db = getDb();
  const items = db.prepare('SELECT * FROM project_items ORDER BY sort_order ASC').all() as Array<{ title: string; status: string; time_spent: number; created_at: string }>;
  const state = db.prepare('SELECT timer_seconds FROM stream_state WHERE id = 1').get() as { timer_seconds: number };

  const rows = items.map(item => {
    const totalSeconds = item.status === 'in_progress' ? item.time_spent + state.timer_seconds : item.time_spent;
    const minutes = Math.round(totalSeconds / 60);
    const escapedTitle = item.title.includes(',') ? `"${item.title}"` : item.title;
    return `${escapedTitle},${item.status},${minutes},${item.created_at}`;
  });

  const csv = 'Title,Status,Time Spent (minutes),Created At\n' + rows.join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=project-progress.csv');
  res.send(csv);
});

// GitHub settings
router.get('/github', (_req, res) => {
  const db = getDb();
  const tokenRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('github_token') as { value: string } | undefined;
  const repoRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('github_repo') as { value: string } | undefined;
  res.json({
    configured: !!tokenRow?.value,
    preview: tokenRow?.value ? tokenRow.value.substring(0, 8) + '...' : null,
    repo: repoRow?.value || null,
  });
});

router.post('/github', (req, res) => {
  const { token, repo } = req.body;
  const db = getDb();
  if (token !== undefined) {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('github_token', token);
  }
  if (repo !== undefined) {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('github_repo', repo);
  }
  res.json({ success: true });
});

// GitHub import
router.post('/import/github', async (req, res) => {
  const db = getDb();
  const { owner, repo } = req.body;
  if (!owner || !repo) { res.status(400).json({ error: 'owner and repo required' }); return; }

  const tokenRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('github_token') as { value: string } | undefined;
  if (!tokenRow?.value) { res.status(400).json({ error: 'GitHub token not configured' }); return; }

  try {
    const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues?state=open&per_page=100`, {
      headers: {
        'Authorization': `Bearer ${tokenRow.value}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'stream-toolkit',
      },
    });

    if (response.status === 401) { res.status(401).json({ error: 'GitHub token invalid' }); return; }
    if (response.status === 404) { res.status(404).json({ error: 'Repository not found' }); return; }
    if (!response.ok) { res.status(502).json({ error: 'GitHub API error: ' + response.status }); return; }

    const issues = await response.json() as Array<{ number: number; title: string; pull_request?: unknown }>;

    // Filter out pull requests
    const realIssues = issues.filter(i => !i.pull_request);

    const maxOrder = db.prepare('SELECT MAX(sort_order) as max FROM project_items').get() as { max: number | null };
    let sortOrder = (maxOrder?.max ?? -1) + 1;

    let imported = 0;
    let skipped = 0;

    for (const issue of realIssues) {
      const externalId = `github:${owner}/${repo}#${issue.number}`;
      const existing = db.prepare('SELECT id FROM project_items WHERE external_id = ?').get(externalId);
      if (existing) {
        skipped++;
        continue;
      }
      db.prepare('INSERT INTO project_items (title, status, sort_order, external_id) VALUES (?, ?, ?, ?)').run(issue.title, 'pending', sortOrder++, externalId);
      imported++;
    }

    // Save repo for convenience
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('github_repo', `${owner}/${repo}`);

    broadcast('progress-update', { action: 'github-import', imported, skipped });
    res.json({ imported, skipped, total: imported + skipped });
  } catch (err) {
    console.error('[Progress] GitHub import failed:', err);
    res.status(502).json({ error: 'GitHub API unavailable' });
  }
});

// POST sub-todo for an item
router.post('/items/:id/todos', (req, res) => {
  const { title } = req.body;
  if (!title) { res.status(400).json({ error: 'title required' }); return; }

  const db = getDb();
  const item = db.prepare('SELECT id FROM project_items WHERE id = ?').get(req.params.id);
  if (!item) { res.status(404).json({ error: 'Item not found' }); return; }

  const maxOrder = db.prepare('SELECT MAX(sort_order) as max FROM todos WHERE parent_id = ?').get(req.params.id) as { max: number | null };
  const sortOrder = (maxOrder?.max ?? -1) + 1;

  const result = db.prepare('INSERT INTO todos (title, sort_order, parent_id) VALUES (?, ?, ?)').run(title, sortOrder, req.params.id);
  const todo = db.prepare('SELECT * FROM todos WHERE id = ?').get(result.lastInsertRowid);

  broadcast('progress-update', { action: 'todo-created', todo });
  res.status(201).json(todo);
});

// PATCH sub-todo
router.patch('/todos/:id', (req, res) => {
  const { title, done } = req.body;
  const db = getDb();

  const existing = db.prepare('SELECT * FROM todos WHERE id = ?').get(req.params.id);
  if (!existing) { res.status(404).json({ error: 'Todo not found' }); return; }

  const fields: string[] = [];
  const values: unknown[] = [];

  if (title !== undefined) { fields.push('title = ?'); values.push(title); }
  if (done !== undefined) { fields.push('done = ?'); values.push(done ? 1 : 0); }

  if (fields.length === 0) { res.status(400).json({ error: 'No fields to update' }); return; }

  values.push(req.params.id);
  db.prepare(`UPDATE todos SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  const todo = db.prepare('SELECT * FROM todos WHERE id = ?').get(req.params.id);

  broadcast('progress-update', { action: 'todo-updated', todo });
  res.json(todo);
});

// DELETE sub-todo
router.delete('/todos/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM todos WHERE id = ?').get(req.params.id);
  if (!existing) { res.status(404).json({ error: 'Todo not found' }); return; }

  db.prepare('DELETE FROM todos WHERE id = ?').run(req.params.id);
  broadcast('progress-update', { action: 'todo-deleted', id: Number(req.params.id) });
  res.status(204).send();
});

export default router;

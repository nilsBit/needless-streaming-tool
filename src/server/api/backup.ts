import { Router } from 'express';
import express from 'express';
import { getDb } from '../db/index';

const router = Router();

router.use(express.json({ limit: '50mb' }));

const TABLES = [
  'issues', 'clips', 'designs', 'milestones', 'project_items',
  'rewards', 'settings', 'stream_state', 'todos',
];

// Get valid column names for a table from the DB schema
function getTableColumns(table: string): string[] {
  const db = getDb();
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return cols.map((c) => c.name);
}

router.get('/export', (_req, res) => {
  const db = getDb();
  const backup: Record<string, unknown[]> = {};

  for (const table of TABLES) {
    backup[table] = db.prepare(`SELECT * FROM ${table}`).all();
  }

  res.setHeader('Content-Disposition', 'attachment; filename=nst-backup.json');
  res.json(backup);
});

router.post('/import', (req, res) => {
  const db = getDb();
  const data = req.body as Record<string, Record<string, unknown>[]>;

  if (!data || typeof data !== 'object') {
    res.status(400).json({ error: 'Invalid backup data' });
    return;
  }

  // Backward compatibility: old backups have 'bugs' key
  if (data['bugs'] && !data['issues']) {
    data['issues'] = data['bugs'];
    delete data['bugs'];
  }

  const importTransaction = db.transaction(() => {
    for (const table of TABLES) {
      if (!data[table]) continue;
      const rows = data[table];
      if (!Array.isArray(rows) || rows.length === 0) continue;

      // Validate columns against actual DB schema to prevent SQL injection
      const validColumns = getTableColumns(table);
      const requestedColumns = Object.keys(rows[0]);
      const safeColumns = requestedColumns.filter((col) => validColumns.includes(col));

      if (safeColumns.length === 0) continue;

      db.prepare(`DELETE FROM ${table}`).run();

      const placeholders = safeColumns.map(() => '?').join(', ');
      const insert = db.prepare(`INSERT INTO ${table} (${safeColumns.join(', ')}) VALUES (${placeholders})`);

      for (const row of rows) {
        insert.run(...safeColumns.map((col) => row[col] ?? null));
      }
    }
  });

  try {
    importTransaction();
    res.json({ success: true, tables: Object.keys(data).filter((t) => TABLES.includes(t)) });
  } catch (err) {
    console.error('[Backup] Import failed:', err);
    res.status(500).json({ error: 'Import failed' });
  }
});

export default router;

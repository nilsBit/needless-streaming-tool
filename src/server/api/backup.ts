import { Router } from 'express';
import express from 'express';
import { getDb } from '../db/index';

const router = Router();

// Allow larger payloads for backup import
router.use(express.json({ limit: '50mb' }));

const TABLES = [
  'bugs',
  'clips',
  'designs',
  'milestones',
  'project_items',
  'raids',
  'rewards',
  'settings',
  'stream_state',
  'todos',
];

router.get('/export', (_req, res) => {
  const db = getDb();
  const backup: Record<string, unknown[]> = {};

  for (const table of TABLES) {
    backup[table] = db.prepare(`SELECT * FROM ${table}`).all();
  }

  res.setHeader('Content-Disposition', 'attachment; filename=stream-toolkit-backup.json');
  res.json(backup);
});

router.post('/import', (req, res) => {
  const db = getDb();
  const data = req.body as Record<string, Record<string, unknown>[]>;

  if (!data || typeof data !== 'object') {
    res.status(400).json({ error: 'Invalid backup data' });
    return;
  }

  const importTransaction = db.transaction(() => {
    for (const table of TABLES) {
      if (!data[table]) continue;

      const rows = data[table];
      if (!Array.isArray(rows) || rows.length === 0) continue;

      // Clear existing data
      db.prepare(`DELETE FROM ${table}`).run();

      // Insert rows
      const columns = Object.keys(rows[0]);
      const placeholders = columns.map(() => '?').join(', ');
      const insert = db.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`);

      for (const row of rows) {
        insert.run(...columns.map((col) => row[col] ?? null));
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

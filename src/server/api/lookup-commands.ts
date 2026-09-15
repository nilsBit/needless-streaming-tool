import { Router } from 'express';
import { getDb } from '../db/index';
import { normalizeTrigger } from '../bot/command-names';
import { checkLookupCommand, type LookupCommand } from '../bot/lookup-commands';
import { DEFAULT_COOLDOWN_SECONDS } from '../bot/text-commands';
import { loadArtenFromWorld } from './worldbuilder';
import { requireRow } from './validate';

const router = Router();

function toJson(row: LookupCommand) {
  return { ...row, enabled: !!row.enabled };
}

function findCommand(id: string): LookupCommand | undefined {
  return getDb().prepare('SELECT * FROM lookup_commands WHERE id = ?').get(id) as LookupCommand | undefined;
}

router.get('/', (_req, res) => {
  const rows = getDb().prepare('SELECT * FROM lookup_commands ORDER BY trigger').all() as LookupCommand[];
  res.json(rows.map(toJson));
});

/** GET /arten — the Arten of the open world, for the panel to offer. 503 while it cannot be asked. */
router.get('/arten', async (_req, res) => {
  const arten = await loadArtenFromWorld();
  if (!Array.isArray(arten)) { res.status(503).json(arten); return; }
  res.json(arten);
});

router.post('/', (req, res) => {
  const body = req.body ?? {};
  const command = {
    trigger: normalizeTrigger(String(body.trigger ?? '')),
    art: String(body.art ?? '').trim(),
    cooldown_seconds: body.cooldown_seconds === undefined ? DEFAULT_COOLDOWN_SECONDS : Number(body.cooldown_seconds),
  };

  const refusal = checkLookupCommand(command);
  if (refusal) { res.status(refusal.status).json({ error: refusal.error, message: refusal.message }); return; }

  const enabled = body.enabled === undefined || body.enabled ? 1 : 0;
  const result = getDb()
    .prepare('INSERT INTO lookup_commands (trigger, art, cooldown_seconds, enabled) VALUES (?, ?, ?, ?)')
    .run(command.trigger, command.art, command.cooldown_seconds, enabled);

  res.status(201).json(toJson(findCommand(String(result.lastInsertRowid))!));
});

router.patch('/:id', (req, res) => {
  const existing = findCommand(req.params.id);
  if (!requireRow(existing, res) || !existing) return;

  const body = req.body ?? {};
  const next = {
    trigger: body.trigger === undefined ? existing.trigger : normalizeTrigger(String(body.trigger)),
    art: body.art === undefined ? existing.art : String(body.art).trim(),
    cooldown_seconds: body.cooldown_seconds === undefined ? existing.cooldown_seconds : Number(body.cooldown_seconds),
  };

  const refusal = checkLookupCommand(next, existing.id);
  if (refusal) { res.status(refusal.status).json({ error: refusal.error, message: refusal.message }); return; }

  const enabled = body.enabled === undefined ? existing.enabled : body.enabled ? 1 : 0;
  getDb()
    .prepare('UPDATE lookup_commands SET trigger = ?, art = ?, cooldown_seconds = ?, enabled = ? WHERE id = ?')
    .run(next.trigger, next.art, next.cooldown_seconds, enabled, existing.id);

  res.json(toJson(findCommand(req.params.id)!));
});

router.delete('/:id', (req, res) => {
  if (!requireRow(findCommand(req.params.id), res)) return;
  getDb().prepare('DELETE FROM lookup_commands WHERE id = ?').run(req.params.id);
  res.status(204).send();
});

export default router;

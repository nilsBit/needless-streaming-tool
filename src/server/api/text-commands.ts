import { Router } from 'express';
import { getDb } from '../db/index';
import { splitForChat } from '../bot/chat-message';
import { normalizeTrigger } from '../bot/command-names';
import {
  answerChatMessage,
  checkTextCommand,
  DEFAULT_COOLDOWN_SECONDS,
  MAX_REPLY_MESSAGES,
  type TextCommand,
} from '../bot/text-commands';
import { requireRow } from './validate';

const router = Router();

function toJson(row: TextCommand) {
  return { ...row, enabled: !!row.enabled };
}

function findCommand(id: string): TextCommand | undefined {
  return getDb().prepare('SELECT * FROM text_commands WHERE id = ?').get(id) as TextCommand | undefined;
}

router.get('/', (_req, res) => {
  const rows = getDb().prepare('SELECT * FROM text_commands ORDER BY trigger').all() as TextCommand[];
  res.json(rows.map(toJson));
});

router.post('/', (req, res) => {
  const body = req.body ?? {};
  const command = {
    trigger: normalizeTrigger(String(body.trigger ?? '')),
    response: String(body.response ?? ''),
    cooldown_seconds: body.cooldown_seconds === undefined ? DEFAULT_COOLDOWN_SECONDS : Number(body.cooldown_seconds),
  };

  const refusal = checkTextCommand(command);
  if (refusal) { res.status(refusal.status).json({ error: refusal.error, message: refusal.message }); return; }

  const enabled = body.enabled === undefined || body.enabled ? 1 : 0;
  const result = getDb()
    .prepare('INSERT INTO text_commands (trigger, response, cooldown_seconds, enabled) VALUES (?, ?, ?, ?)')
    .run(command.trigger, command.response.trim(), command.cooldown_seconds, enabled);

  res.status(201).json(toJson(findCommand(String(result.lastInsertRowid))!));
});

router.patch('/:id', (req, res) => {
  const existing = findCommand(req.params.id);
  if (!requireRow(existing, res) || !existing) return;

  const body = req.body ?? {};
  const next = {
    trigger: body.trigger === undefined ? existing.trigger : normalizeTrigger(String(body.trigger)),
    response: body.response === undefined ? existing.response : String(body.response),
    cooldown_seconds: body.cooldown_seconds === undefined ? existing.cooldown_seconds : Number(body.cooldown_seconds),
  };

  const refusal = checkTextCommand(next, existing.id);
  if (refusal) { res.status(refusal.status).json({ error: refusal.error, message: refusal.message }); return; }

  const enabled = body.enabled === undefined ? existing.enabled : body.enabled ? 1 : 0;
  getDb()
    .prepare('UPDATE text_commands SET trigger = ?, response = ?, cooldown_seconds = ?, enabled = ? WHERE id = ?')
    .run(next.trigger, next.response.trim(), next.cooldown_seconds, enabled, existing.id);

  res.json(toJson(findCommand(req.params.id)!));
});

router.delete('/:id', (req, res) => {
  if (!requireRow(findCommand(req.params.id), res)) return;
  getDb().prepare('DELETE FROM text_commands WHERE id = ?').run(req.params.id);
  res.status(204).send();
});

/** How a reply lands in chat, while it is still being written. */
router.post('/preview', (req, res) => {
  res.json({ messages: splitForChat(String(req.body?.response ?? '')), max: MAX_REPLY_MESSAGES });
});

/**
 * What chat would get for a message — without being live.
 *
 * Tries as the streamer unless told otherwise, so trying a command out in the
 * app never starts its cooldown for chat.
 */
router.post('/try', (req, res) => {
  const privileged = req.body?.as !== 'viewer';
  res.json(answerChatMessage(String(req.body?.message ?? ''), privileged));
});

export default router;

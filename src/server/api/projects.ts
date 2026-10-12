import { Router, type Response } from 'express';
import {
  createProject, deleteProject, finishProject, finishedLine, makeCurrent, moveCurrent, projectsState, setCurrentStand, updateProject,
  type ProjectRefusal,
} from '../projects';
import type { Project } from '../../shared/types';
import { sayInChat } from '../bot/index';

// Projekt on "Im Stream" (2026-10-12). The Stream Deck key "Projekt weiter"
// calls /current/forward, so it needs no id.
const router = Router();

function send(res: Response, result: Project | ProjectRefusal, created = false): void {
  if (!('id' in result)) { res.status(result.status).json({ error: result.message, message: result.message }); return; }
  res.status(created ? 201 : 200).json(result);
}

function idOf(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

router.get('/', (_req, res) => {
  res.json(projectsState());
});

router.post('/', (req, res) => {
  send(res, createProject(req.body ?? {}), true);
});

router.post('/current/forward', (_req, res) => {
  send(res, moveCurrent(1));
});

router.post('/current/back', (_req, res) => {
  send(res, moveCurrent(-1));
});

router.post('/current/stand', (req, res) => {
  send(res, setCurrentStand((req.body as { position?: unknown } | undefined)?.position));
});

router.patch('/:id', (req, res) => {
  const id = idOf(req.params.id);
  if (id === null) { res.status(404).json({ error: 'Das Projekt gibt es nicht.' }); return; }
  send(res, updateProject(id, req.body ?? {}));
});

router.post('/:id/current', (req, res) => {
  const id = idOf(req.params.id);
  if (id === null) { res.status(404).json({ error: 'Das Projekt gibt es nicht.' }); return; }
  send(res, makeCurrent(id));
});

router.post('/:id/finish', (req, res) => {
  const id = idOf(req.params.id);
  if (id === null) { res.status(404).json({ error: 'Das Projekt gibt es nicht.' }); return; }
  const result = finishProject(id);
  if ('id' in result) sayInChat(finishedLine(result));
  send(res, result);
});

router.delete('/:id', (req, res) => {
  const id = idOf(req.params.id);
  if (id === null || !deleteProject(id)) { res.status(404).json({ error: 'Das Projekt gibt es nicht.' }); return; }
  res.status(204).send();
});

export default router;

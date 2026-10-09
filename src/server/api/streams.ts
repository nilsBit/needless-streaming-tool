import { Router } from 'express';
import { listStreams, streamReport } from '../stream-report/report';

// "Nach dem Stream": the streams the tool saw live, and what each one was.
const router = Router();

router.get('/', (_req, res) => {
  res.json(listStreams());
});

router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: 'invalid id' }); return; }
  const report = streamReport(id);
  if (!report) { res.status(404).json({ error: 'Stream not found' }); return; }
  res.json(report);
});

export default router;

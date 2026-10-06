import { Router } from 'express';
import { assessReadiness, readinessInput } from '../readiness';

// GET /api/readiness — is everything in place for the stream, and if not, what
// is missing and where to fix it. See ../readiness.ts.
const router = Router();

router.get('/', async (_req, res) => {
  res.json(assessReadiness(await readinessInput()));
});

export default router;

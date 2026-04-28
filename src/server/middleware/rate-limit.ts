import { Request, Response, NextFunction } from 'express';

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 200; // 200 requests per minute

function createRateLimiter(windowMs: number, maxRequests: number) {
  const store = new Map<string, { count: number; resetAt: number }>();

  // Cleanup old entries every 5 minutes
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of store.entries()) {
      if (now > entry.resetAt) store.delete(ip);
    }
  }, 300_000);
  cleanup.unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || 'unknown';
    const now = Date.now();

    let entry = store.get(ip);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(ip, entry);
    }

    entry.count++;

    if (entry.count > maxRequests) {
      res.status(429).json({ error: 'Too many requests. Try again later.' });
      return;
    }

    next();
  };
}

export const rateLimit = createRateLimiter(WINDOW_MS, MAX_REQUESTS);
export const publicRateLimit = createRateLimiter(WINDOW_MS, 300); // 300 req/min for public endpoints (overlays poll frequently)


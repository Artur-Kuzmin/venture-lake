import type { Request, Response, NextFunction } from 'express';
import { sendError } from '../lib/response.js';

interface Bucket {
  count: number;
  resetAt: number;
}

// Minimal in-memory fixed-window rate limiter (dependency-free), keyed by client
// IP. Intended to blunt brute-force / credential-stuffing on auth endpoints.
// Notes for production: this is per-process (use a shared store for multi-
// instance deployments), and behind a proxy you must configure Express
// "trust proxy" so req.ip reflects the real client rather than the proxy.
export function rateLimit({ windowMs, max }: { windowMs: number; max: number }) {
  const buckets = new Map<string, Bucket>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = req.ip ?? 'unknown';

    // Opportunistic cleanup so the map can't grow without bound.
    if (buckets.size > 10000) {
      for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
    }

    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;

    if (bucket.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      sendError(res, 429, 'RATE_LIMITED', 'Too many requests. Please slow down and try again later.');
      return;
    }
    next();
  };
}

export default rateLimit;

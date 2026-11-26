import { Request, Response, NextFunction } from 'express';

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Periodic cleanup of expired rate limit buckets
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets.entries()) {
    if (b.resetAt <= now) buckets.delete(k);
  }
}, 60_000).unref();

export interface RateLimitOptions {
  keyPrefix: string;
  windowMs: number;
  max: number;
  message?: string;
  keyFn?: (req: Request) => string;
}

export function createRateLimiter(options: RateLimitOptions) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const customKey = options.keyFn ? options.keyFn(req) : req.ip || 'unknown';
    const key = `${options.keyPrefix}:${customKey}`;
    const now = Date.now();
    const existing = buckets.get(key);

    if (!existing || existing.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    if (existing.count >= options.max) {
      const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(429).json({
        error: options.message || 'تعداد درخواست‌های شما بیش از حد مجاز است. لطفاً کمی بعد دوباره تلاش کنید.',
        retryAfterSec,
      });
      return;
    }

    existing.count += 1;
    next();
  };
}

import { rateLimit } from 'express-rate-limit';

// Basic brute-force protection for credential endpoints. The store is in-memory,
// which is fine for a single instance; multiple instances would need a shared
// store such as Redis.
export function createAuthRateLimiter(limit) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({
        success: false,
        error: { code: 'TOO_MANY_REQUESTS', message: 'Too many attempts. Please try again later.' },
      });
    },
  });
}

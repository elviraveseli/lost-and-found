import crypto from 'node:crypto';
import { config } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

export const CSRF_COOKIE = 'csrf_token';
export const CSRF_HEADER = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Double-submit cookie pattern.
// The server sets a random token in a cookie that JavaScript CAN read. For every
// state-changing request the client copies it into the X-CSRF-Token header.
// Another website can make the browser *send* our cookies, but it cannot *read*
// them, so it cannot produce the matching header. SameSite=Lax on the auth
// cookie is a second layer of defence.
export function issueCsrfToken(res) {
  const token = crypto.randomBytes(32).toString('hex');
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    sameSite: 'lax',
    secure: config.isProduction,
    path: '/',
  });
  return token;
}

export function csrfProtection(req, _res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.get(CSRF_HEADER);
  if (!cookieToken || !headerToken || !safeEqual(cookieToken, headerToken)) {
    return next(new AppError(403, 'CSRF_INVALID', 'Invalid or missing CSRF token'));
  }
  next();
}

function safeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // timingSafeEqual throws on different lengths, so compare lengths first.
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

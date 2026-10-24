import { config } from '../config/env.js';
import { AUTH_COOKIE } from '../middleware/auth.js';
import { issueCsrfToken } from '../middleware/csrf.js';
import * as authService from '../services/auth.service.js';
import { sendSuccess } from '../utils/response.js';

const authCookieOptions = () => ({
  httpOnly: true, // not readable from JavaScript, so XSS cannot steal the session
  sameSite: 'lax', // not sent on cross-site POSTs (CSRF defence in depth)
  secure: config.isProduction, // HTTPS only in production
  path: '/',
  maxAge: config.SESSION_TTL_HOURS * 60 * 60 * 1000,
});

function startSession(res, user) {
  res.cookie(AUTH_COOKIE, authService.signSessionToken(user.id), authCookieOptions());
  // Rotate the CSRF token whenever the session changes.
  issueCsrfToken(res);
}

export async function getCsrfToken(_req, res) {
  const csrfToken = issueCsrfToken(res);
  sendSuccess(res, { csrfToken });
}

export async function register(req, res) {
  const user = await authService.register(req.validated.body);
  startSession(res, user);
  sendSuccess(res, { user }, { status: 201 });
}

export async function login(req, res) {
  const user = await authService.login(req.validated.body);
  startSession(res, user);
  sendSuccess(res, { user });
}

export async function logout(_req, res) {
  const { maxAge: _ignored, ...clearOptions } = authCookieOptions();
  res.clearCookie(AUTH_COOKIE, clearOptions);
  issueCsrfToken(res);
  sendSuccess(res, { loggedOut: true });
}

export async function me(req, res) {
  sendSuccess(res, { user: req.user });
}

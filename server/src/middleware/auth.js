import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';

export const AUTH_COOKIE = 'token';

// Resolve the user from the JWT cookie. The token only carries the user id;
// role and active status are always read from the database, so a demoted or
// deactivated user loses access immediately and a forged role is impossible.
async function resolveUser(req) {
  const token = req.cookies?.[AUTH_COOKIE];
  if (!token) return null;

  let payload;
  try {
    payload = jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    return null;
  }

  const user = await User.findById(payload.sub).lean();
  if (!user || !user.isActive) return null;
  return { id: user._id.toString(), name: user.name, email: user.email, role: user.role };
}

export async function requireAuth(req, _res, next) {
  const user = await resolveUser(req);
  if (!user) throw AppError.unauthorized();
  req.user = user;
  next();
}

// Attaches req.user when a valid cookie is present but never rejects.
export async function optionalAuth(req, _res, next) {
  req.user = (await resolveUser(req)) ?? undefined;
  next();
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) throw AppError.unauthorized();
    if (!roles.includes(req.user.role)) throw AppError.forbidden();
    next();
  };
}

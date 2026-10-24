import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { toUserDTO } from '../utils/serializers.js';

const INVALID_CREDENTIALS = 'Invalid email or password';

// Comparing against a dummy hash when the user does not exist keeps the response
// time similar, so attackers cannot discover registered emails by timing logins.
let dummyHash;
function getDummyHash() {
  dummyHash ??= bcrypt.hashSync('dummy-password-for-timing', config.BCRYPT_ROUNDS);
  return dummyHash;
}

export async function register({ name, email, password }) {
  const existing = await User.exists({ email });
  if (existing) throw AppError.conflict('An account with this email already exists');

  const passwordHash = await bcrypt.hash(password, config.BCRYPT_ROUNDS);
  // Role is never taken from the request: every self-registered account is a 'user'.
  const user = await User.create({ name, email, passwordHash, role: 'user' });
  return toUserDTO(user);
}

export async function login({ email, password }) {
  const user = await User.findOne({ email }).select('+passwordHash');
  const hash = user?.passwordHash ?? getDummyHash();
  const passwordOk = await bcrypt.compare(password, hash);

  // Same message for "no such user", "wrong password" and "deactivated", so the
  // response does not reveal which accounts exist.
  if (!user || !passwordOk || !user.isActive) throw AppError.unauthorized(INVALID_CREDENTIALS);
  return toUserDTO(user);
}

export function signSessionToken(userId) {
  return jwt.sign({ sub: userId }, config.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: Math.floor(config.SESSION_TTL_HOURS * 3600),
  });
}

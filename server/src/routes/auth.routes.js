import { Router } from 'express';
import * as auth from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { loginSchema, registerSchema } from '../validators/auth.validators.js';

export function authRoutes({ authLimiter }) {
  const router = Router();
  router.get('/csrf', auth.getCsrfToken);
  router.post('/register', authLimiter, validate({ body: registerSchema }), auth.register);
  router.post('/login', authLimiter, validate({ body: loginSchema }), auth.login);
  router.post('/logout', auth.logout);
  router.get('/me', requireAuth, auth.me);
  return router;
}

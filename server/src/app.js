import { existsSync } from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { pinoHttp } from 'pino-http';
import { config } from './config/env.js';
import { logger } from './config/logger.js';
import { csrfProtection } from './middleware/csrf.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { createAuthRateLimiter } from './middleware/rateLimit.js';
import { getImage } from './controllers/upload.controller.js';
import { docsRouter } from './docs/swagger.js';
import adminRoutes from './routes/admin.routes.js';
import { authRoutes } from './routes/auth.routes.js';
import claimRoutes from './routes/claim.routes.js';
import itemRoutes from './routes/item.routes.js';
import notificationRoutes from './routes/notification.routes.js';

// Builds the Express app without starting a server or connecting to MongoDB.
// Tests create their own app instances; server.js adds the network and DB.
export function createApp({ loginRateLimit = config.LOGIN_RATE_LIMIT } = {}) {
  const app = express();

  if (config.TRUST_PROXY) app.set('trust proxy', 1); // needed for correct client IPs behind a reverse proxy

  app.use(helmet());
  app.use(
    pinoHttp({
      logger,
      autoLogging: !config.isTest,
      // Log only what is useful for debugging; never headers (cookies) or bodies.
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  // No CORS middleware: in development the Vite dev server proxies /api, and in
  // production Express serves the built client, so the browser always talks to
  // a single origin. That keeps cookie and CSRF handling simple.

  app.get('/api/health', (_req, res) => {
    const dbUp = mongoose.connection.readyState === 1;
    res.status(dbUp ? 200 : 503).json({ success: dbUp, data: { status: dbUp ? 'ok' : 'degraded', db: dbUp } });
  });

  app.use('/api/docs', docsRouter());
  app.get('/api/uploads/:key', getImage);

  app.use('/api', csrfProtection);
  app.use('/api/auth', authRoutes({ authLimiter: createAuthRateLimiter(loginRateLimit) }));
  app.use('/api/items', itemRoutes);
  app.use('/api/claims', claimRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/admin', adminRoutes);

  app.use('/api', notFoundHandler);

  // In production, serve the built React app and let the client-side router
  // handle unknown paths.
  const clientDist = path.join(config.rootDir, 'client', 'dist');
  if (config.isProduction && existsSync(clientDist)) {
    app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
    app.get('/{*path}', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

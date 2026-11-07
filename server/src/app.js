import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import fs from 'node:fs';
import path from 'node:path';
import { errorHandler } from './errors.js';
import { requireClientHeader } from './middleware/auth.js';
import { applicationRoutes } from './routes/applications.js';
import { authRoutes } from './routes/auth.js';
import { insightRoutes } from './routes/insights.js';
import { portalRoutes } from './routes/portal.js';
import { requisitionRoutes } from './routes/requisitions.js';

/**
 * Builds the Express app. `ctx` carries the database handle and config so tests can inject an in-memory db.
 * @param {{db: import('better-sqlite3').Database, config: object}} ctx
 */
export function createApp(ctx) {
  const app = express();
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          'font-src': ["'self'", 'https://fonts.gstatic.com'],
          'img-src': ["'self'", 'data:'],
          'upgrade-insecure-requests': null,
        },
      },
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use('/api', requireClientHeader);

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRoutes(ctx));
  app.use('/api/portal', portalRoutes(ctx));
  app.use('/api', requisitionRoutes(ctx), applicationRoutes(ctx), insightRoutes(ctx));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  const { clientDist } = ctx.config;
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }
  app.use(errorHandler);
  return app;
}

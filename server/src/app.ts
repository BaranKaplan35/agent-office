import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import express from 'express';
import { errorHandler } from './http/errors';
import { apiRouter, type ApiDeps } from './http/routes';
import { CLIENT_DIST_DIR } from './paths';

export function createApp(deps: ApiDeps) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.use('/api', apiRouter(deps));

  // In production the server also serves the built client.
  if (deps.env.NODE_ENV === 'production' && existsSync(CLIENT_DIST_DIR)) {
    app.use(express.static(CLIENT_DIST_DIR));
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.sendFile(resolve(CLIENT_DIST_DIR, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}

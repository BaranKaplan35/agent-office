import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ApiError, HealthResponse } from '@agent-office/shared';
import express, { type ErrorRequestHandler } from 'express';
import type { Env } from './env';
import { CLIENT_DIST_DIR } from './paths';

const APP_VERSION = '0.1.0';

export function createApp(env: Env) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  const api = express.Router();

  api.get('/health', (_req, res) => {
    const body: HealthResponse = { ok: true, provider: env.LLM_PROVIDER, version: APP_VERSION };
    res.json(body);
  });

  api.use((_req, res) => {
    const body: ApiError = { error: { code: 'not_found', message: 'Unknown API route' } };
    res.status(404).json(body);
  });

  app.use('/api', api);

  // In production the server also serves the built client.
  if (env.NODE_ENV === 'production' && existsSync(CLIENT_DIST_DIR)) {
    app.use(express.static(CLIENT_DIST_DIR));
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.sendFile(resolve(CLIENT_DIST_DIR, 'index.html'));
    });
  }

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error(err);
    const body: ApiError = { error: { code: 'internal', message: 'Something went wrong' } };
    res.status(500).json(body);
  };
  app.use(onError);

  return app;
}

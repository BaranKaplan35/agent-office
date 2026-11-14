import type { ApiError } from '@agent-office/shared';
import type { ErrorRequestHandler } from 'express';
import type { z } from 'zod';
import { OrchestratorError, type OrchestratorErrorCode } from '../orchestrator/orchestrator';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const STATUS_BY_CODE: Record<OrchestratorErrorCode, number> = {
  not_found: 404,
  invalid_state: 409,
  revision_limit: 409,
  validation: 400,
};

/** Validate a request body; throws a 400 naming the first bad field. */
export function parseBody<S extends z.ZodType>(schema: S, body: unknown): z.output<S> {
  const result = schema.safeParse(body);
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = issue?.path.join('.') || 'body';
    throw new HttpError(400, 'validation', `${field}: ${issue?.message ?? 'invalid'}`);
  }
  return result.data;
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  let status = 500;
  let code = 'internal';
  let message = 'Something went wrong';

  if (err instanceof HttpError) {
    ({ status, code, message } = err);
  } else if (err instanceof OrchestratorError) {
    status = STATUS_BY_CODE[err.code];
    code = err.code;
    message = err.message;
  } else if (err?.type === 'entity.parse.failed') {
    status = 400;
    code = 'invalid_json';
    message = 'The request body is not valid JSON';
  } else {
    console.error(err);
  }

  if (res.headersSent) {
    res.end();
    return;
  }
  const body: ApiError = { error: { code, message } };
  res.status(status).json(body);
};

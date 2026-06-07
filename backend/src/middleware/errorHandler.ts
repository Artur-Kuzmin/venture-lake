import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ApiError, sendError } from '../lib/response.js';

// Single error-handling middleware (Foundation Bible, Section 4.5).
// - ApiError -> its declared status/code (business-rule violations use 403/409).
// - ZodError -> 400 VALIDATION_ERROR.
// - Anything else -> 500 INTERNAL_ERROR, never leaking stack traces to clients.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ApiError) {
    sendError(res, err.status, err.code, err.message);
    return;
  }

  if (err instanceof ZodError) {
    const message = err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    sendError(res, 400, 'VALIDATION_ERROR', message || 'Invalid request payload.');
    return;
  }

  // Unexpected error: log server-side, return a generic message.
  console.error('[errorHandler]', err);
  sendError(res, 500, 'INTERNAL_ERROR', 'Something went wrong.');
}

export default errorHandler;

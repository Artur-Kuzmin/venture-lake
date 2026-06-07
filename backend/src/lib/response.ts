import type { Response } from 'express';

// Shared API response/error shape (Foundation Bible, Section 4.5).
//   Success:      { data: <payload> }
//   Client error: { error: { code, message } }
// Reuse these helpers in every route; do not invent per-endpoint shapes.

export function sendData<T>(res: Response, data: T, status = 200): Response {
  return res.status(status).json({ data });
}

export function sendError(
  res: Response,
  status: number,
  code: string,
  message: string
): Response {
  return res.status(status).json({ error: { code, message } });
}

// Thrown by services/routes for business-rule violations. The errorHandler
// middleware turns these into the standard error shape. Business-rule
// violations must use 403/409, never a generic 500.
export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

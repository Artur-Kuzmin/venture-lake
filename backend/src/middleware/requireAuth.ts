import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../lib/jwt.js';
import { sendError } from '../lib/response.js';

// Decodes the Bearer token and attaches req.user = { userId }.
// Rejects requests without a valid token (Foundation Bible, Section 4.3).
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    sendError(res, 401, 'UNAUTHENTICATED', 'Missing or malformed Authorization header.');
    return;
  }

  const token = header.slice('Bearer '.length).trim();
  try {
    const { userId } = verifyToken(token);
    req.user = { userId };
    next();
  } catch {
    sendError(res, 401, 'INVALID_TOKEN', 'Invalid or expired token.');
  }
}

export default requireAuth;

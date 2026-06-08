import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';
import { sendError } from '../lib/response.js';

// Admins are designated by the ADMIN_EMAILS env allowlist (comma-separated).
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

// Gates admin-only routes (Foundation Bible, Section 3). Must run after
// requireAuth. The bible's Admin user type has no schema flag at MVP, so
// membership is checked against the env allowlist.
export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.user) {
    sendError(res, 401, 'UNAUTHENTICATED', 'Authentication required.');
    return;
  }
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: { email: true },
  });
  if (!user || !ADMIN_EMAILS.includes(user.email.toLowerCase())) {
    sendError(res, 403, 'NOT_ADMIN', 'Admin access is required.');
    return;
  }
  next();
}

export default requireAdmin;

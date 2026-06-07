import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';
import { sendError } from '../lib/response.js';

// Blocks queue/team routes until the user has completed a founder profile
// (Foundation Bible, Section 4.3). Must run after requireAuth.
export async function requireProfile(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.user) {
    sendError(res, 401, 'UNAUTHENTICATED', 'Authentication required.');
    return;
  }

  const profile = await prisma.founderProfile.findUnique({
    where: { userId: req.user.userId },
    select: { id: true },
  });

  if (!profile) {
    sendError(res, 403, 'PROFILE_REQUIRED', 'A founder profile is required for this action.');
    return;
  }

  req.hasProfile = true;
  next();
}

export default requireProfile;

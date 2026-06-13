import { Router } from 'express';

import { prisma } from '../lib/prisma.js';
import { sendData, ApiError } from '../lib/response.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

// Admin routes (Foundation Bible, Section 3 / Phase 7.1). Admin-gated via the
// ADMIN_EMAILS allowlist. Admin only handles VC approval and exceptions.
const router = Router();
router.use(requireAuth, requireAdmin);

async function setVcApproval(userId: string, approved: boolean) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, displayName: true },
  });
  if (!user) throw new ApiError(404, 'USER_NOT_FOUND', 'User not found.');

  const profile = await prisma.vCProfile.upsert({
    where: { userId },
    create: { userId, approved, approvedAt: approved ? new Date() : null },
    update: { approved, approvedAt: approved ? new Date() : null },
  });

  return {
    userId: user.id,
    displayName: user.displayName,
    email: user.email,
    approved: profile.approved,
    approvedAt: profile.approvedAt,
  };
}

// GET /api/admin/me — lightweight admin-status check for the frontend nav.
// Only admins reach this handler (requireAdmin gates the router); everyone
// else gets a 403, which the client reads as "not an admin". No business logic.
router.get(
  '/me',
  asyncHandler(async (_req, res) => {
    sendData(res, { admin: true });
  })
);

// POST /api/admin/users/:id/approve-vc — grant VC reviewer access.
router.post(
  '/users/:id/approve-vc',
  asyncHandler(async (req, res) => {
    sendData(res, await setVcApproval(req.params.id, true));
  })
);

// POST /api/admin/users/:id/revoke-vc — revoke VC reviewer access.
router.post(
  '/users/:id/revoke-vc',
  asyncHandler(async (req, res) => {
    sendData(res, await setVcApproval(req.params.id, false));
  })
);

export default router;

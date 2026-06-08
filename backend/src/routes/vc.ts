import { Router } from 'express';

import { prisma } from '../lib/prisma.js';
import { sendData } from '../lib/response.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth } from '../middleware/requireAuth.js';

// VC reviewer routes (Foundation Bible, Phase 7). A user can be both Founder and
// VC; VC mode requires admin approval. VC status is independent of a founder
// profile, so only requireAuth is applied here.
const router = Router();
router.use(requireAuth);

// GET /api/vc/me — the caller's VC reviewer status.
router.get(
  '/me',
  asyncHandler(async (req, res) => {
    const profile = await prisma.vCProfile.findUnique({
      where: { userId: req.user!.userId },
    });
    sendData(res, {
      approved: profile?.approved ?? false,
      approvedAt: profile?.approvedAt ?? null,
      reviewCooldownUntil: profile?.reviewCooldownUntil ?? null,
    });
  })
);

export default router;

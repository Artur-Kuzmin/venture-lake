import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../lib/prisma.js';
import { sendData, ApiError } from '../lib/response.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth } from '../middleware/requireAuth.js';

// Founder profile routes (Foundation Bible, Section 5). All writes go through
// the backend; the frontend never writes profile data directly to the DB.
const router = Router();

const PRIMARY_ROLES = ['BUILDER', 'DESIGNER', 'GROWTH_SALES', 'BUSINESS_OPERATIONS'] as const;

const profileSchema = z.object({
  name: z.string().trim().min(1).max(80),
  city: z.string().trim().min(1).max(80),
  timezone: z.string().trim().min(1).max(60),
  languages: z.array(z.string().trim().min(1)).min(1, 'Add at least one language.'),
  primaryRole: z.enum(PRIMARY_ROLES),
  skills: z.array(z.string().trim().min(1)).min(1, 'Select at least one skill.'),
  industryInterests: z.array(z.string().trim().min(1)).min(1, 'Add at least one industry interest.'),
  availabilityHoursPerWeek: z.number().int().min(0).max(168),
  bio: z.string().trim().max(1000).optional().default(''),
});

// GET /api/profile/me -> the caller's founder profile, or null if none yet.
router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const profile = await prisma.founderProfile.findUnique({
      where: { userId: req.user!.userId },
    });
    sendData(res, profile);
  })
);

// POST /api/profile -> create the caller's founder profile (one per user).
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = profileSchema.parse(req.body);

    const existing = await prisma.founderProfile.findUnique({
      where: { userId: req.user!.userId },
      select: { id: true },
    });
    if (existing) {
      throw new ApiError(409, 'PROFILE_EXISTS', 'A founder profile already exists. Use PUT to update it.');
    }

    const profile = await prisma.founderProfile.create({
      data: { ...data, userId: req.user!.userId },
    });
    sendData(res, profile, 201);
  })
);

// PUT /api/profile -> update the caller's existing founder profile.
router.put(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = profileSchema.parse(req.body);

    const existing = await prisma.founderProfile.findUnique({
      where: { userId: req.user!.userId },
      select: { id: true },
    });
    if (!existing) {
      throw new ApiError(404, 'PROFILE_NOT_FOUND', 'No founder profile to update. Create one first.');
    }

    const profile = await prisma.founderProfile.update({
      where: { userId: req.user!.userId },
      data,
    });
    sendData(res, profile);
  })
);

export default router;

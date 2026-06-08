import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../lib/prisma.js';
import { sendData, ApiError } from '../lib/response.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireProfile } from '../middleware/requireProfile.js';

// Mission routes. Phase 5.2: captain assigns owners to the generated
// deliverables. Mission start (5.3) and submission (6.1) come later.
const router = Router();
router.use(requireAuth, requireProfile);

const assignmentsSchema = z.object({
  assignments: z
    .array(
      z.object({
        title: z.string().trim().min(1),
        description: z.string().trim().min(1),
        assignedToId: z.string().min(1),
      })
    )
    .min(1),
});

// PUT /api/missions/:id/deliverable-assignments — captain assigns each
// deliverable to a team member. Replaces the existing assignment set.
router.put(
  '/:id/deliverable-assignments',
  asyncHandler(async (req, res) => {
    const userId = req.user!.userId;

    const mission = await prisma.mission.findUnique({
      where: { id: req.params.id },
      include: { team: { include: { members: { where: { leftAt: null } } } } },
    });
    if (!mission) throw new ApiError(404, 'MISSION_NOT_FOUND', 'Mission not found.');

    const team = mission.team;
    if (!team.members.some((m) => m.userId === userId)) {
      throw new ApiError(403, 'NOT_TEAM_MEMBER', 'You are not a member of this team.');
    }
    if (team.captainId !== userId) {
      throw new ApiError(403, 'NOT_CAPTAIN', 'Only the captain can assign deliverables.');
    }

    const { assignments } = assignmentsSchema.parse(req.body);
    const memberIds = new Set(team.members.map((m) => m.userId));
    for (const a of assignments) {
      if (!memberIds.has(a.assignedToId)) {
        throw new ApiError(409, 'INVALID_ASSIGNEE', 'Each deliverable must be assigned to a team member.');
      }
    }

    await prisma.$transaction([
      prisma.deliverableAssignment.deleteMany({ where: { missionId: mission.id } }),
      prisma.deliverableAssignment.createMany({
        data: assignments.map((a) => ({
          missionId: mission.id,
          title: a.title,
          description: a.description,
          assignedToId: a.assignedToId,
        })),
      }),
    ]);

    const updated = await prisma.deliverableAssignment.findMany({
      where: { missionId: mission.id },
      include: { assignedTo: { select: { id: true, displayName: true } } },
    });

    sendData(res, {
      missionId: mission.id,
      assignments: updated.map((a) => ({
        title: a.title,
        description: a.description,
        assignedToId: a.assignedToId,
        assignedToName: a.assignedTo.displayName,
      })),
    });
  })
);

export default router;

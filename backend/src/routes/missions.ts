import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';

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

// Treat empty-string URLs as absent; validate as a URL otherwise.
const optionalUrl = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().trim().url().optional()
);

const submitSchema = z.object({
  summary: z.string().trim().min(1).max(5000),
  pitchText: z.string().trim().max(5000).optional(),
  prototypeUrl: optionalUrl,
  demoUrl: optionalUrl,
  landingPageUrl: optionalUrl,
  links: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
  notes: z.string().trim().max(2000).optional(),
});

// POST /api/missions/:id/submit — captain-only final team submission. Must be
// before the deadline; one submission per mission. Moves the team to SUBMITTED
// and enqueues the package for VC review (Phase 6.1).
router.post(
  '/:id/submit',
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
      throw new ApiError(403, 'NOT_CAPTAIN', 'Only the captain can submit the final package.');
    }
    const existing = await prisma.missionSubmission.findFirst({ where: { missionId: mission.id } });
    if (existing) {
      throw new ApiError(409, 'ALREADY_SUBMITTED', 'This mission has already been submitted.');
    }
    if (team.status !== 'MISSION_ACTIVE' || mission.status !== 'ACTIVE') {
      throw new ApiError(409, 'MISSION_NOT_ACTIVE', 'The mission is not active.');
    }
    if (new Date() > mission.deadlineAt) {
      throw new ApiError(409, 'DEADLINE_PASSED', 'The submission deadline has passed.');
    }

    const input = submitSchema.parse(req.body);
    const hasFiles = (input.links && input.links.length > 0) || Boolean(input.notes);
    const files: Prisma.InputJsonValue | undefined = hasFiles
      ? { links: input.links ?? [], notes: input.notes ?? null }
      : undefined;

    const submission = await prisma.$transaction(async (tx) => {
      const sub = await tx.missionSubmission.create({
        data: {
          missionId: mission.id,
          teamId: team.id,
          submittedById: userId,
          summary: input.summary,
          pitchText: input.pitchText ?? null,
          prototypeUrl: input.prototypeUrl ?? null,
          demoUrl: input.demoUrl ?? null,
          landingPageUrl: input.landingPageUrl ?? null,
          files,
          status: 'SUBMITTED',
        },
      });
      await tx.mission.update({
        where: { id: mission.id },
        data: { status: 'SUBMITTED', submittedAt: new Date() },
      });
      await tx.team.update({ where: { id: team.id }, data: { status: 'SUBMITTED' } });
      return sub;
    });

    sendData(res, { id: submission.id, status: submission.status, teamStatus: 'SUBMITTED' }, 201);
  })
);

export default router;

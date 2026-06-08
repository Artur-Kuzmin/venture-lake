import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma.js';
import { sendData, ApiError } from '../lib/response.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth } from '../middleware/requireAuth.js';

// VC reviewer routes (Foundation Bible, Phase 7). A user can be both Founder and
// VC; VC mode requires admin approval. VC status is independent of a founder
// profile, so only requireAuth is applied here.
const router = Router();
router.use(requireAuth);

const ACTIVE_ASSIGNMENT_STATUSES: Prisma.VCReviewAssignmentWhereInput['status'] = {
  in: ['ASSIGNED', 'ACCEPTED'],
};
const REVIEW_WINDOW_HOURS = 6;

// Throws unless the caller is an approved VC.
async function assertApprovedVc(userId: string) {
  const vc = await prisma.vCProfile.findUnique({ where: { userId } });
  if (!vc?.approved) {
    throw new ApiError(403, 'VC_NOT_APPROVED', 'Your VC reviewer account is not approved.');
  }
  return vc;
}

type AssignmentWithSubmission = Prisma.VCReviewAssignmentGetPayload<{
  include: { submission: { include: { mission: true } } };
}>;

// Anonymized view shown to a VC — NO team or member identities.
function buildAssignmentView(assignment: AssignmentWithSubmission) {
  const sub = assignment.submission;
  const mission = sub.mission;
  const files = (sub.files ?? null) as { links?: string[]; notes?: string | null } | null;
  const deliverables = (mission.deliverables ?? []) as { title: string; description: string }[];
  return {
    assignmentId: assignment.id,
    status: assignment.status,
    deadlineAt: assignment.deadlineAt,
    isAppealReview: assignment.isAppealReview,
    missionTitle: mission.title,
    missionBrief: mission.brief,
    deliverables,
    submission: {
      summary: sub.summary,
      pitchText: sub.pitchText,
      prototypeUrl: sub.prototypeUrl,
      demoUrl: sub.demoUrl,
      landingPageUrl: sub.landingPageUrl,
      links: files?.links ?? [],
      notes: files?.notes ?? null,
    },
  };
}

function findActiveAssignment(vcUserId: string) {
  return prisma.vCReviewAssignment.findFirst({
    where: { vcUserId, status: ACTIVE_ASSIGNMENT_STATUSES },
    orderBy: { assignedAt: 'desc' },
    include: { submission: { include: { mission: true } } },
  });
}

// GET /api/vc/me — the caller's VC reviewer status.
router.get(
  '/me',
  asyncHandler(async (req, res) => {
    const profile = await prisma.vCProfile.findUnique({ where: { userId: req.user!.userId } });
    sendData(res, {
      approved: profile?.approved ?? false,
      approvedAt: profile?.approvedAt ?? null,
      reviewCooldownUntil: profile?.reviewCooldownUntil ?? null,
    });
  })
);

// POST /api/vc/queue/enter — assign ONE available anonymized submission (or
// return the VC's current active assignment if they already have one).
router.post(
  '/queue/enter',
  asyncHandler(async (req, res) => {
    const userId = req.user!.userId;
    await assertApprovedVc(userId);

    const existing = await findActiveAssignment(userId);
    if (existing) {
      sendData(res, buildAssignmentView(existing));
      return;
    }

    // Exclude submissions this VC has ever been assigned (covers "never twice"
    // and "never a missed-deadline one") and the VC's own team.
    const [seen, myTeams] = await Promise.all([
      prisma.vCReviewAssignment.findMany({ where: { vcUserId: userId }, select: { submissionId: true } }),
      prisma.teamMember.findMany({ where: { userId, leftAt: null }, select: { teamId: true } }),
    ]);

    const where: Prisma.MissionSubmissionWhereInput = {
      status: 'SUBMITTED',
      reviewAssignments: { none: { status: ACTIVE_ASSIGNMENT_STATUSES } },
    };
    const seenIds = seen.map((s) => s.submissionId);
    const myTeamIds = myTeams.map((t) => t.teamId);
    if (seenIds.length) where.id = { notIn: seenIds };
    if (myTeamIds.length) where.teamId = { notIn: myTeamIds };

    const candidate = await prisma.missionSubmission.findFirst({
      where,
      orderBy: { submittedAt: 'asc' },
      select: { id: true },
    });
    if (!candidate) {
      sendData(res, null);
      return;
    }

    const created = await prisma.vCReviewAssignment.create({
      data: { submissionId: candidate.id, vcUserId: userId, status: 'ASSIGNED', isAppealReview: false },
      include: { submission: { include: { mission: true } } },
    });
    sendData(res, buildAssignmentView(created), 201);
  })
);

// POST /api/vc/assignments/:id/accept — accept the assignment (6h to review).
router.post(
  '/assignments/:id/accept',
  asyncHandler(async (req, res) => {
    const userId = req.user!.userId;
    await assertApprovedVc(userId);

    const assignment = await prisma.vCReviewAssignment.findUnique({ where: { id: req.params.id } });
    if (!assignment) throw new ApiError(404, 'ASSIGNMENT_NOT_FOUND', 'Assignment not found.');
    if (assignment.vcUserId !== userId) {
      throw new ApiError(403, 'NOT_YOUR_ASSIGNMENT', 'This assignment is not yours.');
    }
    if (assignment.status !== 'ASSIGNED') {
      throw new ApiError(409, 'ASSIGNMENT_NOT_PENDING', 'This assignment cannot be accepted.');
    }

    const now = new Date();
    const deadlineAt = new Date(now.getTime() + REVIEW_WINDOW_HOURS * 3600 * 1000);
    const updated = await prisma.vCReviewAssignment.update({
      where: { id: assignment.id },
      data: { status: 'ACCEPTED', acceptedAt: now, deadlineAt },
      include: { submission: { include: { mission: true } } },
    });
    sendData(res, buildAssignmentView(updated));
  })
);

// POST /api/vc/assignments/:id/pass — pass; the submission returns to the queue.
router.post(
  '/assignments/:id/pass',
  asyncHandler(async (req, res) => {
    const userId = req.user!.userId;
    await assertApprovedVc(userId);

    const assignment = await prisma.vCReviewAssignment.findUnique({ where: { id: req.params.id } });
    if (!assignment) throw new ApiError(404, 'ASSIGNMENT_NOT_FOUND', 'Assignment not found.');
    if (assignment.vcUserId !== userId) {
      throw new ApiError(403, 'NOT_YOUR_ASSIGNMENT', 'This assignment is not yours.');
    }
    if (assignment.status !== 'ASSIGNED') {
      throw new ApiError(409, 'ASSIGNMENT_NOT_PENDING', 'This assignment cannot be passed.');
    }

    await prisma.vCReviewAssignment.update({
      where: { id: assignment.id },
      data: { status: 'PASSED' },
    });
    sendData(res, { passed: true });
  })
);

// GET /api/vc/current-assignment — the VC's active assignment, or null.
router.get(
  '/current-assignment',
  asyncHandler(async (req, res) => {
    const userId = req.user!.userId;
    await assertApprovedVc(userId);
    const assignment = await findActiveAssignment(userId);
    sendData(res, assignment ? buildAssignmentView(assignment) : null);
  })
);

// ---- Review form (Phase 7.3) ---------------------------------------------

const REVIEW_CATEGORIES = [
  'Clarity of idea',
  'Execution quality',
  'Market potential',
  'Presentation quality',
  'Use of team skills',
] as const;

const reviewSchema = z.object({
  categories: z
    .array(
      z.object({
        category: z.enum(REVIEW_CATEGORIES),
        score: z.number().int().min(1).max(10),
        feedback: z.string(),
      })
    )
    .length(REVIEW_CATEGORIES.length),
});

// Quality checks on per-category feedback. Returns an error message or null.
function feedbackQualityError(feedback: string): string | null {
  const t = feedback.trim();
  if (t.length === 0) return 'feedback cannot be empty';
  if (t.length < 15) return 'feedback is too short (min 15 characters)';
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 2) return 'feedback cannot be a single word';
  const uniqueWords = new Set(words.map((w) => w.toLowerCase())).size;
  if (uniqueWords / words.length < 0.5) return 'feedback looks like repeated text';
  const uniqueChars = new Set(t.replace(/\s/g, '').toLowerCase()).size;
  if (uniqueChars < 5) return 'feedback looks like spam';
  return null;
}

// POST /api/vc/assignments/:id/review — submit the category review.
router.post(
  '/assignments/:id/review',
  asyncHandler(async (req, res) => {
    const userId = req.user!.userId;
    await assertApprovedVc(userId);

    const assignment = await prisma.vCReviewAssignment.findUnique({
      where: { id: req.params.id },
      include: { submission: { select: { teamId: true } } },
    });
    if (!assignment) throw new ApiError(404, 'ASSIGNMENT_NOT_FOUND', 'Assignment not found.');
    if (assignment.vcUserId !== userId) {
      throw new ApiError(403, 'NOT_YOUR_ASSIGNMENT', 'This assignment is not yours.');
    }
    if (assignment.status !== 'ACCEPTED') {
      throw new ApiError(409, 'ASSIGNMENT_NOT_ACCEPTED', 'Accept the assignment before reviewing.');
    }
    if (assignment.deadlineAt && new Date() > assignment.deadlineAt) {
      throw new ApiError(409, 'DEADLINE_PASSED', 'The 6-hour review window has passed.');
    }

    const { categories } = reviewSchema.parse(req.body);

    if (new Set(categories.map((c) => c.category)).size !== REVIEW_CATEGORIES.length) {
      throw new ApiError(400, 'INVALID_CATEGORIES', 'All five categories must be scored exactly once.');
    }
    for (const c of categories) {
      const err = feedbackQualityError(c.feedback);
      if (err) throw new ApiError(400, 'INVALID_FEEDBACK', `${c.category}: ${err}.`);
    }

    const overallScore =
      (categories.reduce((sum, c) => sum + c.score, 0) / categories.length) * 10;

    const review = await prisma.$transaction(async (tx) => {
      const created = await tx.vCReview.create({
        data: {
          submissionId: assignment.submissionId,
          vcUserId: userId,
          assignmentId: assignment.id,
          isAppealReview: assignment.isAppealReview,
          overallScore,
          status: 'VALID',
          categories: {
            create: categories.map((c) => ({
              category: c.category,
              score: c.score,
              feedback: c.feedback.trim(),
            })),
          },
        },
      });
      await tx.vCReviewAssignment.update({
        where: { id: assignment.id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
      // First review: leave the queue and mark the team under review. The
      // appeal-window transition is handled in Phase 8.1.
      if (!assignment.isAppealReview) {
        await tx.missionSubmission.update({
          where: { id: assignment.submissionId },
          data: { status: 'UNDER_REVIEW' },
        });
        await tx.team.update({
          where: { id: assignment.submission.teamId },
          data: { status: 'UNDER_REVIEW' },
        });
      }
      return created;
    });

    sendData(res, { reviewId: review.id, overallScore, status: review.status }, 201);
  })
);

export default router;

import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma.js';
import { sendData, ApiError } from '../lib/response.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireProfile } from '../middleware/requireProfile.js';
import { expireAppealWindows, APPEAL_WINDOW_HOURS } from '../services/appealExpiry.js';

// One-time review appeal (Foundation Bible, Phase 8.2). During the 6h appeal
// window any team member may start ONE appeal per submission; the team must
// approve it by simple majority within 6h or the first review becomes final.
// Mounted at /api — paths span the /submissions and /appeals prefixes.
const router = Router();
router.use(requireAuth, requireProfile);

function majorityOf(memberCount: number) {
  return Math.floor(memberCount / 2) + 1;
}

type AppealWithVotes = Prisma.ReviewAppealGetPayload<{
  include: { votes: { include: { user: { select: { id: true; displayName: true } } } } };
}>;

function buildAppealView(appeal: AppealWithVotes, memberCount: number) {
  const yesCount = appeal.votes.filter((v) => v.vote === 'YES').length;
  return {
    id: appeal.id,
    submissionId: appeal.submissionId,
    status: appeal.status,
    createdAt: appeal.createdAt,
    expiresAt: appeal.expiresAt,
    memberCount,
    majorityNeeded: majorityOf(memberCount),
    yesCount,
    noCount: appeal.votes.length - yesCount,
    votes: appeal.votes.map((v) => ({
      userId: v.userId,
      displayName: v.user.displayName,
      vote: v.vote,
    })),
  };
}

// POST /api/appeals/expire-windows — dev/admin trigger to finalize unappealed
// reviews and expire overdue appeal votes (also runs on an interval).
router.post(
  '/appeals/expire-windows',
  asyncHandler(async (_req, res) => {
    sendData(res, await expireAppealWindows());
  })
);

// POST /api/submissions/:id/appeal/start — a team member opens the one-time
// appeal during the 6h appeal window. The team then has 6h to reach a YES
// majority via /api/appeals/:id/vote.
router.post(
  '/submissions/:id/appeal/start',
  asyncHandler(async (req, res) => {
    const userId = req.user!.userId;

    const submission = await prisma.missionSubmission.findUnique({
      where: { id: req.params.id },
      include: {
        team: { include: { members: { where: { leftAt: null } } } },
        appeals: { select: { id: true } },
        reviews: { where: { isAppealReview: false }, orderBy: { createdAt: 'asc' }, take: 1 },
      },
    });
    if (!submission) throw new ApiError(404, 'SUBMISSION_NOT_FOUND', 'Submission not found.');
    if (!submission.team.members.some((m) => m.userId === userId)) {
      throw new ApiError(403, 'NOT_TEAM_MEMBER', 'You are not a member of this team.');
    }
    if (submission.appeals.length > 0) {
      throw new ApiError(409, 'APPEAL_ALREADY_USED', 'A score can be appealed only once.');
    }

    const firstReview = submission.reviews[0];
    if (!firstReview || submission.status !== 'UNDER_REVIEW' || submission.team.status !== 'APPEAL_WINDOW') {
      throw new ApiError(409, 'NOT_IN_APPEAL_WINDOW', 'There is no reviewed score to appeal.');
    }
    const windowEndsAt = new Date(firstReview.createdAt.getTime() + APPEAL_WINDOW_HOURS * 3600 * 1000);
    if (new Date() > windowEndsAt) {
      throw new ApiError(409, 'APPEAL_WINDOW_CLOSED', 'The 6-hour appeal window has closed.');
    }

    const appeal = await prisma.reviewAppeal.create({
      data: {
        submissionId: submission.id,
        teamId: submission.teamId,
        status: 'OPEN',
        expiresAt: new Date(Date.now() + APPEAL_WINDOW_HOURS * 3600 * 1000),
      },
      include: { votes: { include: { user: { select: { id: true, displayName: true } } } } },
    });
    sendData(res, buildAppealView(appeal, submission.team.members.length), 201);
  })
);

const voteSchema = z.object({ vote: z.enum(['YES', 'NO']) });

// POST /api/appeals/:id/vote — cast (or change) a YES/NO vote on an open
// appeal. A YES majority of active members approves it: the submission
// re-enters the VC queue, where a different VC is guaranteed because the queue
// never re-assigns a prior VC. Once YES can no longer reach a majority the
// appeal is rejected and the first review becomes final.
router.post(
  '/appeals/:id/vote',
  asyncHandler(async (req, res) => {
    const userId = req.user!.userId;
    const { vote } = voteSchema.parse(req.body);

    const appeal = await prisma.reviewAppeal.findUnique({
      where: { id: req.params.id },
      include: { team: { include: { members: { where: { leftAt: null } } } } },
    });
    if (!appeal) throw new ApiError(404, 'APPEAL_NOT_FOUND', 'Appeal not found.');
    const members = appeal.team.members;
    if (!members.some((m) => m.userId === userId)) {
      throw new ApiError(403, 'NOT_TEAM_MEMBER', 'You are not a member of this team.');
    }
    if (appeal.status !== 'OPEN') {
      throw new ApiError(409, 'APPEAL_NOT_OPEN', 'This appeal has already been decided.');
    }
    if (new Date() > appeal.expiresAt) {
      throw new ApiError(409, 'APPEAL_EXPIRED', 'The 6-hour appeal vote window has passed.');
    }

    await prisma.appealVote.upsert({
      where: { appealId_userId: { appealId: appeal.id, userId } },
      create: { appealId: appeal.id, userId, vote },
      update: { vote },
    });

    const votes = await prisma.appealVote.findMany({
      where: { appealId: appeal.id },
      include: { user: { select: { id: true, displayName: true } } },
    });
    const memberCount = members.length;
    const majorityNeeded = majorityOf(memberCount);
    const yesCount = votes.filter((v) => v.vote === 'YES').length;
    const noCount = votes.filter((v) => v.vote === 'NO').length;

    // Decide by the same rules, then apply with a single-winner latch: only the
    // request that flips the appeal out of OPEN runs the submission/team side
    // effects. A concurrent deciding vote reads the already-decided status, so
    // the two can never leave the submission/team in conflicting states.
    let decided: AppealWithVotes['status'] = 'OPEN';
    const target: 'APPROVED' | 'REJECTED' | null =
      yesCount >= majorityNeeded
        ? 'APPROVED'
        : memberCount - noCount < majorityNeeded
          ? 'REJECTED'
          : null;
    if (target) {
      const claim = await prisma.reviewAppeal.updateMany({
        where: { id: appeal.id, status: 'OPEN' },
        data: { status: target },
      });
      if (claim.count === 1) {
        decided = target;
        if (target === 'APPROVED') {
          await prisma.$transaction([
            prisma.missionSubmission.update({
              where: { id: appeal.submissionId },
              data: { status: 'SUBMITTED' },
            }),
            prisma.team.update({ where: { id: appeal.teamId }, data: { status: 'UNDER_REVIEW' } }),
          ]);
        } else {
          await prisma.$transaction([
            prisma.missionSubmission.update({
              where: { id: appeal.submissionId },
              data: { status: 'FINAL' },
            }),
            prisma.team.update({ where: { id: appeal.teamId }, data: { status: 'REVIEW_FINAL' } }),
          ]);
        }
      } else {
        // Already decided by a concurrent request — reflect the actual outcome.
        const current = await prisma.reviewAppeal.findUnique({
          where: { id: appeal.id },
          select: { status: true },
        });
        decided = current?.status ?? 'OPEN';
      }
    }

    sendData(res, buildAppealView({ ...appeal, votes, status: decided }, memberCount));
  })
);

export default router;

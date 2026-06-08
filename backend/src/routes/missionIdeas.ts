import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../lib/prisma.js';
import { sendData, ApiError } from '../lib/response.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireProfile } from '../middleware/requireProfile.js';

// Visible, unanimous idea voting (Foundation Bible, Phase 4.3).
// All YES -> idea ACCEPTED (team -> CAPTAIN_VOTING). Any NO -> idea REJECTED
// (team stays IDEA_VOTING, awaiting regeneration). A NO requires a controlled
// reject reason; an optional free-text note is allowed.
const router = Router();
router.use(requireAuth, requireProfile);

// Controlled reject reasons (Section 5).
const REJECT_REASONS = [
  'Too technical',
  'Not technical enough',
  'Not interested in industry',
  'Too generic',
  'Too hard for our availability',
  'Too similar to existing products',
  'Weak business potential',
  'Other',
] as const;

const voteSchema = z
  .object({
    vote: z.enum(['YES', 'NO']),
    rejectReason: z.enum(REJECT_REASONS).optional(),
    feedbackNote: z.string().trim().max(500).optional(),
  })
  .refine((d) => d.vote === 'YES' || Boolean(d.rejectReason), {
    message: 'A reject reason is required for a NO vote.',
    path: ['rejectReason'],
  });

// POST /api/mission-ideas/:id/vote — cast/replace this member's vote.
router.post(
  '/:id/vote',
  asyncHandler(async (req, res) => {
    const userId = req.user!.userId;
    const { vote, rejectReason, feedbackNote } = voteSchema.parse(req.body);

    const idea = await prisma.missionIdea.findUnique({
      where: { id: req.params.id },
      include: { team: { include: { members: { where: { leftAt: null } } } } },
    });
    if (!idea) throw new ApiError(404, 'IDEA_NOT_FOUND', 'Mission idea not found.');

    const team = idea.team;
    if (!team.members.some((m) => m.userId === userId)) {
      throw new ApiError(403, 'NOT_TEAM_MEMBER', 'You are not a member of this team.');
    }
    if (team.status !== 'IDEA_VOTING' || idea.status !== 'PROPOSED') {
      throw new ApiError(409, 'VOTING_CLOSED', 'Voting is not open for this idea.');
    }

    await prisma.ideaVote.upsert({
      where: { missionIdeaId_userId: { missionIdeaId: idea.id, userId } },
      create: {
        missionIdeaId: idea.id,
        userId,
        vote,
        rejectReason: vote === 'NO' ? rejectReason : null,
        feedbackNote: feedbackNote ?? null,
      },
      update: {
        vote,
        rejectReason: vote === 'NO' ? rejectReason : null,
        feedbackNote: feedbackNote ?? null,
      },
    });

    // Finalize once every active member has voted.
    const votes = await prisma.ideaVote.findMany({ where: { missionIdeaId: idea.id } });
    let ideaStatus: string = idea.status;
    let teamStatus: string = team.status;

    if (votes.length >= team.members.length) {
      const anyNo = votes.some((v) => v.vote === 'NO');
      if (anyNo) {
        await prisma.missionIdea.update({ where: { id: idea.id }, data: { status: 'REJECTED' } });
        ideaStatus = 'REJECTED';
      } else {
        await prisma.$transaction([
          prisma.missionIdea.update({ where: { id: idea.id }, data: { status: 'ACCEPTED' } }),
          prisma.team.update({ where: { id: team.id }, data: { status: 'CAPTAIN_VOTING' } }),
        ]);
        ideaStatus = 'ACCEPTED';
        teamStatus = 'CAPTAIN_VOTING';
      }
    }

    sendData(res, { ideaStatus, teamStatus, votesCast: votes.length, memberCount: team.members.length });
  })
);

export default router;

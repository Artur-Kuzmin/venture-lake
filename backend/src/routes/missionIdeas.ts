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
//
// The same unanimous vote also approves a follow-up mission proposal while the
// team is CONTINUING (Phase 9.2): all YES starts the second mission
// (team -> MISSION_ACTIVE); any NO rejects it and reopens the continuation vote.
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
    const isFollowUpApproval = team.status === 'CONTINUING';
    if ((team.status !== 'IDEA_VOTING' && !isFollowUpApproval) || idea.status !== 'PROPOSED') {
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
      const decided = anyNo ? 'REJECTED' : 'ACCEPTED';
      // Single-winner latch: only the request that flips the idea out of
      // PROPOSED runs the team/mission side effects. A concurrent deciding vote
      // sees count 0 and skips them; both report the same resolved state.
      const latch = await prisma.missionIdea.updateMany({
        where: { id: idea.id, status: 'PROPOSED' },
        data: { status: decided },
      });
      if (latch.count === 1) {
        if (anyNo && isFollowUpApproval) {
          // Follow-up rejected: drop the draft mission and reopen the
          // continuation vote so the team can re-decide what's next.
          await prisma.$transaction([
            prisma.mission.deleteMany({ where: { missionIdeaId: idea.id } }),
            prisma.continuationVote.deleteMany({ where: { teamId: team.id } }),
            prisma.team.update({ where: { id: team.id }, data: { status: 'CONTINUATION_VOTING' } }),
          ]);
        } else if (!anyNo && isFollowUpApproval) {
          // Unanimous approval: the second mission starts now, for the
          // AI-chosen duration stored on the draft mission.
          const mission = await prisma.mission.findFirst({ where: { missionIdeaId: idea.id } });
          if (!mission) {
            throw new ApiError(409, 'NO_FOLLOW_UP_MISSION', 'The follow-up mission draft is missing.');
          }
          const now = new Date();
          const deadlineAt = new Date(now.getTime() + mission.durationHours * 3600 * 1000);
          await prisma.$transaction([
            prisma.mission.update({
              where: { id: mission.id },
              data: { status: 'ACTIVE', startedAt: now, deadlineAt },
            }),
            prisma.team.update({
              where: { id: team.id },
              data: { status: 'MISSION_ACTIVE', missionStartedAt: now, missionDeadlineAt: deadlineAt },
            }),
          ]);
        } else if (!anyNo) {
          await prisma.team.update({ where: { id: team.id }, data: { status: 'CAPTAIN_VOTING' } });
        }
        // A normal rejection leaves the team in IDEA_VOTING for regeneration.
      }
      ideaStatus = decided;
      if (anyNo) {
        teamStatus = isFollowUpApproval ? 'CONTINUATION_VOTING' : team.status;
      } else {
        teamStatus = isFollowUpApproval ? 'MISSION_ACTIVE' : 'CAPTAIN_VOTING';
      }
    }

    sendData(res, { ideaStatus, teamStatus, votesCast: votes.length, memberCount: team.members.length });
  })
);

export default router;

import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../lib/prisma.js';
import { sendData, ApiError } from '../lib/response.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireProfile } from '../middleware/requireProfile.js';
import { aiClient } from '../lib/aiClient.js';

// Team lobby (Foundation Bible, Phase 4.1). Member list, match explanation, text
// chat, and ready-up. Only active team members can access. Members may leave
// freely before the mission starts; if fewer than 2 remain the team dissolves
// and the remaining members return to the queue.
const router = Router();
router.use(requireAuth, requireProfile);

const MIN_TEAM_SIZE = 2;

function loadTeam(id: string) {
  return prisma.team.findUnique({
    where: { id },
    include: {
      members: {
        where: { leftAt: null },
        orderBy: { joinedAt: 'asc' },
        include: { user: { select: { id: true, displayName: true } } },
      },
    },
  });
}

type LoadedTeam = NonNullable<Awaited<ReturnType<typeof loadTeam>>>;

// Loads the team and asserts the caller is an active member.
async function requireMember(teamId: string, userId: string): Promise<LoadedTeam> {
  const team = await loadTeam(teamId);
  if (!team) throw new ApiError(404, 'TEAM_NOT_FOUND', 'Team not found.');
  if (!team.members.some((m) => m.userId === userId)) {
    throw new ApiError(403, 'NOT_TEAM_MEMBER', 'You are not a member of this team.');
  }
  return team;
}

function serializeTeam(team: LoadedTeam, currentUserId: string) {
  return {
    id: team.id,
    status: team.status,
    captainId: team.captainId,
    matchExplanation: team.matchExplanation,
    missionStartedAt: team.missionStartedAt,
    missionDeadlineAt: team.missionDeadlineAt,
    currentUserId,
    members: team.members.map((m) => ({
      userId: m.userId,
      displayName: m.user.displayName,
      ready: m.ready,
      isCaptain: m.userId === team.captainId,
      joinedAt: m.joinedAt,
    })),
  };
}

// Team detail enriched with the current mission idea (+ visible votes) and the
// number of rejected ideas so far.
async function buildTeamDetail(team: LoadedTeam, currentUserId: string) {
  const [idea, rejectedIdeaCount] = await Promise.all([
    prisma.missionIdea.findFirst({
      where: { teamId: team.id },
      orderBy: { createdAt: 'desc' },
      include: { votes: { include: { user: { select: { id: true, displayName: true } } } } },
    }),
    prisma.missionIdea.count({ where: { teamId: team.id, status: 'REJECTED' } }),
  ]);

  return {
    ...serializeTeam(team, currentUserId),
    rejectedIdeaCount,
    currentIdea: idea
      ? {
          id: idea.id,
          title: idea.title,
          description: idea.description,
          category: idea.category,
          reasoning: idea.reasoning,
          status: idea.status,
          generationNumber: idea.generationNumber,
          createdAt: idea.createdAt,
          votes: idea.votes.map((v) => ({
            userId: v.userId,
            displayName: v.user.displayName,
            vote: v.vote,
            rejectReason: v.rejectReason,
            feedbackNote: v.feedbackNote,
          })),
        }
      : null,
  };
}

// GET /api/teams/:id — team detail (members, ready, match explanation, current idea).
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = req.user!.userId;
    const team = await requireMember(req.params.id, userId);
    sendData(res, await buildTeamDetail(team, userId));
  })
);

// GET /api/teams/:id/messages — lobby chat history (oldest first).
router.get(
  '/:id/messages',
  asyncHandler(async (req, res) => {
    const userId = req.user!.userId;
    await requireMember(req.params.id, userId);
    const messages = await prisma.teamMessage.findMany({
      where: { teamId: req.params.id },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { id: true, displayName: true } } },
    });
    sendData(
      res,
      messages.map((m) => ({
        id: m.id,
        userId: m.userId,
        displayName: m.user.displayName,
        body: m.body,
        createdAt: m.createdAt,
      }))
    );
  })
);

const messageSchema = z.object({ body: z.string().trim().min(1).max(2000) });

// POST /api/teams/:id/messages — post a chat message.
router.post(
  '/:id/messages',
  asyncHandler(async (req, res) => {
    const userId = req.user!.userId;
    await requireMember(req.params.id, userId);
    const { body } = messageSchema.parse(req.body);
    const msg = await prisma.teamMessage.create({
      data: { teamId: req.params.id, userId, body },
      include: { user: { select: { id: true, displayName: true } } },
    });
    sendData(
      res,
      {
        id: msg.id,
        userId: msg.userId,
        displayName: msg.user.displayName,
        body: msg.body,
        createdAt: msg.createdAt,
      },
      201
    );
  })
);

// POST /api/teams/:id/ready — toggle the caller's ready state (lobby only).
router.post(
  '/:id/ready',
  asyncHandler(async (req, res) => {
    const userId = req.user!.userId;
    const team = await requireMember(req.params.id, userId);
    if (team.status !== 'LOBBY') {
      throw new ApiError(409, 'NOT_IN_LOBBY', 'Ready status can only change in the lobby.');
    }
    const me = team.members.find((m) => m.userId === userId)!;
    await prisma.teamMember.update({ where: { id: me.id }, data: { ready: !me.ready } });
    const updated = await loadTeam(team.id);
    sendData(res, serializeTeam(updated!, userId));
  })
);

// POST /api/teams/:id/leave — leave the lobby (no penalty). Dissolves the team
// and returns remaining members to the queue if fewer than 2 remain.
router.post(
  '/:id/leave',
  asyncHandler(async (req, res) => {
    const userId = req.user!.userId;
    const team = await requireMember(req.params.id, userId);
    if (team.status !== 'LOBBY') {
      throw new ApiError(409, 'MISSION_STARTED', 'You cannot leave after the mission has started.');
    }

    const me = team.members.find((m) => m.userId === userId)!;
    const remaining = team.members.filter((m) => m.userId !== userId);

    if (remaining.length < MIN_TEAM_SIZE) {
      // Dissolve: mark everyone left, disband the team, requeue the remaining.
      await prisma.$transaction(async (tx) => {
        const now = new Date();
        await tx.teamMember.update({ where: { id: me.id }, data: { leftAt: now } });
        await tx.team.update({ where: { id: team.id }, data: { status: 'DISBANDED' } });
        for (const m of remaining) {
          await tx.teamMember.update({ where: { id: m.id }, data: { leftAt: now } });
          await tx.queueEntry.create({ data: { userId: m.userId, status: 'QUEUED' } });
        }
      });
      sendData(res, { left: true, dissolved: true, teamStatus: 'DISBANDED' });
      return;
    }

    await prisma.teamMember.update({ where: { id: me.id }, data: { leftAt: new Date() } });
    sendData(res, { left: true, dissolved: false, teamStatus: team.status });
  })
);

// POST /api/teams/:id/generate-idea — generate ONE AI idea, only when all
// members are ready (Phase 4.2). Moves the team to IDEA_VOTING.
router.post(
  '/:id/generate-idea',
  asyncHandler(async (req, res) => {
    const userId = req.user!.userId;
    const team = await requireMember(req.params.id, userId);

    if (team.status !== 'LOBBY') {
      throw new ApiError(409, 'NOT_IN_LOBBY', 'An idea can only be generated from the lobby.');
    }
    if (team.members.length < MIN_TEAM_SIZE) {
      throw new ApiError(409, 'TEAM_TOO_SMALL', 'The team needs at least 2 members.');
    }
    if (!team.members.every((m) => m.ready)) {
      throw new ApiError(409, 'NOT_ALL_READY', 'All members must be ready before generating an idea.');
    }

    const profiles = await prisma.founderProfile.findMany({
      where: { userId: { in: team.members.map((m) => m.userId) } },
    });

    const idea = await aiClient.generateMissionIdea({ profiles });

    await prisma.$transaction([
      prisma.missionIdea.create({
        data: { teamId: team.id, ...idea, status: 'PROPOSED', generationNumber: 1 },
      }),
      prisma.team.update({ where: { id: team.id }, data: { status: 'IDEA_VOTING' } }),
    ]);

    const updated = await loadTeam(team.id);
    sendData(res, await buildTeamDetail(updated!, userId), 201);
  })
);

// POST /api/teams/:id/regenerate-idea — after a rejection, generate a new idea
// using ALL no-vote feedback (Phase 4.3). Team stays in IDEA_VOTING.
router.post(
  '/:id/regenerate-idea',
  asyncHandler(async (req, res) => {
    const userId = req.user!.userId;
    const team = await requireMember(req.params.id, userId);

    if (team.status !== 'IDEA_VOTING') {
      throw new ApiError(409, 'NOT_IN_IDEA_VOTING', 'The team is not voting on an idea.');
    }

    const latest = await prisma.missionIdea.findFirst({
      where: { teamId: team.id },
      orderBy: { createdAt: 'desc' },
    });
    if (!latest) throw new ApiError(409, 'NO_IDEA', 'There is no idea to regenerate.');
    if (latest.status !== 'REJECTED') {
      throw new ApiError(409, 'IDEA_NOT_REJECTED', 'The current idea has not been rejected.');
    }

    const rejectedIdeas = await prisma.missionIdea.findMany({
      where: { teamId: team.id, status: 'REJECTED' },
      include: { votes: { where: { vote: 'NO' } } },
    });
    const feedback = rejectedIdeas.flatMap((ri) =>
      ri.votes.map((v) => ({ rejectReason: v.rejectReason, feedbackNote: v.feedbackNote }))
    );
    const previousIdeas = rejectedIdeas.map((ri) => ({
      title: ri.title,
      description: ri.description,
      category: ri.category,
    }));

    const profiles = await prisma.founderProfile.findMany({
      where: { userId: { in: team.members.map((m) => m.userId) } },
    });
    const generationNumber = (await prisma.missionIdea.count({ where: { teamId: team.id } })) + 1;

    const idea = await aiClient.regenerateMissionIdea({
      profiles,
      previousIdeas,
      feedback,
      generationNumber,
    });

    await prisma.missionIdea.create({
      data: { teamId: team.id, ...idea, status: 'PROPOSED', generationNumber },
    });

    const updated = await loadTeam(team.id);
    sendData(res, await buildTeamDetail(updated!, userId), 201);
  })
);

export default router;

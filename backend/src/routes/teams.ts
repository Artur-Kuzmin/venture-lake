import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../lib/prisma.js';
import { sendData, ApiError } from '../lib/response.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireProfile } from '../middleware/requireProfile.js';

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

// GET /api/teams/:id — team detail (members, ready status, match explanation).
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = req.user!.userId;
    const team = await requireMember(req.params.id, userId);
    sendData(res, serializeTeam(team, userId));
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

export default router;

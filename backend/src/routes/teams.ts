import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';

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
  const [idea, rejectedIdeaCount, mission] = await Promise.all([
    prisma.missionIdea.findFirst({
      where: { teamId: team.id },
      orderBy: { createdAt: 'desc' },
      include: { votes: { include: { user: { select: { id: true, displayName: true } } } } },
    }),
    prisma.missionIdea.count({ where: { teamId: team.id, status: 'REJECTED' } }),
    prisma.mission.findFirst({
      where: { teamId: team.id },
      orderBy: { startedAt: 'desc' },
      include: {
        deliverableAssignments: {
          include: { assignedTo: { select: { id: true, displayName: true } } },
        },
      },
    }),
  ]);

  const deliverables = (mission?.deliverables ?? []) as { title: string; description: string }[];

  return {
    ...serializeTeam(team, currentUserId),
    rejectedIdeaCount,
    mission: mission
      ? {
          id: mission.id,
          title: mission.title,
          brief: mission.brief,
          durationHours: mission.durationHours,
          deliverables,
          assignments: mission.deliverableAssignments.map((a) => ({
            title: a.title,
            description: a.description,
            assignedToId: a.assignedToId,
            assignedToName: a.assignedTo.displayName,
          })),
        }
      : null,
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

// ---- Captain selection (Phase 5.1) --------------------------------------

// Captain-vote state: nominees (active members only) with tallies, the caller's
// own nomination/vote, and the elected captain once a simple majority is reached.
async function buildCaptainVote(team: LoadedTeam, currentUserId: string) {
  const [nominations, votes] = await Promise.all([
    prisma.captainNomination.findMany({
      where: { teamId: team.id },
      include: { user: { select: { id: true, displayName: true } } },
    }),
    prisma.captainVote.findMany({ where: { teamId: team.id } }),
  ]);

  const activeIds = new Set(team.members.map((m) => m.userId));
  const nominees = nominations
    .filter((n) => activeIds.has(n.userId))
    .map((n) => ({
      userId: n.userId,
      displayName: n.user.displayName,
      votes: votes.filter((v) => v.candidateId === n.userId).length,
    }));

  const memberCount = team.members.length;
  return {
    teamStatus: team.status,
    captainId: team.captainId,
    memberCount,
    majorityNeeded: Math.floor(memberCount / 2) + 1,
    nominees,
    myNomination: nominations.some((n) => n.userId === currentUserId),
    myVote: votes.find((v) => v.voterId === currentUserId)?.candidateId ?? null,
  };
}

// POST /api/teams/:id/captain/nominate — the caller self-nominates (idempotent).
router.post(
  '/:id/captain/nominate',
  asyncHandler(async (req, res) => {
    const userId = req.user!.userId;
    const team = await requireMember(req.params.id, userId);
    if (team.status !== 'CAPTAIN_VOTING') {
      throw new ApiError(409, 'NOT_IN_CAPTAIN_VOTING', 'The team is not selecting a captain.');
    }
    if (team.captainId) {
      throw new ApiError(409, 'CAPTAIN_ALREADY_SELECTED', 'A captain has already been selected.');
    }
    await prisma.captainNomination.upsert({
      where: { teamId_userId: { teamId: team.id, userId } },
      create: { teamId: team.id, userId },
      update: {},
    });
    sendData(res, await buildCaptainVote(team, userId), 201);
  })
);

const captainVoteSchema = z.object({ candidateId: z.string().min(1) });

// POST /api/teams/:id/captain/vote — vote for a nominee; simple majority wins.
router.post(
  '/:id/captain/vote',
  asyncHandler(async (req, res) => {
    const userId = req.user!.userId;
    const team = await requireMember(req.params.id, userId);
    if (team.status !== 'CAPTAIN_VOTING') {
      throw new ApiError(409, 'NOT_IN_CAPTAIN_VOTING', 'The team is not selecting a captain.');
    }
    if (team.captainId) {
      throw new ApiError(409, 'CAPTAIN_ALREADY_SELECTED', 'A captain has already been selected.');
    }
    const { candidateId } = captainVoteSchema.parse(req.body);

    const nomination = await prisma.captainNomination.findUnique({
      where: { teamId_userId: { teamId: team.id, userId: candidateId } },
    });
    if (!nomination || !team.members.some((m) => m.userId === candidateId)) {
      throw new ApiError(409, 'NOT_A_NOMINEE', 'You can only vote for a nominee.');
    }

    await prisma.captainVote.upsert({
      where: { teamId_voterId: { teamId: team.id, voterId: userId } },
      create: { teamId: team.id, voterId: userId, candidateId },
      update: { candidateId },
    });

    // Tally; a candidate with a simple majority of active members is elected.
    const votes = await prisma.captainVote.findMany({ where: { teamId: team.id } });
    const counts = new Map<string, number>();
    for (const v of votes) counts.set(v.candidateId, (counts.get(v.candidateId) ?? 0) + 1);
    const majorityNeeded = Math.floor(team.members.length / 2) + 1;
    let electedId: string | null = null;
    for (const [candidate, n] of counts) {
      if (n >= majorityNeeded) {
        electedId = candidate;
        break;
      }
    }
    if (electedId) {
      await prisma.team.update({ where: { id: team.id }, data: { captainId: electedId } });
    }

    const updated = await loadTeam(team.id);
    sendData(res, await buildCaptainVote(updated!, userId));
  })
);

// GET /api/teams/:id/captain-vote — nominees, tallies, and the elected captain.
router.get(
  '/:id/captain-vote',
  asyncHandler(async (req, res) => {
    const userId = req.user!.userId;
    const team = await requireMember(req.params.id, userId);
    sendData(res, await buildCaptainVote(team, userId));
  })
);

// POST /api/teams/:id/generate-deliverables — captain-only. AI-generates the
// deliverables for the accepted idea and creates (or refreshes) the mission
// record that holds them. The mission timer is not started until Phase 5.3.
router.post(
  '/:id/generate-deliverables',
  asyncHandler(async (req, res) => {
    const userId = req.user!.userId;
    const team = await requireMember(req.params.id, userId);

    if (team.status !== 'CAPTAIN_VOTING') {
      throw new ApiError(409, 'NOT_IN_CAPTAIN_VOTING', 'Deliverables are generated during captain setup.');
    }
    if (!team.captainId) {
      throw new ApiError(409, 'NO_CAPTAIN', 'A captain must be selected first.');
    }
    if (team.captainId !== userId) {
      throw new ApiError(403, 'NOT_CAPTAIN', 'Only the captain can generate deliverables.');
    }

    const idea = await prisma.missionIdea.findFirst({
      where: { teamId: team.id, status: 'ACCEPTED' },
      orderBy: { createdAt: 'desc' },
    });
    if (!idea) throw new ApiError(409, 'NO_ACCEPTED_IDEA', 'No accepted mission idea.');

    const profiles = await prisma.founderProfile.findMany({
      where: { userId: { in: team.members.map((m) => m.userId) } },
    });
    const deliverables = await aiClient.generateDeliverables({
      mission: { title: idea.title, brief: idea.description },
      profiles,
    });
    const deliverablesJson = deliverables as unknown as Prisma.InputJsonValue;

    // Mission requires a deadline; use a placeholder until Phase 5.3 starts it.
    const durationHours = 72;
    const now = new Date();
    const deadlineAt = new Date(now.getTime() + durationHours * 3600 * 1000);

    const existing = await prisma.mission.findFirst({
      where: { teamId: team.id },
      orderBy: { startedAt: 'desc' },
    });

    if (existing) {
      // Regenerate: refresh deliverables and clear stale owner assignments.
      await prisma.$transaction([
        prisma.deliverableAssignment.deleteMany({ where: { missionId: existing.id } }),
        prisma.mission.update({
          where: { id: existing.id },
          data: { title: idea.title, brief: idea.description, deliverables: deliverablesJson },
        }),
      ]);
    } else {
      await prisma.mission.create({
        data: {
          teamId: team.id,
          missionIdeaId: idea.id,
          title: idea.title,
          brief: idea.description,
          durationHours,
          deliverables: deliverablesJson,
          status: 'ACTIVE',
          startedAt: now,
          deadlineAt,
        },
      });
    }

    const updated = await loadTeam(team.id);
    sendData(res, await buildTeamDetail(updated!, userId), 201);
  })
);

// POST /api/teams/:id/start-mission — captain-only. Starts the 72-hour mission,
// but only when the idea is accepted, a captain is selected, and every
// deliverable is assigned (Phase 5.3).
router.post(
  '/:id/start-mission',
  asyncHandler(async (req, res) => {
    const userId = req.user!.userId;
    const team = await requireMember(req.params.id, userId);

    if (team.status !== 'CAPTAIN_VOTING') {
      throw new ApiError(409, 'NOT_READY_TO_START', 'The mission cannot start from this state.');
    }
    if (!team.captainId) {
      throw new ApiError(409, 'NO_CAPTAIN', 'A captain must be selected first.');
    }
    if (team.captainId !== userId) {
      throw new ApiError(403, 'NOT_CAPTAIN', 'Only the captain can start the mission.');
    }

    const idea = await prisma.missionIdea.findFirst({
      where: { teamId: team.id, status: 'ACCEPTED' },
    });
    if (!idea) throw new ApiError(409, 'NO_ACCEPTED_IDEA', 'No accepted mission idea.');

    const mission = await prisma.mission.findFirst({
      where: { teamId: team.id },
      orderBy: { startedAt: 'desc' },
      include: { deliverableAssignments: true },
    });
    if (!mission) throw new ApiError(409, 'NO_MISSION', 'Deliverables have not been generated.');

    const deliverables = (mission.deliverables ?? []) as unknown[];
    if (deliverables.length === 0 || mission.deliverableAssignments.length !== deliverables.length) {
      throw new ApiError(
        409,
        'DELIVERABLES_NOT_ASSIGNED',
        'Every deliverable must be assigned before the mission can start.'
      );
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

    const updated = await loadTeam(team.id);
    sendData(res, await buildTeamDetail(updated!, userId));
  })
);

export default router;

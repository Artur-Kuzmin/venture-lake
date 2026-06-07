import { Router } from 'express';

import { prisma } from '../lib/prisma.js';
import { sendData, ApiError } from '../lib/response.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireProfile } from '../middleware/requireProfile.js';

// Party queue (Foundation Bible, Phase 2.2). A party is a 1–5 person group that
// enters the global queue as ONE unit. The party id doubles as the invite code.
// Automatic matchmaking (which must keep parties intact) is wired up in Phase 3.
const router = Router();
router.use(requireAuth, requireProfile);

const MAX_PARTY_SIZE = 5;
const ACTIVE_STATUSES = ['FORMING', 'QUEUED'] as const;

type LoadedParty = NonNullable<Awaited<ReturnType<typeof loadParty>>>;

function loadParty(id: string) {
  return prisma.party.findUnique({
    where: { id },
    include: {
      members: {
        orderBy: { joinedAt: 'asc' },
        include: { user: { select: { id: true, displayName: true } } },
      },
    },
  });
}

// The user's current FORMING/QUEUED party, if any.
async function findActivePartyForUser(userId: string): Promise<string | null> {
  const membership = await prisma.partyMember.findFirst({
    where: { userId, party: { status: { in: [...ACTIVE_STATUSES] } } },
    select: { partyId: true },
  });
  return membership?.partyId ?? null;
}

function serialize(party: LoadedParty, requesterId: string) {
  return {
    id: party.id,
    leaderId: party.leaderId,
    status: party.status,
    createdAt: party.createdAt,
    inviteCode: party.id,
    isLeader: party.leaderId === requesterId,
    members: party.members.map((m) => ({
      userId: m.userId,
      displayName: m.user.displayName,
      isLeader: m.userId === party.leaderId,
    })),
  };
}

// POST /api/party — create a party led by the caller (one active party per user).
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const userId = req.user!.userId;

    if (await findActivePartyForUser(userId)) {
      throw new ApiError(409, 'ALREADY_IN_PARTY', 'You are already in an active party.');
    }

    const created = await prisma.party.create({
      data: { leaderId: userId, members: { create: { userId } } },
    });
    const party = await loadParty(created.id);
    sendData(res, serialize(party!, userId), 201);
  })
);

// GET /api/party/me — the caller's active party, or null.
router.get(
  '/me',
  asyncHandler(async (req, res) => {
    const userId = req.user!.userId;
    const partyId = await findActivePartyForUser(userId);
    if (!partyId) {
      sendData(res, null);
      return;
    }
    const party = await loadParty(partyId);
    sendData(res, party ? serialize(party, userId) : null);
  })
);

// POST /api/party/:id/invite — leader-only; returns the shareable code/link.
router.post(
  '/:id/invite',
  asyncHandler(async (req, res) => {
    const userId = req.user!.userId;
    const party = await loadParty(req.params.id);
    if (!party) throw new ApiError(404, 'PARTY_NOT_FOUND', 'Party not found.');
    if (party.leaderId !== userId) {
      throw new ApiError(403, 'NOT_PARTY_LEADER', 'Only the party leader can invite.');
    }
    if (party.status !== 'FORMING') {
      throw new ApiError(409, 'PARTY_NOT_FORMING', 'The party can no longer take invites.');
    }
    sendData(res, { code: party.id, link: `/lobby?join=${party.id}` });
  })
);

// POST /api/party/:id/join — join a forming party by its invite code (id).
router.post(
  '/:id/join',
  asyncHandler(async (req, res) => {
    const userId = req.user!.userId;
    const party = await loadParty(req.params.id);
    if (!party) throw new ApiError(404, 'PARTY_NOT_FOUND', 'Party not found.');

    // Idempotent if already a member of this party.
    if (party.members.some((m) => m.userId === userId)) {
      sendData(res, serialize(party, userId));
      return;
    }

    if (party.status !== 'FORMING') {
      throw new ApiError(409, 'PARTY_NOT_JOINABLE', 'This party is not accepting members.');
    }
    if (party.members.length >= MAX_PARTY_SIZE) {
      throw new ApiError(409, 'PARTY_FULL', `A party can have at most ${MAX_PARTY_SIZE} members.`);
    }
    if (await findActivePartyForUser(userId)) {
      throw new ApiError(409, 'ALREADY_IN_PARTY', 'You are already in an active party.');
    }

    await prisma.partyMember.create({ data: { partyId: party.id, userId } });
    const updated = await loadParty(party.id);
    sendData(res, serialize(updated!, userId), 201);
  })
);

// POST /api/party/:id/leave — leave the party. Transfers leadership or cancels.
router.post(
  '/:id/leave',
  asyncHandler(async (req, res) => {
    const userId = req.user!.userId;
    const party = await loadParty(req.params.id);
    if (!party) throw new ApiError(404, 'PARTY_NOT_FOUND', 'Party not found.');
    if (!ACTIVE_STATUSES.includes(party.status as (typeof ACTIVE_STATUSES)[number])) {
      throw new ApiError(409, 'PARTY_NOT_ACTIVE', 'This party is no longer active.');
    }

    const membership = party.members.find((m) => m.userId === userId);
    if (!membership) throw new ApiError(409, 'NOT_PARTY_MEMBER', 'You are not in this party.');

    await prisma.partyMember.delete({ where: { id: membership.id } });
    // If the party was queued, cancel the leaver's queue entry.
    if (party.status === 'QUEUED') {
      await prisma.queueEntry.updateMany({
        where: { partyId: party.id, userId, status: 'QUEUED' },
        data: { status: 'CANCELLED' },
      });
    }

    const remaining = party.members.filter((m) => m.userId !== userId);

    if (remaining.length === 0) {
      await prisma.queueEntry.updateMany({
        where: { partyId: party.id, status: 'QUEUED' },
        data: { status: 'CANCELLED' },
      });
      await prisma.party.update({ where: { id: party.id }, data: { status: 'CANCELLED' } });
      sendData(res, null);
      return;
    }

    if (party.leaderId === userId) {
      // Oldest remaining member becomes leader (members are ordered by joinedAt).
      await prisma.party.update({
        where: { id: party.id },
        data: { leaderId: remaining[0].userId },
      });
    }

    const updated = await loadParty(party.id);
    sendData(res, serialize(updated!, userId));
  })
);

// POST /api/party/:id/queue — leader-only; enqueue the whole party as one unit.
router.post(
  '/:id/queue',
  asyncHandler(async (req, res) => {
    const userId = req.user!.userId;
    const party = await loadParty(req.params.id);
    if (!party) throw new ApiError(404, 'PARTY_NOT_FOUND', 'Party not found.');
    if (party.leaderId !== userId) {
      throw new ApiError(403, 'NOT_PARTY_LEADER', 'Only the party leader can queue the party.');
    }
    if (party.status !== 'FORMING') {
      throw new ApiError(409, 'PARTY_NOT_FORMING', 'This party is already queued or matched.');
    }

    const memberIds = party.members.map((m) => m.userId);

    // No member may queue while on cooldown.
    const cooldown = await prisma.queueEntry.findFirst({
      where: { userId: { in: memberIds }, cooldownUntil: { gt: new Date() } },
      orderBy: { cooldownUntil: 'desc' },
      select: { cooldownUntil: true },
    });
    if (cooldown?.cooldownUntil) {
      throw new ApiError(
        409,
        'QUEUE_COOLDOWN',
        `A party member is on cooldown until ${cooldown.cooldownUntil.toISOString()}.`
      );
    }

    // No member may already be sitting in the queue (solo or another party).
    const alreadyQueued = await prisma.queueEntry.findFirst({
      where: { userId: { in: memberIds }, status: 'QUEUED' },
      select: { id: true },
    });
    if (alreadyQueued) {
      throw new ApiError(409, 'MEMBER_ALREADY_QUEUED', 'A party member is already in the queue.');
    }

    await prisma.$transaction([
      prisma.party.update({ where: { id: party.id }, data: { status: 'QUEUED' } }),
      prisma.queueEntry.createMany({
        data: memberIds.map((id) => ({ userId: id, partyId: party.id, status: 'QUEUED' as const })),
      }),
    ]);

    const updated = await loadParty(party.id);
    sendData(res, serialize(updated!, userId));
  })
);

export default router;

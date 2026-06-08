import { Router } from 'express';

import { prisma } from '../lib/prisma.js';
import { sendData, ApiError } from '../lib/response.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireProfile } from '../middleware/requireProfile.js';
import { tryMatchQueue } from '../services/matchmakingEngine.js';

// Global founder queue, solo (Foundation Bible, Section 5 / Phase 2.1).
// The queue is global, not session-specific. A completed founder profile is
// required (enforced by requireProfile). Joining triggers automatic matchmaking
// (Phase 3.2); a matched user is surfaced via matchedTeamId.
const router = Router();
router.use(requireAuth, requireProfile);

// The user's current active queue entry, if any.
function findActiveEntry(userId: string) {
  return prisma.queueEntry.findFirst({
    where: { userId, status: 'QUEUED' },
    orderBy: { queuedAt: 'desc' },
  });
}

// The user's current active team (matched and not yet disbanded/failed/published).
async function findActiveTeamId(userId: string): Promise<string | null> {
  const membership = await prisma.teamMember.findFirst({
    where: {
      userId,
      leftAt: null,
      team: { status: { notIn: ['DISBANDED', 'FAILED', 'PUBLISHED'] } },
    },
    orderBy: { joinedAt: 'desc' },
    select: { teamId: true },
  });
  return membership?.teamId ?? null;
}

// The user's active cooldown expiry (in the future), if any.
async function findActiveCooldown(userId: string): Promise<Date | null> {
  const entry = await prisma.queueEntry.findFirst({
    where: { userId, cooldownUntil: { gt: new Date() } },
    orderBy: { cooldownUntil: 'desc' },
    select: { cooldownUntil: true },
  });
  return entry?.cooldownUntil ?? null;
}

// POST /api/queue/join — enter the global queue (idempotent if already queued).
router.post(
  '/join',
  asyncHandler(async (req, res) => {
    const userId = req.user!.userId;

    const cooldownUntil = await findActiveCooldown(userId);
    if (cooldownUntil) {
      throw new ApiError(
        409,
        'QUEUE_COOLDOWN',
        `You are on cooldown until ${cooldownUntil.toISOString()}.`
      );
    }

    const existing = await findActiveEntry(userId);
    if (!existing) {
      await prisma.queueEntry.create({ data: { userId, status: 'QUEUED' } });
    }

    // Attempt automatic matchmaking now that the user is queued.
    await tryMatchQueue();

    const [entry, matchedTeamId] = await Promise.all([
      findActiveEntry(userId),
      findActiveTeamId(userId),
    ]);
    sendData(res, { entry, matchedTeamId });
  })
);

// POST /api/queue/leave — cancel the active queue entry.
router.post(
  '/leave',
  asyncHandler(async (req, res) => {
    const userId = req.user!.userId;

    const existing = await findActiveEntry(userId);
    if (!existing) {
      throw new ApiError(409, 'NOT_QUEUED', 'You are not currently in the queue.');
    }

    const entry = await prisma.queueEntry.update({
      where: { id: existing.id },
      data: { status: 'CANCELLED' },
    });
    sendData(res, entry);
  })
);

// GET /api/queue/me — the caller's queue state + any active cooldown.
router.get(
  '/me',
  asyncHandler(async (req, res) => {
    const userId = req.user!.userId;
    const [entry, cooldownUntil, matchedTeamId] = await Promise.all([
      findActiveEntry(userId),
      findActiveCooldown(userId),
      findActiveTeamId(userId),
    ]);
    sendData(res, { entry, cooldownUntil, matchedTeamId });
  })
);

// GET /api/queue/status — global pool stats.
router.get(
  '/status',
  asyncHandler(async (_req, res) => {
    const queuedCount = await prisma.queueEntry.count({ where: { status: 'QUEUED' } });
    sendData(res, { queuedCount });
  })
);

export default router;

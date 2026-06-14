import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../lib/prisma.js';
import { sendData, ApiError } from '../lib/response.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireProfile } from '../middleware/requireProfile.js';

// Public showcase (Foundation Bible, Phase 10). The publish decision itself was
// made by the continuation-vote majority (Team.status = PUBLISHED); there is NO
// minimum score — a low final score publishes just the same. Attribution is a
// personal opt-in: each member chooses to show their name or stay hidden, and
// no member can block the publication. The public listing exposes ONLY the
// project name, tagline, short pitch, prototype/demo link, the raw final VC
// score, and the members who opted in — never VC feedback, category breakdowns,
// or anonymous placeholder identities.
const router = Router();

// Cap the public showcase list (most recent first) so it stays bounded.
const SHOWCASE_LIMIT = 60;

// GET /api/showcase — PUBLIC listing of published projects (no auth).
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const projects = await prisma.showcaseProject.findMany({
      where: { isPublic: true },
      orderBy: { publishedAt: 'desc' },
      // Bound the public list to the most recent SHOWCASE_LIMIT projects.
      take: SHOWCASE_LIMIT,
      include: {
        attributions: {
          where: { visible: true },
          include: { user: { select: { displayName: true } } },
        },
      },
    });
    sendData(
      res,
      projects.map((p) => ({
        id: p.id,
        title: p.title,
        tagline: p.tagline,
        shortPitch: p.shortPitch,
        prototypeUrl: p.prototypeUrl,
        finalScore: p.finalScore,
        publishedAt: p.publishedAt,
        contributors: p.attributions.map((a) => a.user.displayName),
      }))
    );
  })
);

// Loads the team and asserts the caller is an active member.
async function requireTeamMember(teamId: string, userId: string) {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      members: {
        where: { leftAt: null },
        include: { user: { select: { id: true, displayName: true } } },
      },
    },
  });
  if (!team) throw new ApiError(404, 'TEAM_NOT_FOUND', 'Team not found.');
  if (!team.members.some((m) => m.userId === userId)) {
    throw new ApiError(403, 'NOT_TEAM_MEMBER', 'You are not a member of this team.');
  }
  return team;
}

// Private (team-facing) view of the team's showcase entry, or null.
async function buildTeamShowcase(teamId: string, currentUserId: string) {
  const project = await prisma.showcaseProject.findFirst({
    where: { teamId },
    include: {
      attributions: { include: { user: { select: { id: true, displayName: true } } } },
    },
  });
  if (!project) return null;
  return {
    id: project.id,
    title: project.title,
    tagline: project.tagline,
    shortPitch: project.shortPitch,
    prototypeUrl: project.prototypeUrl,
    finalScore: project.finalScore,
    isPublic: project.isPublic,
    publishedAt: project.publishedAt,
    attributions: project.attributions.map((a) => ({
      userId: a.userId,
      displayName: a.user.displayName,
      visible: a.visible,
    })),
    myVisible: project.attributions.find((a) => a.userId === currentUserId)?.visible ?? null,
  };
}

// GET /api/showcase/team/:teamId — the team's showcase state (members only).
router.get(
  '/team/:teamId',
  requireAuth,
  requireProfile,
  asyncHandler(async (req, res) => {
    const userId = req.user!.userId;
    await requireTeamMember(req.params.teamId, userId);
    sendData(res, await buildTeamShowcase(req.params.teamId, userId));
  })
);

const publishSchema = z.object({
  title: z.string().trim().min(1).max(120),
  tagline: z.string().trim().min(1).max(160),
  shortPitch: z.string().trim().min(1).max(1000),
  prototypeUrl: z.string().trim().url(),
});

// POST /api/showcase/team/:teamId/publish — create (or update) the public
// showcase entry. Any active member may publish: the majority already decided,
// so no single member (captain included) can gate it.
router.post(
  '/team/:teamId/publish',
  requireAuth,
  requireProfile,
  asyncHandler(async (req, res) => {
    const userId = req.user!.userId;
    const team = await requireTeamMember(req.params.teamId, userId);
    if (team.status !== 'PUBLISHED') {
      throw new ApiError(409, 'NOT_PUBLISH_DECIDED', 'The team has not voted to publish.');
    }
    const input = publishSchema.parse(req.body);

    const submission = await prisma.missionSubmission.findFirst({
      where: { teamId: team.id },
      orderBy: { submittedAt: 'desc' },
      include: { reviews: { where: { status: 'VALID' } } },
    });
    if (!submission || submission.reviews.length === 0) {
      throw new ApiError(409, 'NO_REVIEWED_SUBMISSION', 'There is no reviewed submission to publish.');
    }
    const finalScore =
      submission.reviews.reduce((s, r) => s + r.overallScore, 0) / submission.reviews.length;

    const existing = await prisma.showcaseProject.findFirst({ where: { teamId: team.id } });
    if (existing) {
      await prisma.showcaseProject.update({
        where: { id: existing.id },
        data: { ...input, finalScore },
      });
    } else {
      await prisma.showcaseProject.create({
        data: {
          teamId: team.id,
          missionSubmissionId: submission.id,
          ...input,
          finalScore,
          isPublic: true,
          publishedAt: new Date(),
          // Attribution is a personal opt-in: everyone starts hidden and
          // reveals themselves individually.
          attributions: {
            create: team.members.map((m) => ({ userId: m.userId, visible: false })),
          },
        },
      });
    }
    sendData(res, await buildTeamShowcase(team.id, userId), existing ? 200 : 201);
  })
);

const attributionSchema = z.object({ visible: z.boolean() });

// POST /api/showcase/team/:teamId/attribution — the caller controls ONLY their
// own visibility on the published project.
router.post(
  '/team/:teamId/attribution',
  requireAuth,
  requireProfile,
  asyncHandler(async (req, res) => {
    const userId = req.user!.userId;
    await requireTeamMember(req.params.teamId, userId);
    const { visible } = attributionSchema.parse(req.body);

    const project = await prisma.showcaseProject.findFirst({
      where: { teamId: req.params.teamId },
    });
    if (!project) {
      throw new ApiError(409, 'NOT_PUBLISHED', 'The project has not been published yet.');
    }

    await prisma.showcaseAttribution.upsert({
      where: { showcaseProjectId_userId: { showcaseProjectId: project.id, userId } },
      create: { showcaseProjectId: project.id, userId, visible },
      update: { visible },
    });
    sendData(res, await buildTeamShowcase(req.params.teamId, userId));
  })
);

export default router;

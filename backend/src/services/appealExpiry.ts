import { prisma } from '../lib/prisma.js';

// One-time appeal finalization (Foundation Bible, Phase 8.2).
//  - No appeal within 6h of the first review -> the first review becomes final.
//  - An OPEN appeal without a YES majority within 6h -> expires (REJECTED) and
//    the first review becomes final.
// Finalizing sets MissionSubmission.status = FINAL and Team.status =
// REVIEW_FINAL; rewards/continuation wait for that final score.
export const APPEAL_WINDOW_HOURS = 6;

export async function expireAppealWindows(): Promise<{
  windowsClosed: number;
  appealsExpired: number;
}> {
  const now = new Date();
  const windowOpenedBefore = new Date(now.getTime() - APPEAL_WINDOW_HOURS * 3600 * 1000);

  // 1) Appeal window closed with no appeal started -> first review is final.
  const unappealed = await prisma.missionSubmission.findMany({
    where: {
      status: 'UNDER_REVIEW',
      team: { status: 'APPEAL_WINDOW' },
      appeals: { none: {} },
      reviews: { some: { isAppealReview: false, createdAt: { lt: windowOpenedBefore } } },
    },
    select: { id: true, teamId: true },
  });
  for (const s of unappealed) {
    await prisma.$transaction([
      prisma.missionSubmission.update({ where: { id: s.id }, data: { status: 'FINAL' } }),
      prisma.team.update({ where: { id: s.teamId }, data: { status: 'REVIEW_FINAL' } }),
    ]);
  }

  // 2) OPEN appeals past their 6h vote deadline -> rejected; first review final.
  const expired = await prisma.reviewAppeal.findMany({
    where: { status: 'OPEN', expiresAt: { lt: now } },
    select: { id: true, submissionId: true, teamId: true },
  });
  for (const a of expired) {
    await prisma.$transaction([
      prisma.reviewAppeal.update({ where: { id: a.id }, data: { status: 'REJECTED' } }),
      prisma.missionSubmission.update({ where: { id: a.submissionId }, data: { status: 'FINAL' } }),
      prisma.team.update({ where: { id: a.teamId }, data: { status: 'REVIEW_FINAL' } }),
    ]);
  }

  return { windowsClosed: unappealed.length, appealsExpired: expired.length };
}

export default expireAppealWindows;

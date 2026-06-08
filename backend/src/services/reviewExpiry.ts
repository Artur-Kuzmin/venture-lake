import { prisma } from '../lib/prisma.js';

// Expire VC review assignments not completed within 6 hours of accepting
// (Foundation Bible, Phase 7.4). The assignment becomes EXPIRED (so the
// submission returns to the review queue automatically — it is no longer held by
// an active assignment), and the VC gets a 24-hour review-queue cooldown. The
// same VC never receives that submission again (enforced by the queue's
// "exclude any prior assignment" filter).
const REVIEW_COOLDOWN_HOURS = 24;

export async function expireOverdueReviewAssignments(): Promise<{
  expiredCount: number;
  expiredAssignmentIds: string[];
}> {
  const now = new Date();
  const overdue = await prisma.vCReviewAssignment.findMany({
    where: { status: 'ACCEPTED', deadlineAt: { lt: now } },
    select: { id: true, vcUserId: true },
  });

  const cooldownUntil = new Date(now.getTime() + REVIEW_COOLDOWN_HOURS * 3600 * 1000);
  for (const a of overdue) {
    await prisma.$transaction([
      prisma.vCReviewAssignment.update({ where: { id: a.id }, data: { status: 'EXPIRED' } }),
      prisma.vCProfile.update({ where: { userId: a.vcUserId }, data: { reviewCooldownUntil: cooldownUntil } }),
    ]);
  }

  return { expiredCount: overdue.length, expiredAssignmentIds: overdue.map((a) => a.id) };
}

export default expireOverdueReviewAssignments;

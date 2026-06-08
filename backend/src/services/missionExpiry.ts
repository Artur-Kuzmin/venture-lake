import { prisma } from '../lib/prisma.js';

// Auto-fail missions that pass their 72h deadline without a submission
// (Foundation Bible, Phase 6.2). A mission is only "running" when its team is
// MISSION_ACTIVE — that excludes the placeholder deadline on a not-yet-started
// (draft) mission and any already-submitted mission. No penalty, no grace period.
export async function expireOverdueMissions(): Promise<{
  failedCount: number;
  failedTeamIds: string[];
}> {
  const overdue = await prisma.mission.findMany({
    where: {
      status: 'ACTIVE',
      deadlineAt: { lt: new Date() },
      team: { status: 'MISSION_ACTIVE' },
    },
    select: { id: true, teamId: true },
  });

  for (const m of overdue) {
    await prisma.$transaction([
      prisma.mission.update({ where: { id: m.id }, data: { status: 'FAILED' } }),
      prisma.team.update({ where: { id: m.teamId }, data: { status: 'FAILED' } }),
    ]);
  }

  return { failedCount: overdue.length, failedTeamIds: overdue.map((m) => m.teamId) };
}

export default expireOverdueMissions;
